from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api.routes import auth, catalog, finance, system
from app.core.config import get_settings
from app.core.database import SessionLocal, engine
from app.core.errors import AppError
from app.models import Base
from app.services.seed import ensure_initial_admin, seed_reference_data

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        seed_reference_data(db)
        ensure_initial_admin(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Conkreto", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(finance.router, prefix="/api")
app.include_router(system.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "code": exc.code, "details": exc.details})


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "Revisá los datos del formulario.", "code": "validation", "errors": exc.errors()},
    )


@app.exception_handler(IntegrityError)
async def integrity_handler(_: Request, _exc: IntegrityError):
    return JSONResponse(
        status_code=409,
        content={"detail": "El registro entra en conflicto con otro dato ya cargado.", "code": "conflict"},
    )


@app.exception_handler(Exception)
async def unexpected_handler(_: Request, exc: Exception):
    if settings.is_production:
        return JSONResponse(status_code=500, content={"detail": "Ocurrió un error interno.", "code": "internal"})
    return JSONResponse(status_code=500, content={"detail": str(exc), "code": "internal"})
