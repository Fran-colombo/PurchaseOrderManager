import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import Document, User
from app.services.audit import write_audit

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".xlsx", ".xls", ".csv", ".doc", ".docx", ".txt"}
ALLOWED_ENTITIES = {
    "client",
    "project",
    "purchase_order",
    "certificate",
    "adjustment",
    "payment",
    "claim",
    "milestone",
    "retention",
}


def save_document(db: Session, user: User, entity_type: str, entity_id: int, upload: UploadFile) -> Document:
    if entity_type not in ALLOWED_ENTITIES:
        raise AppError("No se pueden adjuntar archivos a ese tipo de registro.", code="invalid_entity")
    original = Path(upload.filename or "archivo").name
    extension = Path(original).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise AppError("Ese tipo de archivo no está permitido.", code="invalid_file")
    content = upload.file.read()
    settings = get_settings()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise AppError(f"El archivo supera el máximo de {settings.max_upload_mb} MB.", code="file_too_large")
    if not content:
        raise AppError("El archivo está vacío.", code="empty_file")
    directory = Path(settings.upload_dir)
    directory.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex}{extension}"
    target = (directory / stored).resolve()
    if directory.resolve() not in target.parents:
        raise AppError("No se pudo guardar el archivo.", code="invalid_path")
    target.write_bytes(content)
    document = Document(
        entity_type=entity_type,
        entity_id=entity_id,
        original_name=original,
        stored_name=stored,
        content_type=upload.content_type or "application/octet-stream",
        size_bytes=len(content),
        uploaded_by_id=user.id,
    )
    db.add(document)
    db.flush()
    write_audit(db, user, "document", document.id, "crear", new={"name": original, "entity_type": entity_type, "entity_id": entity_id})
    return document


def document_path(document: Document) -> Path:
    settings = get_settings()
    root = Path(settings.upload_dir).resolve()
    target = (root / document.stored_name).resolve()
    if root not in target.parents or not target.is_file():
        raise AppError("No se encontró el archivo.", 404, "not_found")
    return target
