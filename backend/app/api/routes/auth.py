from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import AppError
from app.core.security import create_access_token, hash_password, hash_refresh_token, new_refresh_token, verify_password
from app.models import LoginAttempt, RefreshToken, User
from app.schemas.inputs import LoginIn, PasswordChangeIn, ProfileIn, RefreshIn
from app.services.audit import write_audit
from app.services.presenters import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _too_many_attempts(db: Session, identifier: str) -> bool:
    settings = get_settings()
    window = datetime.now(timezone.utc) - timedelta(minutes=settings.login_window_minutes)
    failures = (
        db.query(LoginAttempt)
        .filter(LoginAttempt.username == identifier, LoginAttempt.success.is_(False), LoginAttempt.created_at >= window)
        .count()
    )
    return failures >= settings.login_max_attempts


@router.post("/login")
def login(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    ip = request.client.host if request.client else ""
    if _too_many_attempts(db, email):
        raise AppError("Demasiados intentos fallidos. Esperá unos minutos e intentá de nuevo.", 429, "rate_limited")
    user = db.query(User).filter(func.lower(User.email) == email).one_or_none() if email else None
    if user is None or not user.is_active or not verify_password(data.password, user.hashed_password):
        db.add(LoginAttempt(username=email, success=False, ip_address=ip))
        db.commit()
        raise AppError("Correo o contraseña incorrectos.", 401, "invalid_credentials")
    db.add(LoginAttempt(username=email, success=True, ip_address=ip))
    settings = get_settings()
    raw_refresh = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    write_audit(db, user, "user", user.id, "login")
    return {
        "access_token": create_access_token(user.id, user.token_version),
        "refresh_token": raw_refresh,
        "token_type": "bearer",
        "user": user_out(user),
    }


@router.post("/refresh")
def refresh(data: RefreshIn, db: Session = Depends(get_db)):
    token = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_refresh_token(data.refresh_token)).one_or_none()
    now = datetime.now(timezone.utc)
    session_limit = timedelta(minutes=get_settings().access_token_expire_minutes)
    if token is None or token.revoked or _aware(token.expires_at) < now or _aware(token.created_at) + session_limit < now:
        raise AppError("La sesión venció. Volvé a iniciar sesión.", 401, "unauthorized")
    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise AppError("La sesión venció. Volvé a iniciar sesión.", 401, "unauthorized")
    return {
        "access_token": create_access_token(user.id, user.token_version),
        "refresh_token": data.refresh_token,
        "token_type": "bearer",
        "user": user_out(user),
    }


@router.post("/logout")
def logout(data: RefreshIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    token = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_refresh_token(data.refresh_token), RefreshToken.user_id == user.id)
        .one_or_none()
    )
    if token:
        token.revoked = True
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.put("/me")
def update_me(data: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        taken = db.query(User).filter(User.email == data.email, User.id != user.id).first()
        if taken:
            raise AppError("Ese correo ya está usado.", 409, "duplicate_email")
        user.email = data.email
    write_audit(db, user, "user", user.id, "editar_perfil")
    return user_out(user)


@router.post("/change-password")
def change_password(data: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.hashed_password):
        raise AppError("La contraseña actual no es correcta.", 400, "invalid_password")
    user.hashed_password = hash_password(data.new_password)
    user.token_version += 1
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    write_audit(db, user, "user", user.id, "cambiar_contraseña")
    return {"ok": True, "detail": "La contraseña se cambió. Volvé a iniciar sesión."}
