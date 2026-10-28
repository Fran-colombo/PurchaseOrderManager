from datetime import date, timedelta
from io import StringIO
import csv


def auth_headers(client, email="admin@test.local", password="Admin-inicial-123"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def login(client, email="admin@test.local", password="Admin-inicial-123"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_login_success_and_failure(client):
    bad = login(client, password="no-es-la-clave")
    assert bad.status_code == 401
    assert login(client, email="admin", password="Admin-inicial-123").status_code == 401
    ok = login(client, email="  Admin@Test.Local ")
    body = ok.json()
    assert "access_token" in body
    assert "hashed_password" not in body["user"]
    assert body["user"]["role"] == "sysadmin"


def test_session_ends_when_token_expires(client):
    from datetime import datetime, timezone

    import jwt

    from app.core.config import get_settings
    from app.core.database import SessionLocal
    from app.models import RefreshToken

    body = login(client).json()
    settings = get_settings()
    expired = jwt.encode(
        {"sub": str(body["user"]["id"]), "tv": 1, "exp": datetime.now(timezone.utc) - timedelta(seconds=1), "type": "access"},
        settings.secret_key,
        algorithm="HS256",
    )
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401

    assert client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]}).status_code == 200
    db = SessionLocal()
    try:
        db.query(RefreshToken).update({"created_at": datetime.now(timezone.utc) - timedelta(minutes=settings.access_token_expire_minutes + 1)})
        db.commit()
    finally:
        db.close()
    assert client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]}).status_code == 401


def test_no_public_registration(client):
    response = client.post("/api/auth/register", json={"username": "nuevo", "password": "12345678"})
    assert response.status_code == 404


def test_rate_limit(client):
    for _ in range(5):
        assert login(client, email="fantasma@test.local", password="mala").status_code == 401
    blocked = login(client, email="fantasma@test.local", password="mala")
    assert blocked.status_code == 429


def test_normal_user_cannot_administer(client):
    headers = auth_headers(client)
    created = client.post(
        "/api/users",
        headers=headers,
        json={
            "username": "operador",
            "email": "operador@test.local",
            "full_name": "Operador",
            "password": "Operador-123",
            "role": "normal",
        },
    )
    assert created.status_code == 200, created.text
    normal = auth_headers(client, "operador@test.local", "Operador-123")
    assert client.get("/api/users", headers=normal).status_code == 403
    assert client.post("/api/users", headers=normal, json={"username": "x", "email": "x@test.local", "password": "clave-12345", "role": "sysadmin"}).status_code == 403
    assert client.get("/api/audit", headers=normal).status_code == 403
    assert client.get("/api/settings", headers=normal).status_code == 403
    assert client.get("/api/clients", headers=normal).status_code == 200


def test_cannot_remove_last_admin(client):
    headers = auth_headers(client)
    me = client.get("/api/auth/me", headers=headers).json()
    response = client.put(f"/api/users/{me['id']}", headers=headers, json={"is_active": False})
    assert response.status_code == 409
    assert response.json()["code"] == "last_admin"


def _base_contract(client, headers, retention_base="solo_base"):
    client_row = client.post("/api/clients", headers=headers, json={"legal_name": "PECAM", "cuit": "30-00000000-0"}).json()
    project = client.post(
        "/api/projects",
        headers=headers,
        json={"client_id": client_row["id"], "name": "Obra de prueba", "status": "en_ejecucion"},
    ).json()
    order = client.post(
        "/api/purchase-orders",
        headers=headers,
        json={
            "client_po_number": "OC-TEST-001",
            "client_id": client_row["id"],
            "project_id": project["id"],
            "currency": "ARS",
            "retention_percent": "5",
            "retention_base_type": retention_base,
            "release_trigger": "finalizacion_orden",
            "release_days": 180,
        },
    ).json()
    unit_id = next(unit["id"] for unit in client.get("/api/units", headers=headers).json() if unit["code"] == "m2")
    item = client.post(
        f"/api/purchase-orders/{order['id']}/items",
        headers=headers,
        json={"description": "colocación de revestimiento", "unit_id": unit_id, "contracted_quantity": "1000", "unit_price": "10000"},
    ).json()
    order = client.get(f"/api/purchase-orders/{order['id']}", headers=headers).json()
    return client_row, project, order, item


def _certificate(client, headers, order_id, item_id, number, quantity, status="presentado"):
    response = client.post(
        "/api/certificates",
        headers=headers,
        json={
            "purchase_order_id": order_id,
            "client_number": number,
            "status": status,
            "issue_date": "2026-10-01",
            "items": [{"po_item_id": item_id, "quantity": quantity}],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_quantities_voided_certificates_and_cac(client):
    headers = auth_headers(client)
    _, _, order, item = _base_contract(client, headers)
    assert order["contracted_amount"] == "10000000.00"
    first = _certificate(client, headers, order["id"], item["id"], "CERT-1", "300")
    second = _certificate(client, headers, order["id"], item["id"], "CERT-2", "200")
    assert first["base_amount"] == "3000000.00"
    assert first["retention_amount"] == "150000.00"
    assert first["net_amount"] == "2850000.00"
    assert "5" in first["retention_formula"]
    progress = client.get(f"/api/purchase-orders/{order['id']}", headers=headers).json()
    assert progress["items"][0]["certified_quantity"] == "500.0000"
    assert progress["items"][0]["pending_quantity"] == "500.0000"
    over = client.post(
        "/api/certificates",
        headers=headers,
        json={
            "purchase_order_id": order["id"],
            "client_number": "CERT-3",
            "status": "presentado",
            "items": [{"po_item_id": item["id"], "quantity": "600"}],
        },
    )
    assert over.status_code == 409
    assert over.json()["code"] == "overage"
    preview = client.post(
        "/api/adjustments/preview",
        headers=headers,
        json={"adjustable_base": "1000000", "index_base": "100", "index_updated": "120"},
    )
    assert preview.status_code == 200
    assert preview.json()["updated_amount"] == "1200000.00"
    assert preview.json()["adjustment_amount"] == "200000.00"
    assert preview.json()["official"] is False
    rejected = client.post(
        "/api/adjustments/preview",
        headers=headers,
        json={"adjustable_base": "1000000", "index_base": "0", "index_updated": "120"},
    )
    assert rejected.status_code == 400
    base_index = client.post(
        "/api/cac-indexes",
        headers=headers,
        json={"period_year": 2024, "period_month": 1, "series_code": "TEST", "published_value": "100", "series_name": "Serie de prueba"},
    ).json()
    update_index = client.post(
        "/api/cac-indexes",
        headers=headers,
        json={"period_year": 2026, "period_month": 1, "series_code": "TEST", "published_value": "120", "series_name": "Serie de prueba"},
    ).json()
    adjustment = client.post(
        "/api/adjustments",
        headers=headers,
        json={
            "purchase_order_id": order["id"],
            "certificate_id": first["id"],
            "certificate_item_id": first["items"][0]["id"],
            "method": "variacion_simple",
            "adjustable_base": "1000000",
            "base_index_id": base_index["id"],
            "update_index_id": update_index["id"],
            "status": "calculado",
        },
    )
    assert adjustment.status_code == 200, adjustment.text
    assert adjustment.json()["official"] is False
    duplicated = client.post(
        "/api/adjustments",
        headers=headers,
        json={
            "purchase_order_id": order["id"],
            "certificate_id": first["id"],
            "certificate_item_id": first["items"][0]["id"],
            "method": "variacion_simple",
            "adjustable_base": "1000000",
            "base_index_id": base_index["id"],
            "update_index_id": update_index["id"],
        },
    )
    assert duplicated.status_code == 409
    assert duplicated.json()["code"] == "duplicate_adjustment"
    voided = client.post(f"/api/certificates/{second['id']}/void", headers=headers, json={"reason": "Cargado dos veces"})
    assert voided.status_code == 200, voided.text
    progress = client.get(f"/api/purchase-orders/{order['id']}", headers=headers).json()
    assert progress["items"][0]["certified_quantity"] == "300.0000"


def test_payments_retentions_claims_reports_and_reminders(client):
    headers = auth_headers(client)
    customer, project, order, item = _base_contract(client, headers)
    cert = _certificate(client, headers, order["id"], item["id"], "CERT-1", "300", status="facturado")
    retention = cert["retention"]
    assert retention["expected_release_date"] is None
    assert retention["status"] == "pendiente_fecha_finalizacion"
    assert retention["is_claimable"] is False
    payment = client.post(
        "/api/payments",
        headers=headers,
        json={
            "client_id": customer["id"],
            "payment_date": "2026-10-20",
            "total_amount": "1000000",
            "currency": "ARS",
            "reference": "TRX-TEST-1",
            "applications": [{"concept": "neto_certificado", "amount": "1000000", "certificate_id": cert["id"]}],
        },
    )
    assert payment.status_code == 200, payment.text
    updated = client.get(f"/api/certificates/{cert['id']}", headers=headers).json()
    assert updated["status"] == "parcialmente_pagado"
    assert updated["pending_amount"] == "1850000.00"
    again = client.post(
        f"/api/payments/{payment.json()['id']}/applications",
        headers=headers,
        json={"concept": "neto_certificado", "amount": "100", "certificate_id": cert["id"]},
    )
    assert again.status_code == 409
    assert again.json()["code"] == "duplicate_application"
    milestone = client.post(
        "/api/milestones",
        headers=headers,
        json={
            "scope_type": "orden",
            "project_id": project["id"],
            "purchase_order_id": order["id"],
            "effective_date": (date.today() - timedelta(days=200)).isoformat(),
            "confirm": True,
            "reason": "Fin de los trabajos de prueba",
        },
    )
    assert milestone.status_code == 200, milestone.text
    retention = client.get(f"/api/retentions/{retention['id']}", headers=headers).json()
    assert retention["expected_release_date"] is not None
    assert retention["is_claimable"] is True
    assert retention["is_overdue"] is True
    claim = client.post(
        "/api/claims",
        headers=headers,
        json={
            "client_id": customer["id"],
            "project_id": project["id"],
            "purchase_order_id": order["id"],
            "claim_date": date.today().isoformat(),
            "channel": "correo",
            "amount_claimed": retention["pending_amount"],
            "retentions": [{"retention_id": retention["id"], "amount": retention["pending_amount"]}],
        },
    )
    assert claim.status_code == 200, claim.text
    retention = client.get(f"/api/retentions/{retention['id']}", headers=headers).json()
    assert retention["pending_amount"] == "150000.00"
    assert retention["is_overdue"] is True
    dashboard = client.get("/api/dashboard/summary", headers=headers).json()
    assert any(alert["kind"] == "caucion_vencida" for alert in dashboard["alerts"])
    assert dashboard["by_currency"]["ARS"]["pending_retentions"] == "150000.00"
    partial = client.post(
        "/api/payments",
        headers=headers,
        json={
            "client_id": customer["id"],
            "payment_date": date.today().isoformat(),
            "total_amount": "40000",
            "currency": "ARS",
            "reference": "DEV-1",
            "applications": [{"concept": "devolucion_caucion", "amount": "40000", "retention_id": retention["id"]}],
        },
    )
    assert partial.status_code == 200, partial.text
    retention = client.get(f"/api/retentions/{retention['id']}", headers=headers).json()
    assert retention["pending_amount"] == "110000.00"
    assert retention["status"] == "parcialmente_recuperada"
    rest = client.post(
        "/api/payments",
        headers=headers,
        json={
            "client_id": customer["id"],
            "payment_date": date.today().isoformat(),
            "total_amount": "110000",
            "currency": "ARS",
            "reference": "DEV-2",
            "applications": [{"concept": "devolucion_caucion", "amount": "110000", "retention_id": retention["id"]}],
        },
    )
    assert rest.status_code == 200, rest.text
    retention = client.get(f"/api/retentions/{retention['id']}", headers=headers).json()
    assert retention["pending_amount"] == "0.00"
    assert retention["status"] == "recuperada"
    dashboard = client.get("/api/dashboard/summary", headers=headers).json()
    assert dashboard["by_currency"]["ARS"]["pending_retentions"] == "0.00"
    assert dashboard["by_currency"]["ARS"]["recovered_retentions"] == "150000.00"
    assert dashboard["by_currency"]["ARS"]["collected"] == "1000000.00"
    first_sync = client.post("/api/reminders/sync", headers=headers)
    second_sync = client.post("/api/reminders/sync", headers=headers)
    assert first_sync.status_code == 200
    assert second_sync.json()["created"] == 0
    report = client.get("/api/reports/saldos_pendientes", headers=headers)
    exported = client.get("/api/reports/saldos_pendientes/export?format=csv", headers=headers)
    assert report.status_code == 200
    assert exported.status_code == 200
    rows = list(csv.DictReader(StringIO(exported.content.decode("utf-8-sig"))))
    assert rows[-1]["Pendiente"] == report.json()["totals"]["pendiente"]


def test_client_payment_notices_week_day_and_same_day(client):
    headers = auth_headers(client)
    customer, _, order, item = _base_contract(client, headers)
    client.put(
        f"/api/clients/{customer['id']}",
        headers=headers,
        json={"contact_name": "Laura", "phone": "011 2345-6789", "email": "pagos@pecam.test"},
    )
    today = date.today()
    for number, days in (("C-7", 7), ("C-1", 1), ("C-0", 0), ("C-20", 20)):
        cert = _certificate(client, headers, order["id"], item["id"], number, "10", status="facturado")
        updated = client.put(
            f"/api/certificates/{cert['id']}",
            headers=headers,
            json={"payment_due_date": (today + timedelta(days=days)).isoformat()},
        )
        assert updated.status_code == 200, updated.text

    notices = client.get("/api/reminders/client-notices", headers=headers)
    assert notices.status_code == 200, notices.text
    by_title = {row["title"]: row for row in notices.json()}
    assert set(by_title) == {
        "Avisar al cliente: el certificado C-7 vence en una semana",
        "Avisar al cliente: el certificado C-1 vence mañana",
        "Avisar al cliente: el certificado C-0 vence hoy",
    }
    notice = by_title["Avisar al cliente: el certificado C-1 vence mañana"]
    contact = notice["contact"]
    assert contact["whatsapp_url"].startswith("https://wa.me/5491123456789?text=")
    assert contact["mailto_url"].startswith("mailto:pagos@pecam.test?subject=")
    assert "Hola Laura" in contact["message"]
    assert "el pago del certificado N.º C-1 (obra Obra de prueba, OC OC-TEST-001) vence mañana" in contact["message"]
    assert "$" not in contact["message"]

    cert_id = int(notice["link_path"].rsplit("/", 1)[-1])
    invoiced = client.put(
        f"/api/certificates/{cert_id}",
        headers=headers,
        json={"invoice_number": " 0003-00001234 ", "invoiced_date": "2026-10-15"},
    )
    assert invoiced.status_code == 200, invoiced.text
    assert invoiced.json()["invoice_number"] == "0003-00001234"
    contact = next(row for row in client.get("/api/reminders/client-notices", headers=headers).json() if row["id"] == notice["id"])["contact"]
    assert contact["subject"] == "Recordatorio de pago · Factura N.º 0003-00001234"
    assert "el pago de la factura N.º 0003-00001234 del 15/10/2026 (certificado N.º C-1, obra Obra de prueba, OC OC-TEST-001) vence mañana" in contact["message"]
    found = client.get("/api/search", headers=headers, params={"q": "00001234"}).json()
    assert any(row["type"] == "certificado" and row["id"] == cert_id for row in found)

    again = client.get("/api/reminders/client-notices", headers=headers).json()
    assert len(again) == 3

    done = client.post(f"/api/reminders/{notice['id']}/contacted", headers=headers, json={"channel": "whatsapp"})
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "gestionado"
    remaining = client.get("/api/reminders/client-notices", headers=headers).json()
    assert len(remaining) == 2
    audit = client.get("/api/audit", headers=headers, params={"entity_type": "certificate"}).json()
    assert any(row["action"] == "aviso_cliente" for row in audit["items"])


def test_existing_database_gets_new_columns(tmp_path):
    from sqlalchemy import create_engine, inspect, text

    from app.core.schema_upgrade import add_missing_columns

    engine = create_engine(f"sqlite:///{tmp_path / 'vieja.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE certificates (id INTEGER PRIMARY KEY, client_number VARCHAR(80))"))
        connection.execute(text("INSERT INTO certificates (client_number) VALUES ('001')"))
    add_missing_columns(engine)
    add_missing_columns(engine)
    assert "invoice_number" in {col["name"] for col in inspect(engine).get_columns("certificates")}
    with engine.connect() as connection:
        assert connection.execute(text("SELECT invoice_number FROM certificates")).scalar() == ""
    engine.dispose()


def test_client_notices_are_emailed_automatically(client, monkeypatch):
    from datetime import datetime

    from app.core.config import get_settings
    from app.core.database import SessionLocal
    from app.services import notifier
    from app.services.mailer import MailError

    headers = auth_headers(client)
    customer, _, order, item = _base_contract(client, headers)
    client.put(f"/api/clients/{customer['id']}", headers=headers, json={"contact_name": "Laura", "email": "pagos@pecam.test"})
    cert = _certificate(client, headers, order["id"], item["id"], "C-1", "10", status="facturado")
    client.put(f"/api/certificates/{cert['id']}", headers=headers, json={"payment_due_date": (date.today() + timedelta(days=1)).isoformat()})

    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "avisos@conkreto.test")
    sent = []
    outcomes = [MailError("servidor caído"), None]

    def fake_send(to, subject, body):
        outcome = outcomes.pop(0)
        if outcome:
            raise outcome
        sent.append((to, subject, body))

    monkeypatch.setattr(notifier, "send_email", fake_send)
    today = date.today()
    night = datetime(today.year, today.month, today.day, 22, 0)
    morning = datetime(today.year, today.month, today.day, 10, 0)

    db = SessionLocal()
    try:
        assert notifier.run_auto_notices(db, now=night) == {"sent": 0, "failed": 0, "skipped": 0}
        assert notifier.run_auto_notices(db, now=morning)["failed"] == 1
        assert len(client.get("/api/reminders/client-notices", headers=headers).json()) == 1
        assert notifier.run_auto_notices(db, now=morning)["sent"] == 1
        assert notifier.run_auto_notices(db, now=morning)["sent"] == 0
    finally:
        db.close()

    assert len(sent) == 1
    to, subject, body = sent[0]
    assert to == "pagos@pecam.test"
    assert "C-1" in subject
    assert "Hola Laura" in body and "vence mañana" in body
    assert client.get("/api/reminders/client-notices", headers=headers).json() == []
    status = client.get("/api/settings/email", headers=headers).json()
    assert status["enabled"] is True
    assert [row["status"] for row in status["recent"]] == ["enviado", "error"]
    audit = client.get("/api/audit", headers=headers, params={"entity_type": "certificate"}).json()
    assert any(row["action"] == "aviso_cliente" and row["user_id"] is None for row in audit["items"])


def test_future_completion_is_not_claimable_yet(client):
    headers = auth_headers(client)
    _, project, order, item = _base_contract(client, headers)
    cert = _certificate(client, headers, order["id"], item["id"], "CERT-1", "100")
    response = client.post(
        "/api/milestones",
        headers=headers,
        json={
            "scope_type": "orden",
            "project_id": project["id"],
            "purchase_order_id": order["id"],
            "effective_date": date.today().isoformat(),
            "confirm": True,
            "reason": "Recién terminada",
        },
    )
    assert response.status_code == 200, response.text
    retention = client.get(f"/api/retentions/{cert['retention']['id']}", headers=headers).json()
    expected = date.today() + timedelta(days=180)
    assert retention["expected_release_date"] == expected.isoformat()
    assert retention["is_claimable"] is False
    assert retention["status"] == "en_plazo"
