import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["INITIAL_ADMIN_USERNAME"] = "admin"
os.environ["INITIAL_ADMIN_EMAIL"] = "admin@test.local"
os.environ["INITIAL_ADMIN_PASSWORD"] = "Admin-inicial-123"
os.environ["ENVIRONMENT"] = "development"
os.environ["UPLOAD_DIR"] = str(ROOT / "data" / "test-uploads")
os.environ["LOGIN_MAX_ATTEMPTS"] = "5"
os.environ["LOGIN_WINDOW_MINUTES"] = "15"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from fastapi.testclient import TestClient
import pytest

from app.core.config import get_settings

get_settings.cache_clear()

from app.core.database import engine
from app.main import app
from app.models import Base


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(engine)


def auth_headers(client, username="admin", password="Admin-inicial-123"):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
