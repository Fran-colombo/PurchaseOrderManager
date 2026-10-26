from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import AppSetting, ReminderRule, UnitOfMeasure, User
from app.models.enums import UserRole


UNITS = [
    ("m2", "m²"),
    ("m3", "m³"),
    ("ml", "metros lineales"),
    ("un", "unidades"),
    ("hora", "horas"),
    ("global", "global"),
    ("otro", "otra"),
]

RULES = [
    ("antes_30", 30, None, "30 días antes del vencimiento"),
    ("antes_15", 15, None, "15 días antes del vencimiento"),
    ("cliente_7", 7, None, "Avisar al cliente: falta una semana para el vencimiento"),
    ("cliente_1", 1, None, "Avisar al cliente: vence mañana"),
    ("cliente_0", 0, None, "Avisar al cliente: vence hoy"),
    ("despues", None, 7, "Cada 7 días después del vencimiento, mientras siga impago"),
]

LEGACY_RULES = {"antes_7", "el_dia"}


def seed_reference_data(db: Session) -> None:
    if db.query(UnitOfMeasure).count() == 0:
        for code, name in UNITS:
            db.add(UnitOfMeasure(code=code, name=name, is_active=True))
    existing = {rule.code: rule for rule in db.query(ReminderRule).all()}
    if "cliente_7" not in existing:
        for code in LEGACY_RULES & existing.keys():
            existing[code].is_active = False
    for code, days_before, repeat, description in RULES:
        if code not in existing:
            db.add(
                ReminderRule(
                    code=code,
                    days_before=days_before,
                    repeat_every_days=repeat,
                    is_active=True,
                    description=description,
                )
            )
    defaults = {
        "company_name": ("Conkreto", "Nombre de la empresa que se muestra en la aplicación"),
        "upcoming_days": ("30", "Días para considerar una liberación como próxima"),
        "critical_days": ("7", "Días para alertas críticas de vencimiento"),
    }
    for key, (value, description) in defaults.items():
        if db.get(AppSetting, key) is None:
            db.add(AppSetting(key=key, value=value, description=description))
    db.commit()


def ensure_initial_admin(db: Session) -> None:
    settings = get_settings()
    username = settings.initial_admin_username.strip()
    existing = db.query(User).filter(User.username == username).one_or_none()
    if existing:
        return
    if not settings.initial_admin_password:
        raise RuntimeError("Falta INITIAL_ADMIN_PASSWORD para crear el administrador inicial.")
    db.add(
        User(
            username=username,
            email=settings.initial_admin_email.strip(),
            full_name="Administrador inicial",
            hashed_password=hash_password(settings.initial_admin_password),
            role=UserRole.SYSADMIN.value,
            is_active=True,
            token_version=1,
        )
    )
    db.commit()
