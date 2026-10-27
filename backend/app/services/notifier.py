import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import EmailLog, Reminder, User
from app.models.base import utcnow
from app.services.audit import write_audit
from app.services.contact import build_contact
from app.services.insights import sync_reminders
from app.services.mailer import MailError, send_email

logger = logging.getLogger("conkreto.notices")

MAX_AUTO_FAILURES = 3


def _close(reminder: Reminder) -> None:
    reminder.status = "gestionado"
    reminder.seen_at = reminder.seen_at or utcnow()
    reminder.managed_at = utcnow()


def pending_client_notices(db: Session) -> list[tuple[Reminder, dict]]:
    """Avisos al cliente pendientes, uno por certificado o caución (el más reciente)."""
    sync_reminders(db)
    rows = (
        db.query(Reminder)
        .filter(Reminder.rule_code.like("cliente_%"), Reminder.status != "gestionado")
        .order_by(Reminder.id.desc())
        .all()
    )
    seen: set[tuple[str, int]] = set()
    result = []
    for row in rows:
        key = (row.entity_type, row.entity_id)
        contact = build_contact(db, row)
        if contact is None or key in seen:
            _close(row)
            continue
        seen.add(key)
        result.append((row, contact))
    result.sort(key=lambda item: (item[0].due_date, -item[0].id))
    return result


def record_contact(db: Session, reminder: Reminder, user: User | None, channel: str, reason: str) -> None:
    _close(reminder)
    write_audit(
        db,
        user,
        reminder.entity_type,
        reminder.entity_id,
        "aviso_cliente",
        new={"canal": channel, "recordatorio": reminder.title},
        reason=reason,
    )


def email_notice(db: Session, reminder: Reminder, contact: dict, user: User | None = None) -> None:
    """Envía el aviso por correo desde el servidor. Lanza MailError si falla."""
    automatic = user is None
    to = contact["email"]
    try:
        send_email(to, contact["subject"], contact["message"])
    except MailError as exc:
        db.add(EmailLog(reminder_id=reminder.id, to_address=to, subject=contact["subject"], status="error", automatic=automatic, error=str(exc)))
        raise
    db.add(EmailLog(reminder_id=reminder.id, to_address=to, subject=contact["subject"], status="enviado", automatic=automatic))
    reason = f"Aviso de vencimiento enviado automáticamente por correo a {to}" if automatic else f"Aviso de vencimiento enviado por correo a {to}"
    record_contact(db, reminder, user, "email_automatico" if automatic else "email", reason)


def in_send_window(now: datetime | None = None) -> bool:
    settings = get_settings()
    hour = (now or datetime.now()).hour
    return settings.notices_send_hour <= hour < settings.notices_send_until_hour


def run_auto_notices(db: Session, now: datetime | None = None) -> dict:
    settings = get_settings()
    summary = {"sent": 0, "failed": 0, "skipped": 0}
    if not settings.email_enabled or not settings.notices_auto_send or not in_send_window(now):
        return summary
    for reminder, contact in pending_client_notices(db):
        if not contact["email"]:
            summary["skipped"] += 1
            continue
        failures = db.query(EmailLog).filter(EmailLog.reminder_id == reminder.id, EmailLog.status == "error").count()
        if failures >= MAX_AUTO_FAILURES:
            summary["skipped"] += 1
            continue
        try:
            email_notice(db, reminder, contact)
            summary["sent"] += 1
        except MailError as exc:
            logger.warning("No se pudo enviar el aviso %s a %s: %s", reminder.id, contact["email"], exc)
            summary["failed"] += 1
        db.commit()
    db.commit()
    return summary
