import re
from datetime import date
from decimal import Decimal
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.models import AppSetting, Certificate, Client, Reminder, Retention
from app.services.ledger import collected_amount
from app.services.money import money


def is_client_reminder(reminder: Reminder) -> bool:
    return (reminder.rule_code or "").startswith("cliente_")


def format_amount(value, currency: str) -> str:
    text = f"{money(value):,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    symbol = "US$" if currency == "USD" else "$"
    return f"{symbol} {text}"


def whatsapp_number(phone: str) -> str:
    """Normaliza un teléfono argentino al formato de wa.me (549 + área + número)."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if not digits:
        return ""
    if digits.startswith("54"):
        return digits
    return "549" + digits.lstrip("0")


def _deadline(verb_future: str, verb_past: str, due: date, today: date) -> str:
    days = (due - today).days
    when = due.strftime("%d/%m/%Y")
    if days < 0:
        return f"{verb_past} el {when}"
    if days == 0:
        return f"{verb_future} hoy, {when}"
    if days == 1:
        return f"{verb_future} mañana, {when}"
    return f"{verb_future} en {days} días, el {when}"


def build_contact(db: Session, reminder: Reminder, today: date | None = None) -> dict | None:
    if not is_client_reminder(reminder) or reminder.due_date is None:
        return None
    today = today or date.today()
    company_row = db.get(AppSetting, "company_name")
    company = company_row.value if company_row and company_row.value else "Conkreto"

    if reminder.entity_type == "certificate":
        cert = db.get(Certificate, reminder.entity_id)
        if cert is None:
            return None
        po = cert.purchase_order
        client = po.client if po else None
        pending = abs(money(cert.net_amount)) - collected_amount(db, cert.id)
        subject = f"Recordatorio de pago · Certificado N.º {cert.client_number}"
        context = f"el certificado N.º {cert.client_number} (obra {po.project.name if po else ''}, OC {po.client_po_number if po else ''})"
        body = (
            f"el pago de {context} {_deadline('vence', 'venció', reminder.due_date, today)}. "
            f"El saldo pendiente es de {format_amount(pending, cert.currency)}. "
            "¿Nos confirmás la fecha de pago?"
        )
    elif reminder.entity_type == "retention":
        retention = db.get(Retention, reminder.entity_id)
        if retention is None:
            return None
        cert = retention.certificate
        po = cert.purchase_order if cert else None
        client = db.get(Client, retention.client_id)
        pending = money(retention.pending_amount)
        currency = cert.currency if cert else reminder.currency
        number = cert.client_number if cert else str(retention.id)
        subject = f"Recordatorio de devolución de caución · Certificado N.º {number}"
        context = f"el certificado N.º {number} (obra {po.project.name if po else ''}, OC {po.client_po_number if po else ''})"
        body = (
            f"la caución (fondo de reparo) retenida en {context} "
            f"{_deadline('se libera', 'se liberó', reminder.due_date, today)}. "
            f"El importe a devolver es de {format_amount(pending, currency)}. "
            "¿Nos confirmás cuándo la van a transferir?"
        )
    else:
        return None

    if pending <= Decimal("0.01"):
        return None
    greeting = f"Hola {client.contact_name}" if client and client.contact_name else "Hola"
    message = f"{greeting}, ¿cómo estás? Te escribimos de {company} para recordarte que {body} ¡Muchas gracias!"
    phone = whatsapp_number(client.phone if client else "")
    email = (client.email if client else "") or ""
    return {
        "client_id": client.id if client else None,
        "client_name": client.legal_name if client else "",
        "contact_name": client.contact_name if client else "",
        "email": email,
        "phone": client.phone if client else "",
        "subject": subject,
        "message": message,
        "whatsapp_url": f"https://wa.me/{phone}?text={quote(message)}" if phone else f"https://wa.me/?text={quote(message)}",
        "mailto_url": f"mailto:{quote(email, safe='@.+')}?subject={quote(subject)}&body={quote(message)}",
    }
