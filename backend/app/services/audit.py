from sqlalchemy.orm import Session

from app.models import AuditLog, User
from app.services.serialize import jsonable


def write_audit(
    db: Session,
    user: User | None,
    entity_type: str,
    entity_id: int | str,
    action: str,
    old: dict | None = None,
    new: dict | None = None,
    reason: str = "",
    impact: str = "",
) -> AuditLog:
    entry = AuditLog(
        user_id=user.id if user else None,
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
        old_values=jsonable(old) if old is not None else None,
        new_values=jsonable(new) if new is not None else None,
        reason=reason or "",
        impact=impact or "",
    )
    db.add(entry)
    return entry
