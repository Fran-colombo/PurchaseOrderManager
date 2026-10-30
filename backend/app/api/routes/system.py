from datetime import date

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_or_404, require_sysadmin
from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import AppError
from app.core.security import hash_password
from app.models import AppSetting, AuditLog, Document, EmailLog, RefreshToken, Reminder, ReminderRule, User
from app.models.enums import UserRole
from app.schemas.inputs import ContactIn, ReminderRuleIn, SettingIn, UserIn, UserUpdate
from app.services.audit import write_audit
from app.services.contact import build_contact
from app.services.exports import export_table
from app.services.files import document_path, save_document
from app.services.insights import REPORTS, build_dashboard, build_report, global_search, search_audit, sync_reminders
from app.services.mailer import MailError, send_email
from app.services.notifier import email_notice, pending_client_notices, record_contact
from app.services.presenters import document_out, reminder_out, user_out
from app.services.workflow import active_admin_count, guard_last_admin

router = APIRouter(tags=["sistema"])


@router.get("/dashboard/summary")
def dashboard(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return build_dashboard(db)


@router.get("/search")
def search(q: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not q.strip():
        return []
    return global_search(db, q)


@router.get("/calendar")
def calendar(start: date, end: date, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models import Certificate, Claim, Retention
    from app.models.enums import CertificateStatus

    events = []
    retentions = db.query(Retention).filter(Retention.expected_release_date.is_not(None)).all()
    for retention in retentions:
        if retention.expected_release_date and start <= retention.expected_release_date <= end:
            events.append(
                {
                    "date": retention.expected_release_date.isoformat(),
                    "kind": "liberacion_caucion",
                    "title": f"Liberación de caución {retention.certificate.client_number if retention.certificate else retention.id}",
                    "amount": str(retention.pending_amount),
                    "path": f"/retenciones/{retention.id}",
                }
            )
    certificates = db.query(Certificate).filter(Certificate.payment_due_date.is_not(None), Certificate.status != CertificateStatus.VOIDED.value).all()
    for cert in certificates:
        if cert.payment_due_date and start <= cert.payment_due_date <= end:
            events.append(
                {
                    "date": cert.payment_due_date.isoformat(),
                    "kind": "vencimiento_certificado",
                    "title": f"Vencimiento certificado {cert.client_number}",
                    "amount": str(cert.net_amount),
                    "path": f"/certificados/{cert.id}",
                }
            )
    claims = db.query(Claim).all()
    for claim in claims:
        if claim.promised_payment_date and start <= claim.promised_payment_date <= end:
            events.append(
                {
                    "date": claim.promised_payment_date.isoformat(),
                    "kind": "pago_prometido",
                    "title": "Fecha prometida de un reclamo",
                    "amount": str(claim.amount_claimed),
                    "path": f"/reclamos/{claim.id}",
                }
            )
        if claim.next_followup_date and start <= claim.next_followup_date <= end:
            events.append(
                {
                    "date": claim.next_followup_date.isoformat(),
                    "kind": "seguimiento",
                    "title": "Seguimiento de reclamo",
                    "amount": str(claim.amount_claimed),
                    "path": f"/reclamos/{claim.id}",
                }
            )
    events.sort(key=lambda item: item["date"])
    return events


@router.get("/reports")
def report_catalog(_: User = Depends(get_current_user)):
    return [{"name": key, "title": title} for key, title in REPORTS.items()]


@router.get("/reports/{name}")
def report(name: str, client_id: int | None = None, project_id: int | None = None, purchase_order_id: int | None = None, status: str = "", retention_status: str = "", currency: str = "", date_from: date | None = None, date_to: date | None = None, due_before: date | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    filters = {
        "client_id": client_id,
        "project_id": project_id,
        "purchase_order_id": purchase_order_id,
        "status": status or None,
        "retention_status": retention_status or None,
        "currency": currency or None,
        "date_from": date_from,
        "date_to": date_to,
        "due_before": due_before,
    }
    return build_report(db, name, filters)


@router.get("/reports/{name}/export")
def export_report(name: str, format: str = "csv", client_id: int | None = None, project_id: int | None = None, purchase_order_id: int | None = None, status: str = "", retention_status: str = "", currency: str = "", date_from: date | None = None, date_to: date | None = None, due_before: date | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    filters = {
        "client_id": client_id,
        "project_id": project_id,
        "purchase_order_id": purchase_order_id,
        "status": status or None,
        "retention_status": retention_status or None,
        "currency": currency or None,
        "date_from": date_from,
        "date_to": date_to,
        "due_before": due_before,
    }
    payload = build_report(db, name, filters)
    content, media, filename = export_table(payload, format)
    return Response(content=content, media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def _reminder_with_contact(db: Session, row: Reminder) -> dict:
    data = reminder_out(row)
    data["contact"] = build_contact(db, row)
    return data


@router.get("/reminders")
def list_reminders(status: str = "", db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    sync_reminders(db)
    query = db.query(Reminder)
    if status:
        query = query.filter(Reminder.status == status)
    return [_reminder_with_contact(db, row) for row in query.order_by(Reminder.created_at.desc()).limit(100).all()]


@router.get("/reminders/client-notices")
def client_notices(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    result = []
    for row, contact in pending_client_notices(db):
        data = reminder_out(row)
        data["contact"] = contact
        result.append(data)
    return result


@router.post("/reminders/{reminder_id}/contacted")
def reminder_contacted(reminder_id: int, data: ContactIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    reminder = get_or_404(db, Reminder, reminder_id, "No se encontró el recordatorio.")
    channel = {"whatsapp": "WhatsApp", "email": "correo"}.get(data.channel, data.channel)
    record_contact(db, reminder, user, data.channel, data.notes or f"Aviso de vencimiento enviado al cliente por {channel}")
    return _reminder_with_contact(db, reminder)


@router.post("/reminders/{reminder_id}/send-email")
def reminder_send_email(reminder_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not get_settings().email_enabled:
        raise AppError("El envío de correos desde el sistema no está configurado.", 400, "email_disabled")
    reminder = get_or_404(db, Reminder, reminder_id, "No se encontró el recordatorio.")
    contact = build_contact(db, reminder)
    if contact is None:
        raise AppError("Este aviso ya no corresponde: está pagado o no tiene vencimiento.", 409, "notice_closed")
    if not contact["email"]:
        raise AppError("El cliente no tiene correo cargado. Completalo en su ficha.", 400, "missing_email")
    try:
        email_notice(db, reminder, contact, user)
    except MailError as exc:
        db.commit()
        raise AppError(str(exc), 502, "email_failed") from exc
    return _reminder_with_contact(db, reminder)


@router.post("/reminders/sync")
def sync(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    created = sync_reminders(db)
    return {"created": created}


@router.post("/reminders/{reminder_id}/seen")
def see_reminder(reminder_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models.base import utcnow

    reminder = get_or_404(db, Reminder, reminder_id, "No se encontró el recordatorio.")
    if reminder.status == "pendiente":
        reminder.status = "visto"
        reminder.seen_at = utcnow()
    return reminder_out(reminder)


@router.post("/reminders/{reminder_id}/managed")
def manage_reminder(reminder_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models.base import utcnow

    reminder = get_or_404(db, Reminder, reminder_id, "No se encontró el recordatorio.")
    reminder.status = "gestionado"
    reminder.managed_at = utcnow()
    return reminder_out(reminder)


@router.get("/reminder-rules")
def list_rules(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [
        {
            "id": rule.id,
            "code": rule.code,
            "days_before": rule.days_before,
            "repeat_every_days": rule.repeat_every_days,
            "is_active": rule.is_active,
            "description": rule.description,
        }
        for rule in db.query(ReminderRule).all()
    ]


@router.put("/reminder-rules/{rule_id}")
def update_rule(rule_id: int, data: ReminderRuleIn, db: Session = Depends(get_db), user: User = Depends(require_sysadmin)):
    rule = get_or_404(db, ReminderRule, rule_id, "No se encontró la regla.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    write_audit(db, user, "reminder_rule", rule.id, "editar")
    return {"id": rule.id, "code": rule.code, "days_before": rule.days_before, "repeat_every_days": rule.repeat_every_days, "is_active": rule.is_active}


@router.get("/documents")
def list_documents(entity_type: str = "", entity_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(Document)
    if entity_type:
        query = query.filter(Document.entity_type == entity_type)
    if entity_id:
        query = query.filter(Document.entity_id == entity_id)
    return [document_out(row) for row in query.order_by(Document.uploaded_at.desc()).all()]


@router.post("/documents")
def upload_document(entity_type: str = Form(...), entity_id: int = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return document_out(save_document(db, user, entity_type, entity_id, file))


@router.get("/documents/{document_id}/download")
def download_document(document_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    document = get_or_404(db, Document, document_id, "No se encontró el documento.")
    path = document_path(document)
    return FileResponse(path, filename=document.original_name, media_type=document.content_type)


@router.delete("/documents/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    document = get_or_404(db, Document, document_id, "No se encontró el documento.")
    path = None
    try:
        path = document_path(document)
    except AppError:
        path = None
    db.delete(document)
    write_audit(db, user, "document", document_id, "eliminar", reason="Eliminación del adjunto")
    if path and path.exists():
        path.unlink()
    return {"ok": True}


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_sysadmin)):
    return [user_out(user) for user in db.query(User).order_by(User.username).all()]


@router.post("/users")
def create_user(data: UserIn, db: Session = Depends(get_db), actor: User = Depends(require_sysadmin)):
    if db.query(User).filter(User.username == data.username).first():
        raise AppError("Ese nombre de usuario ya existe.", 409, "duplicate_user")
    if db.query(User).filter(User.email == data.email).first():
        raise AppError("Ese correo ya está usado.", 409, "duplicate_email")
    user = User(
        username=data.username.strip(),
        email=str(data.email),
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=data.role,
        is_active=data.is_active,
    )
    db.add(user)
    db.flush()
    write_audit(db, actor, "user", user.id, "crear", new={"username": user.username, "role": user.role})
    return user_out(user)


@router.put("/users/{user_id}")
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db), actor: User = Depends(require_sysadmin)):
    user = get_or_404(db, User, user_id, "No se encontró el usuario.")
    payload = data.model_dump(exclude_unset=True)
    guard_last_admin(db, user, payload.get("role"), payload.get("is_active"))
    if "email" in payload and payload["email"]:
        user.email = str(payload["email"])
    if "full_name" in payload and payload["full_name"] is not None:
        user.full_name = payload["full_name"]
    if "role" in payload and payload["role"]:
        if actor.role != UserRole.SYSADMIN.value:
            raise AppError("No puede cambiar roles.", 403, "forbidden")
        user.role = payload["role"]
    if "is_active" in payload and payload["is_active"] is not None:
        user.is_active = payload["is_active"]
        if not user.is_active:
            user.token_version += 1
            db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    if payload.get("password"):
        user.hashed_password = hash_password(payload["password"])
        user.token_version += 1
        db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    write_audit(db, actor, "user", user.id, "editar", new={"role": user.role, "is_active": user.is_active})
    return user_out(user)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), actor: User = Depends(require_sysadmin)):
    user = get_or_404(db, User, user_id, "No se encontró el usuario.")
    guard_last_admin(db, user, "normal", False)
    if db.query(AuditLog).filter(AuditLog.user_id == user.id).count():
        raise AppError("El usuario tiene historia de auditoría. Desactivalo en lugar de borrarlo.", 409, "has_dependencies")
    if active_admin_count(db, exclude_id=user.id) <= 0 and user.role == UserRole.SYSADMIN.value:
        raise AppError("No se puede eliminar al último administrador activo.", 409, "last_admin")
    db.delete(user)
    write_audit(db, actor, "user", user_id, "eliminar")
    return {"ok": True}


@router.get("/settings")
def list_settings(db: Session = Depends(get_db), _: User = Depends(require_sysadmin)):
    return [{"key": row.key, "value": row.value, "description": row.description} for row in db.query(AppSetting).all()]


@router.put("/settings/{key}")
def update_setting(key: str, data: SettingIn, db: Session = Depends(get_db), user: User = Depends(require_sysadmin)):
    row = db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value=data.value, description="")
        db.add(row)
    else:
        row.value = data.value
    write_audit(db, user, "setting", key, "editar", new={"value": data.value})
    return {"key": key, "value": data.value}


@router.get("/settings/email")
def email_status(db: Session = Depends(get_db), _: User = Depends(require_sysadmin)):
    settings = get_settings()
    logs = db.query(EmailLog).order_by(EmailLog.created_at.desc()).limit(20).all()
    return {
        "enabled": settings.email_enabled,
        "auto_send": settings.notices_auto_send,
        "host": settings.smtp_host,
        "port": settings.smtp_port,
        "from_address": settings.smtp_from,
        "from_name": settings.smtp_from_name,
        "bcc": settings.smtp_bcc,
        "send_hour": settings.notices_send_hour,
        "send_until_hour": settings.notices_send_until_hour,
        "check_minutes": settings.notices_check_minutes,
        "recent": [
            {
                "id": row.id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "to_address": row.to_address,
                "subject": row.subject,
                "status": row.status,
                "automatic": row.automatic,
                "error": row.error,
            }
            for row in logs
        ],
    }


@router.post("/settings/email/test")
def email_test(db: Session = Depends(get_db), user: User = Depends(require_sysadmin)):
    try:
        send_email(user.email, "Prueba de correo · Conkreto", "Este es un correo de prueba. Si lo recibiste, el envío automático de avisos está bien configurado.")
    except MailError as exc:
        db.add(EmailLog(to_address=user.email, subject="Prueba de correo", status="error", error=str(exc)))
        db.commit()
        raise AppError(str(exc), 502, "email_failed") from exc
    db.add(EmailLog(to_address=user.email, subject="Prueba de correo", status="enviado"))
    return {"ok": True, "detail": f"Correo de prueba enviado a {user.email}."}


@router.get("/audit")
def audit(entity_type: str = "", page: int = 1, page_size: int = 50, db: Session = Depends(get_db), _: User = Depends(require_sysadmin)):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    rows, total = search_audit(db, entity_type or None, page_size, (page - 1) * page_size)
    return {
        "items": [
            {
                "id": row.id,
                "user_id": row.user_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "action": row.action,
                "old_values": row.old_values,
                "new_values": row.new_values,
                "reason": row.reason,
                "impact": row.impact,
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/meta")
def meta(_: User = Depends(get_current_user)):
    settings = get_settings()
    return {
        "email_enabled": settings.email_enabled,
        "email_auto_send": settings.email_enabled and settings.notices_auto_send,
        "currencies": ["ARS", "USD"],
        "retention_bases": [
            {"value": "solo_base", "label": "Solo importe base certificado"},
            {"value": "base_mas_cac_aprobado", "label": "Base más reajustes CAC aprobados"},
            {"value": "bruto_total", "label": "Importe bruto total"},
            {"value": "personalizada", "label": "Base personalizada"},
        ],
        "retention_concepts": [
            {"value": "base", "label": "Importe base"},
            {"value": "cac_aprobado", "label": "CAC aprobado"},
            {"value": "cac", "label": "CAC registrado"},
            {"value": "otros", "label": "Otros conceptos"},
        ],
        "release_triggers": [
            {"value": "finalizacion_obra", "label": "Finalización de toda la obra"},
            {"value": "finalizacion_orden", "label": "Finalización de la orden de compra"},
            {"value": "finalizacion_alcance", "label": "Finalización de un conjunto de trabajos"},
            {"value": "fecha_contractual", "label": "Fecha contractual específica"},
            {"value": "fecha_certificado", "label": "Fecha del certificado, solo si el contrato lo dice"},
        ],
        "certificate_statuses": ["borrador", "presentado", "aprobado", "facturado", "parcialmente_pagado", "pagado", "observado", "anulado"],
        "project_statuses": ["planificacion", "en_ejecucion", "finalizada", "suspendida", "cancelada"],
        "adjustment_statuses": ["calculado", "presentado", "aprobado", "facturado", "pagado", "rechazado", "anulado", "reemplazado"],
        "claim_statuses": ["pendiente_de_reclamar", "reclamo_enviado", "en_seguimiento", "fecha_de_pago_prometida", "parcialmente_recuperado", "recuperado", "en_disputa", "anulado"],
        "channels": ["correo", "whatsapp", "telefono", "nota_formal", "otro"],
        "payment_methods": ["Transferencia", "E-cheq", "Cheque", "Efectivo", "Otro"],
        "payment_concepts": [
            {"value": "neto_certificado", "label": "Neto del certificado"},
            {"value": "devolucion_caucion", "label": "Devolución de caución"},
            {"value": "otro", "label": "Otro"},
        ],
    }
