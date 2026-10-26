import secrets
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/conkreto.db"
    secret_key: str = ""
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    initial_admin_username: str = "admin"
    initial_admin_email: str = "admin@conkreto.local"
    initial_admin_password: str = ""
    upload_dir: str = "./data/uploads"
    max_upload_mb: int = 10
    environment: str = "development"
    login_max_attempts: int = 5
    login_window_minutes: int = 15

    @model_validator(mode="after")
    def check_secrets(self) -> "Settings":
        if self.is_production:
            if len(self.secret_key) < 32 or "cambiame" in self.secret_key:
                raise ValueError("En producción SECRET_KEY debe tener al menos 32 caracteres aleatorios.")
            if self.initial_admin_password and (len(self.initial_admin_password) < 10 or "cambiame" in self.initial_admin_password):
                raise ValueError("En producción INITIAL_ADMIN_PASSWORD debe tener al menos 10 caracteres y no ser la de ejemplo.")
        elif not self.secret_key:
            # Solo en desarrollo: las sesiones se invalidan al reiniciar el servidor.
            self.secret_key = secrets.token_urlsafe(48)
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
