import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.core.config import get_settings


class MailError(Exception):
    pass


def send_email(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    if not settings.email_enabled:
        raise MailError("El envío de correos no está configurado (faltan SMTP_HOST o SMTP_FROM).")

    message = EmailMessage()
    message["From"] = formataddr((settings.smtp_from_name, settings.smtp_from))
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=settings.smtp_from.split("@")[-1])
    if settings.smtp_reply_to:
        message["Reply-To"] = settings.smtp_reply_to
    message.set_content(body)

    recipients = [to] + [address.strip() for address in settings.smtp_bcc.split(",") if address.strip()]
    security = settings.smtp_security.lower()
    context = ssl.create_default_context()
    try:
        if security == "ssl":
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20, context=context)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
        with server:
            if security == "starttls":
                server.starttls(context=context)
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message, to_addrs=recipients)
    except smtplib.SMTPAuthenticationError as exc:
        raise MailError("El servidor de correo rechazó el usuario o la contraseña (SMTP_USERNAME / SMTP_PASSWORD).") from exc
    except smtplib.SMTPRecipientsRefused as exc:
        raise MailError(f"El servidor de correo rechazó la dirección {to}.") from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise MailError(f"No se pudo enviar el correo: {exc}") from exc
