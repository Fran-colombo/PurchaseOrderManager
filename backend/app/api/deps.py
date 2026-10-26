from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.models import User
from app.models.enums import UserRole

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError("Tenés que iniciar sesión.", 401, "unauthorized")
    try:
        payload = decode_access_token(credentials.credentials)
    except Exception as exc:
        raise AppError("La sesión no es válida o venció.", 401, "unauthorized") from exc
    if payload.get("type") != "access":
        raise AppError("La sesión no es válida o venció.", 401, "unauthorized")
    user = db.get(User, int(payload.get("sub", 0)))
    if user is None or not user.is_active or user.token_version != payload.get("tv"):
        raise AppError("La sesión no es válida o el usuario está desactivado.", 401, "unauthorized")
    return user


def require_sysadmin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.SYSADMIN.value:
        raise AppError("No tiene permiso para esta operación.", 403, "forbidden")
    return user


def get_or_404(db: Session, model, identifier: int, message: str):
    row = db.get(model, identifier)
    if row is None:
        raise AppError(message, 404, "not_found")
    return row
