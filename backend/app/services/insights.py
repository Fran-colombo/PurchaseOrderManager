from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import (
    AppSetting,
    AuditLog,
    CacAdjustment,
    Certificate,
    Claim,
    Client,
    CompletionMilestone,
    Payment,
    PaymentApplication,
    Project,
    PurchaseOrder,
    Reminder,
    ReminderRule,
    Retention,
)
from app.models.enums import (
    ACTIVE_ADJUSTMENT,
    APPROVED_ADJUSTMENT,
    COUNTS_IN_CERTIFIED,
    EXIGIBLE_STATUSES,
    INVOICED_STATUSES,
    AdjustmentStatus,
    CertificateStatus,
    PaymentConcept,
    PaymentStatus,
    PurchaseOrderStatus,
    RetentionStatus,
)
from app.services.ledger import collected_amount, retention_flags
from app.services.money import D, ZERO, money
from app.services.presenters import reminder_out
from app.services.serialize import s_money

DEFINITIONS = {
    "contracted": "Suma de cantidad por precio original de los rubros activos. No incluye reajustes CAC.",
    "certified_base": "Suma del importe base de certificados emitidos. No incluye borradores ni anulados.",
    "cac_approved": "Reajustes CAC en estado aprobado, facturado o pagado. Un cálculo no aprobado no entra acá.",
    "cac_pending": "Reajustes calculados o presentados que el cliente todavía no aprobó.",
    "invoiced": "Importe bruto de certificados facturados, parcialmente pagados o pagados.",
    "collected": "Pagos aplicados al neto de certificados. No incluye devoluciones de caución.",
    "pending_collection": "Neto exigible facturado menos lo efectivamente cobrado.",
    "approved_not_invoiced": "Neto de certificados aprobados que todavía no se facturaron.",
    "retained": "Cauciones generadas por certificados vigentes.",
    "recovered_retentions": "Dinero devuelto de cauciones, registrado como pago. Un reclamo no cuenta como recupero.",
    "pending_retentions": "Cauciones todavía no devueltas. Siguen pendientes aunque ya se hayan reclamado.",
}


def _bucket() -> dict:
    return {
        "contracted": ZERO,
        "certified_base": ZERO,
        "cac_approved": ZERO,
        "cac_pending": ZERO,
        "invoiced": ZERO,
        "collected": ZERO,
        "pending_collection": ZERO,
        "approved_not_invoiced": ZERO,
        "retained": ZERO,
        "recovered_retentions": ZERO,
        "pending_retentions": ZERO,
    }


def _month(value: date | None) -> str | None:
    if value is None:
        return None
    return f"{value.year:04d}-{value.month:02d}"


def is_client_rule(code: str) -> bool:
    return code.startswith("cliente_")


def when_text(days: int) -> str:
    if days <= 0:
        return "hoy"
    if days == 1:
        return "mañana"
    if days == 7:
        return "en una semana"
    return f"en {days} días"


def current_rule(rules: list[ReminderRule], due: date, today: date) -> ReminderRule | None:
    triggered = [
        rule
        for rule in rules
        if rule.days_before is not None and due - timedelta(days=rule.days_before) <= today <= due
    ]
    return min(triggered, key=lambda rule: rule.days_before) if triggered else None


def ensure_reminder(db: Session, **kwargs) -> None:
    exists = (
        db.query(Reminder.id)
        .filter(
            Reminder.entity_type == kwargs["entity_type"],
            Reminder.entity_id == kwargs["entity_id"],
            Reminder.anchor_key == kwargs["anchor_key"],
        )
        .first()
    )
    if exists:
        return
    db.add(Reminder(**kwargs))


def sync_reminders(db: Session, today: date | None = None) -> int:
    today = today or date.today()
    rules = db.query(ReminderRule).filter(ReminderRule.is_active.is_(True)).all()
    created_before = db.query(func.count(Reminder.id)).scalar() or 0
    retentions = (
        db.query(Retention)
        .join(Certificate, Certificate.id == Retention.certificate_id)
        .filter(
            Certificate.status.in_(COUNTS_IN_CERTIFIED),
            Retention.voided_at.is_(None),
            Retention.status != RetentionStatus.VOIDED.value,
        )
        .all()
    )
    for retention in retentions:
        if money(retention.pending_amount) <= Decimal("0.01"):
            continue
        currency = retention.certificate.currency if retention.certificate else "ARS"
        path = f"/retenciones/{retention.id}"
        if retention.expected_release_date is None:
            ensure_reminder(
                db,
                entity_type="retention",
                entity_id=retention.id,
                anchor_key="sin_fecha",
                rule_code="sin_fecha",
                title="Falta la fecha para liberar una caución",
                detail="No hay fecha de finalización ni fecha contractual. El vencimiento queda pendiente de determinar.",
                due_date=None,
                amount=retention.pending_amount,
                currency=currency,
                priority="media",
                link_path=path,
            )
            continue
        cert_label = retention.certificate.client_number if retention.certificate else str(retention.id)
        due = retention.expected_release_date
        rule = current_rule(rules, due, today)
        if rule is not None:
            when = when_text((due - today).days)
            ensure_reminder(
                db,
                entity_type="retention",
                entity_id=retention.id,
                anchor_key=f"before:{rule.code}:{due.isoformat()}",
                rule_code=rule.code,
                title=(
                    f"Avisar al cliente: la caución del certificado {cert_label} se libera {when}"
                    if is_client_rule(rule.code)
                    else f"La caución del certificado {cert_label} se libera {when}"
                ),
                detail=f"Liberación prevista el {due.strftime('%d/%m/%Y')}.",
                due_date=due,
                amount=retention.pending_amount,
                currency=currency,
                priority="alta" if rule.days_before <= 7 else "media",
                link_path=path,
            )
        for rule in rules:
            if rule.repeat_every_days and today > retention.expected_release_date:
                elapsed = (today - retention.expected_release_date).days
                bucket = elapsed // rule.repeat_every_days
                ensure_reminder(
                    db,
                    entity_type="retention",
                    entity_id=retention.id,
                    anchor_key=f"after:{rule.code}:{retention.expected_release_date.isoformat()}:{bucket}",
                    rule_code=rule.code,
                    title="Caución vencida todavía impaga",
                    detail="Sigue pendiente aunque ya haya pasado la fecha de liberación.",
                    due_date=retention.expected_release_date,
                    amount=retention.pending_amount,
                    currency=currency,
                    priority="alta",
                    link_path=path,
                )
    certificates = db.query(Certificate).filter(Certificate.status.in_(EXIGIBLE_STATUSES)).all()
    for cert in certificates:
        collected = collected_amount(db, cert.id)
        pending = abs(money(cert.net_amount)) - collected
        if pending <= Decimal("0.01"):
            continue
        rule = current_rule(rules, cert.payment_due_date, today) if cert.payment_due_date else None
        if rule is not None:
            when = when_text((cert.payment_due_date - today).days)
            ensure_reminder(
                db,
                entity_type="certificate",
                entity_id=cert.id,
                anchor_key=f"before:{rule.code}:{cert.payment_due_date.isoformat()}",
                rule_code=rule.code,
                title=(
                    f"Avisar al cliente: el certificado {cert.client_number} vence {when}"
                    if is_client_rule(rule.code)
                    else f"El certificado {cert.client_number} vence {when}"
                ),
                detail=f"Vencimiento de pago el {cert.payment_due_date.strftime('%d/%m/%Y')}.",
                due_date=cert.payment_due_date,
                amount=pending,
                currency=cert.currency,
                priority="alta" if rule.days_before <= 7 else "media",
                link_path=f"/certificados/{cert.id}",
            )
        if cert.payment_due_date and cert.payment_due_date < today:
            ensure_reminder(
                db,
                entity_type="certificate",
                entity_id=cert.id,
                anchor_key=f"due:{cert.payment_due_date.isoformat()}",
                rule_code="certificado_vencido",
                title=f"Certificado {cert.client_number} vencido",
                detail="Tiene saldo pendiente después de la fecha de cobro.",
                due_date=cert.payment_due_date,
                amount=pending,
                currency=cert.currency,
                priority="alta",
                link_path=f"/certificados/{cert.id}",
            )
        if cert.status == CertificateStatus.PARTIALLY_PAID.value:
            ensure_reminder(
                db,
                entity_type="certificate",
                entity_id=cert.id,
                anchor_key="partial",
                rule_code="pago_parcial",
                title=f"Pago parcial del certificado {cert.client_number}",
                detail="Queda saldo por cobrar.",
                due_date=cert.payment_due_date,
                amount=pending,
                currency=cert.currency,
                priority="media",
                link_path=f"/certificados/{cert.id}",
            )
    db.flush()
    created_after = db.query(func.count(Reminder.id)).scalar() or 0
    return int(created_after - created_before)


def build_dashboard(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    sync_reminders(db, today)
    totals: dict[str, dict] = defaultdict(_bucket)
    monthly_certs = defaultdict(lambda: defaultdict(lambda: ZERO))
    monthly_ret = defaultdict(lambda: defaultdict(lambda: ZERO))
    monthly_pay = defaultdict(lambda: defaultdict(lambda: ZERO))
    by_client = defaultdict(lambda: defaultdict(lambda: ZERO))
    by_project = defaultdict(lambda: defaultdict(lambda: ZERO))
    client_names: dict[tuple, str] = {}
    project_names: dict[tuple, str] = {}

    orders = db.query(PurchaseOrder).filter(PurchaseOrder.status != PurchaseOrderStatus.CANCELLED.value).all()
    for po in orders:
        contracted = sum((D(item.original_amount) for item in po.items if item.status == "activo"), ZERO)
        totals[po.currency]["contracted"] += contracted

    certificates = db.query(Certificate).filter(Certificate.status.in_(COUNTS_IN_CERTIFIED)).all()
    for cert in certificates:
        currency = cert.currency
        bucket = totals[currency]
        bucket["certified_base"] += D(cert.base_amount)
        collected = collected_amount(db, cert.id)
        bucket["collected"] += collected
        if cert.status in INVOICED_STATUSES:
            bucket["invoiced"] += D(cert.gross_amount)
            pending = abs(money(cert.net_amount)) - collected
            if pending > 0:
                bucket["pending_collection"] += pending
                client_id = cert.purchase_order.client_id if cert.purchase_order else None
                project_id = cert.project_id
                if client_id:
                    by_client[(currency, client_id)]["pending"] += pending
                    client_names[(currency, client_id)] = cert.purchase_order.client.legal_name
                by_project[(currency, project_id)]["pending"] += pending
                if cert.purchase_order and cert.purchase_order.project:
                    project_names[(currency, project_id)] = cert.purchase_order.project.name
        elif cert.status == CertificateStatus.APPROVED.value:
            bucket["approved_not_invoiced"] += abs(money(cert.net_amount))
        month = _month(cert.issue_date)
        if month:
            monthly_certs[currency][month] += D(cert.base_amount)

    adjustments = db.query(CacAdjustment).filter(CacAdjustment.status.in_(ACTIVE_ADJUSTMENT)).all()
    for adjustment in adjustments:
        po = db.get(PurchaseOrder, adjustment.purchase_order_id)
        currency = po.currency if po else "ARS"
        if adjustment.status in APPROVED_ADJUSTMENT:
            totals[currency]["cac_approved"] += D(adjustment.adjustment_amount)
        elif adjustment.status in {AdjustmentStatus.CALCULATED.value, AdjustmentStatus.PRESENTED.value}:
            totals[currency]["cac_pending"] += D(adjustment.adjustment_amount)

    retentions = (
        db.query(Retention)
        .join(Certificate, Certificate.id == Retention.certificate_id)
        .filter(Certificate.status.in_(COUNTS_IN_CERTIFIED), Retention.status != RetentionStatus.VOIDED.value)
        .all()
    )
    alerts = []
    counts = {
        "claimable_retentions": 0,
        "upcoming_30": 0,
        "upcoming_7": 0,
        "overdue_retentions": 0,
        "overdue_certificates": 0,
        "pending_adjustments": db.query(CacAdjustment)
        .filter(CacAdjustment.status.in_([AdjustmentStatus.CALCULATED.value, AdjustmentStatus.PRESENTED.value]))
        .count(),
    }
    upcoming = defaultdict(list)
    for retention in retentions:
        currency = retention.certificate.currency if retention.certificate else "ARS"
        totals[currency]["retained"] += D(retention.retained_amount)
        totals[currency]["recovered_retentions"] += D(retention.recovered_amount)
        totals[currency]["pending_retentions"] += D(retention.pending_amount)
        month = _month(retention.retention_date)
        if month:
            monthly_ret[currency][month] += D(retention.retained_amount)
        flags = retention_flags(retention, today)
        amount = s_money(retention.pending_amount)
        path = f"/retenciones/{retention.id}"
        label = retention.certificate.client_number if retention.certificate else str(retention.id)
        if flags["is_claimable"]:
            counts["claimable_retentions"] += 1
        if flags["is_upcoming_30"]:
            counts["upcoming_30"] += 1
        if flags["is_upcoming_7"]:
            counts["upcoming_7"] += 1
            alerts.append(
                {
                    "priority": "alta",
                    "kind": "caucion_7_dias",
                    "title": f"Caución del certificado {label} vence en los próximos 7 días",
                    "date": retention.expected_release_date.isoformat() if retention.expected_release_date else None,
                    "amount": amount,
                    "currency": currency,
                    "path": path,
                }
            )
        if flags["is_claimable"]:
            alerts.append(
                {
                    "priority": "alta",
                    "kind": "caucion_habilitada",
                    "title": f"Caución del certificado {label} habilitada para reclamar",
                    "date": retention.expected_release_date.isoformat() if retention.expected_release_date else None,
                    "amount": amount,
                    "currency": currency,
                    "path": path,
                }
            )
        if flags["is_overdue"]:
            counts["overdue_retentions"] += 1
            alerts.append(
                {
                    "priority": "alta",
                    "kind": "caucion_vencida",
                    "title": f"Caución del certificado {label} vencida e impaga",
                    "date": retention.expected_release_date.isoformat() if retention.expected_release_date else None,
                    "amount": amount,
                    "currency": currency,
                    "path": path,
                }
            )
        if flags["missing_release_date"]:
            alerts.append(
                {
                    "priority": "media",
                    "kind": "sin_fecha",
                    "title": f"Caución del certificado {label} sin fecha de liberación",
                    "date": None,
                    "amount": amount,
                    "currency": currency,
                    "path": path,
                }
            )
        if retention.expected_release_date and today <= retention.expected_release_date <= today + timedelta(days=90):
            if money(retention.pending_amount) > Decimal("0.01"):
                upcoming[currency].append(
                    {
                        "date": retention.expected_release_date.isoformat(),
                        "amount": amount,
                        "label": label,
                        "path": path,
                    }
                )

    for cert in certificates:
        collected = collected_amount(db, cert.id)
        pending = abs(money(cert.net_amount)) - collected
        if cert.payment_due_date and cert.payment_due_date < today and pending > Decimal("0.01") and cert.status in EXIGIBLE_STATUSES:
            counts["overdue_certificates"] += 1
            alerts.append(
                {
                    "priority": "alta",
                    "kind": "certificado_vencido",
                    "title": f"Certificado {cert.client_number} vencido e impago",
                    "date": cert.payment_due_date.isoformat(),
                    "amount": s_money(pending),
                    "currency": cert.currency,
                    "path": f"/certificados/{cert.id}",
                }
            )
        if cert.status == CertificateStatus.PARTIALLY_PAID.value and pending > Decimal("0.01"):
            alerts.append(
                {
                    "priority": "media",
                    "kind": "pago_parcial",
                    "title": f"El certificado {cert.client_number} tiene un pago parcial",
                    "date": cert.payment_due_date.isoformat() if cert.payment_due_date else None,
                    "amount": s_money(pending),
                    "currency": cert.currency,
                    "path": f"/certificados/{cert.id}",
                }
            )

    for adjustment in adjustments:
        if adjustment.status in {AdjustmentStatus.CALCULATED.value, AdjustmentStatus.PRESENTED.value}:
            po = db.get(PurchaseOrder, adjustment.purchase_order_id)
            alerts.append(
                {
                    "priority": "media",
                    "kind": "reajuste_pendiente",
                    "title": "Reajuste CAC pendiente de aprobación",
                    "date": None,
                    "amount": s_money(adjustment.adjustment_amount),
                    "currency": po.currency if po else "ARS",
                    "path": f"/reajustes/{adjustment.id}",
                }
            )

    horizon = today + timedelta(days=30)
    projects = db.query(Project).filter(Project.estimated_end_date.is_not(None), Project.actual_end_date.is_(None)).all()
    for project in projects:
        if project.estimated_end_date and project.estimated_end_date <= horizon and project.status == "en_ejecucion":
            has_milestone = (
                db.query(CompletionMilestone.id)
                .filter(CompletionMilestone.project_id == project.id, CompletionMilestone.is_active.is_(True))
                .first()
            )
            if not has_milestone:
                alerts.append(
                    {
                        "priority": "media",
                        "kind": "obra_sin_cierre",
                        "title": f"La obra {project.name} se acerca al fin estimado y no tiene fecha real",
                        "date": project.estimated_end_date.isoformat(),
                        "amount": None,
                        "currency": "",
                        "path": f"/obras/{project.id}",
                    }
                )

    payments = (
        db.query(PaymentApplication, Payment)
        .join(Payment, Payment.id == PaymentApplication.payment_id)
        .filter(
            Payment.status == PaymentStatus.REGISTERED.value,
            PaymentApplication.concept == PaymentConcept.CERTIFICATE_NET.value,
        )
        .all()
    )
    for application, payment in payments:
        month = _month(payment.payment_date)
        if month:
            monthly_pay[payment.currency][month] += D(application.amount)

    def series(source: dict) -> list[dict]:
        return [{"month": key, "amount": s_money(value)} for key, value in sorted(source.items())]

    charts = {}
    serialized = {}
    currencies = sorted(totals.keys()) or ["ARS"]
    for currency in currencies:
        serialized[currency] = {key: s_money(value) for key, value in totals[currency].items()}
        charts[currency] = {
            "monthly_certificates": series(monthly_certs[currency]),
            "monthly_collections": series(monthly_pay[currency]),
            "monthly_retentions": series(monthly_ret[currency]),
            "upcoming_releases": sorted(upcoming[currency], key=lambda row: row["date"]),
            "balances_by_client": [
                {"id": key[1], "name": client_names.get(key, ""), "amount": s_money(value["pending"])}
                for key, value in by_client.items()
                if key[0] == currency
            ],
            "balances_by_project": [
                {"id": key[1], "name": project_names.get(key, ""), "amount": s_money(value["pending"])}
                for key, value in by_project.items()
                if key[0] == currency
            ],
        }
    priority = {"alta": 0, "media": 1, "baja": 2}
    alerts.sort(key=lambda row: (priority.get(row["priority"], 9), row.get("date") or "9999"))
    reminders = (
        db.query(Reminder)
        .filter(Reminder.status != "gestionado")
        .order_by(Reminder.created_at.desc())
        .limit(30)
        .all()
    )
    company = db.get(AppSetting, "company_name")
    return {
        "company_name": company.value if company else "Conkreto",
        "generated_on": today.isoformat(),
        "definitions": DEFINITIONS,
        "currencies": currencies,
        "by_currency": serialized,
        "counts": counts,
        "alerts": alerts[:40],
        "charts": charts,
        "reminders": [reminder_out(item) for item in reminders],
    }


REPORTS = {
    "estado_cuenta_cliente": "Estado de cuenta por cliente",
    "resumen_obra": "Resumen financiero por obra",
    "certificados_pagos": "Certificados y sus pagos",
    "reajustes": "Reajustes CAC",
    "retenciones": "Retenciones por certificado",
    "retenciones_proximas": "Retenciones próximas a vencer",
    "retenciones_habilitadas": "Retenciones habilitadas para reclamar",
    "retenciones_vencidas": "Retenciones vencidas e impagas",
    "historial_reclamos": "Historial de reclamos",
    "saldos_pendientes": "Saldos pendientes de cobro",
}


def _matches(db_filters: dict, currency: str | None, client_id, project_id, purchase_order_id) -> bool:
    if db_filters.get("currency") and currency != db_filters["currency"]:
        return False
    if db_filters.get("client_id") and client_id != db_filters["client_id"]:
        return False
    if db_filters.get("project_id") and project_id != db_filters["project_id"]:
        return False
    if db_filters.get("purchase_order_id") and purchase_order_id != db_filters["purchase_order_id"]:
        return False
    return True


def build_report(db: Session, name: str, filters: dict, today: date | None = None) -> dict:
    if name not in REPORTS:
        from app.core.errors import AppError

        raise AppError("Ese reporte no existe.", 404, "not_found")
    today = today or date.today()
    columns: list[dict] = []
    rows: list[dict] = []
    if name in {"estado_cuenta_cliente", "resumen_obra", "certificados_pagos", "saldos_pendientes"}:
        columns = [
            {"key": "cliente", "label": "Cliente"},
            {"key": "obra", "label": "Obra"},
            {"key": "orden", "label": "Orden"},
            {"key": "certificado", "label": "Certificado"},
            {"key": "estado", "label": "Estado"},
            {"key": "moneda", "label": "Moneda"},
            {"key": "base", "label": "Certificado base"},
            {"key": "reajuste", "label": "Reajuste"},
            {"key": "bruto", "label": "Bruto"},
            {"key": "retencion", "label": "Retención"},
            {"key": "neto", "label": "Neto"},
            {"key": "cobrado", "label": "Cobrado"},
            {"key": "pendiente", "label": "Pendiente"},
        ]
        query = db.query(Certificate).filter(Certificate.status != CertificateStatus.VOIDED.value)
        if filters.get("status"):
            query = query.filter(Certificate.status == filters["status"])
        if name == "saldos_pendientes":
            query = query.filter(Certificate.status.in_(INVOICED_STATUSES))
        for cert in query.all():
            po = cert.purchase_order
            if not _matches(filters, cert.currency, po.client_id if po else None, cert.project_id, cert.purchase_order_id):
                continue
            if filters.get("date_from") and cert.issue_date and cert.issue_date < filters["date_from"]:
                continue
            if filters.get("date_to") and cert.issue_date and cert.issue_date > filters["date_to"]:
                continue
            collected = collected_amount(db, cert.id)
            pending = abs(money(cert.net_amount)) - collected
            if name == "saldos_pendientes" and pending <= Decimal("0.01"):
                continue
            if name == "estado_cuenta_cliente" and cert.status == CertificateStatus.DRAFT.value:
                continue
            rows.append(
                {
                    "cliente": po.client.legal_name if po and po.client else "",
                    "obra": po.project.name if po and po.project else "",
                    "orden": po.client_po_number if po else "",
                    "certificado": cert.client_number,
                    "estado": cert.status,
                    "moneda": cert.currency,
                    "base": s_money(cert.base_amount),
                    "reajuste": s_money(cert.cac_amount),
                    "bruto": s_money(cert.gross_amount),
                    "retencion": s_money(cert.retention_amount),
                    "neto": s_money(cert.net_amount),
                    "cobrado": s_money(collected),
                    "pendiente": s_money(pending),
                }
            )
    elif name == "reajustes":
        columns = [
            {"key": "orden", "label": "Orden"},
            {"key": "certificado", "label": "Certificado"},
            {"key": "metodo", "label": "Método"},
            {"key": "estado", "label": "Estado"},
            {"key": "base", "label": "Base reajustable"},
            {"key": "coeficiente", "label": "Coeficiente"},
            {"key": "reajuste", "label": "Reajuste calculado"},
            {"key": "aprobado", "label": "Reajuste aprobado"},
            {"key": "moneda", "label": "Moneda"},
        ]
        for adjustment in db.query(CacAdjustment).all():
            po = db.get(PurchaseOrder, adjustment.purchase_order_id)
            cert = db.get(Certificate, adjustment.certificate_id) if adjustment.certificate_id else None
            currency = po.currency if po else ""
            if not _matches(filters, currency, po.client_id if po else None, adjustment.project_id, adjustment.purchase_order_id):
                continue
            if filters.get("status") and adjustment.status != filters["status"]:
                continue
            rows.append(
                {
                    "orden": po.client_po_number if po else "",
                    "certificado": cert.client_number if cert else "",
                    "metodo": adjustment.method,
                    "estado": adjustment.status,
                    "base": s_money(adjustment.adjustable_base),
                    "coeficiente": format(D(adjustment.coefficient), "f") if adjustment.coefficient is not None else "",
                    "reajuste": s_money(adjustment.adjustment_amount),
                    "aprobado": s_money(adjustment.approved_amount or 0) if adjustment.status in APPROVED_ADJUSTMENT else "0.00",
                    "moneda": currency,
                }
            )
    elif name.startswith("retenciones"):
        columns = [
            {"key": "cliente", "label": "Cliente"},
            {"key": "obra", "label": "Obra"},
            {"key": "orden", "label": "Orden"},
            {"key": "certificado", "label": "Certificado"},
            {"key": "estado", "label": "Estado"},
            {"key": "moneda", "label": "Moneda"},
            {"key": "retenido", "label": "Retenido"},
            {"key": "recuperado", "label": "Recuperado"},
            {"key": "pendiente", "label": "Pendiente"},
            {"key": "liberacion", "label": "Fecha de liberación"},
            {"key": "criterio", "label": "Criterio"},
        ]
        query = (
            db.query(Retention)
            .join(Certificate, Certificate.id == Retention.certificate_id)
            .filter(Certificate.status.in_(COUNTS_IN_CERTIFIED))
        )
        if filters.get("retention_status"):
            query = query.filter(Retention.status == filters["retention_status"])
        for retention in query.all():
            flags = retention_flags(retention, today)
            if name == "retenciones_proximas" and not flags["is_upcoming_30"]:
                continue
            if name == "retenciones_habilitadas" and not flags["is_claimable"]:
                continue
            if name == "retenciones_vencidas" and not flags["is_overdue"]:
                continue
            cert = retention.certificate
            po = cert.purchase_order if cert else None
            currency = cert.currency if cert else ""
            if not _matches(filters, currency, retention.client_id, retention.project_id, retention.purchase_order_id):
                continue
            if filters.get("due_before") and retention.expected_release_date and retention.expected_release_date > filters["due_before"]:
                continue
            rows.append(
                {
                    "cliente": po.client.legal_name if po and po.client else "",
                    "obra": po.project.name if po and po.project else "",
                    "orden": po.client_po_number if po else "",
                    "certificado": cert.client_number if cert else "",
                    "estado": retention.status,
                    "moneda": currency,
                    "retenido": s_money(retention.retained_amount),
                    "recuperado": s_money(retention.recovered_amount),
                    "pendiente": s_money(retention.pending_amount),
                    "liberacion": retention.expected_release_date.isoformat() if retention.expected_release_date else "Pendiente de fecha de finalización",
                    "criterio": retention.release_trigger,
                }
            )
    elif name == "historial_reclamos":
        columns = [
            {"key": "fecha", "label": "Fecha"},
            {"key": "cliente", "label": "Cliente"},
            {"key": "canal", "label": "Canal"},
            {"key": "estado", "label": "Estado"},
            {"key": "importe", "label": "Importe reclamado"},
            {"key": "moneda", "label": "Moneda"},
            {"key": "respuesta", "label": "Respuesta"},
            {"key": "seguimiento", "label": "Próximo seguimiento"},
        ]
        for claim in db.query(Claim).order_by(Claim.claim_date.desc()).all():
            client = db.get(Client, claim.client_id)
            if not _matches(filters, claim.currency, claim.client_id, claim.project_id, claim.purchase_order_id):
                continue
            if filters.get("status") and claim.status != filters["status"]:
                continue
            rows.append(
                {
                    "fecha": claim.claim_date.isoformat(),
                    "cliente": client.legal_name if client else "",
                    "canal": claim.channel,
                    "estado": claim.status,
                    "importe": s_money(claim.amount_claimed),
                    "moneda": claim.currency,
                    "respuesta": claim.response,
                    "seguimiento": claim.next_followup_date.isoformat() if claim.next_followup_date else "",
                }
            )
    totals_row = {}
    money_keys = {"base", "reajuste", "bruto", "retencion", "neto", "cobrado", "pendiente", "retenido", "recuperado", "importe", "aprobado"}
    if rows:
        currencies = {row.get("moneda") for row in rows}
        if len(currencies) == 1:
            totals_row = {"cliente": "Total", "moneda": next(iter(currencies))}
            for column in columns:
                key = column["key"]
                if key in money_keys:
                    totals_row[key] = s_money(sum((D(row[key] or 0) for row in rows), ZERO))
                elif key not in totals_row:
                    totals_row[key] = ""
    return {"name": name, "title": REPORTS[name], "columns": columns, "rows": rows, "totals": totals_row}


def global_search(db: Session, term: str, limit: int = 8) -> list[dict]:
    text = f"%{term.strip()}%"
    results = []
    for client in (
        db.query(Client)
        .filter(or_(Client.legal_name.ilike(text), Client.trade_name.ilike(text), Client.cuit.ilike(text)))
        .limit(limit)
    ):
        results.append({"type": "cliente", "id": client.id, "title": client.legal_name, "subtitle": client.cuit or "", "path": f"/clientes/{client.id}"})
    for project in (
        db.query(Project)
        .filter(or_(Project.name.ilike(text), Project.internal_code.ilike(text), Project.location.ilike(text)))
        .limit(limit)
    ):
        results.append({"type": "obra", "id": project.id, "title": project.name, "subtitle": project.internal_code, "path": f"/obras/{project.id}"})
    for po in db.query(PurchaseOrder).filter(PurchaseOrder.client_po_number.ilike(text)).limit(limit):
        results.append({"type": "orden", "id": po.id, "title": po.client_po_number, "subtitle": po.project.name if po.project else "", "path": f"/ordenes/{po.id}"})
    for cert in db.query(Certificate).filter(Certificate.client_number.ilike(text)).limit(limit):
        results.append({"type": "certificado", "id": cert.id, "title": cert.client_number, "subtitle": cert.status, "path": f"/certificados/{cert.id}"})
    for retention in db.query(Retention).join(Certificate).filter(Certificate.client_number.ilike(text)).limit(limit):
        results.append(
            {
                "type": "retencion",
                "id": retention.id,
                "title": f"Retención {retention.certificate.client_number if retention.certificate else retention.id}",
                "subtitle": retention.status,
                "path": f"/retenciones/{retention.id}",
            }
        )
    for claim in db.query(Claim).filter(or_(Claim.recipient.ilike(text), Claim.notes.ilike(text), Claim.response.ilike(text))).limit(limit):
        results.append({"type": "reclamo", "id": claim.id, "title": f"Reclamo {claim.claim_date.isoformat()}", "subtitle": claim.status, "path": f"/reclamos/{claim.id}"})
    for payment in db.query(Payment).filter(Payment.reference.ilike(text)).limit(limit):
        results.append({"type": "pago", "id": payment.id, "title": payment.reference or f"Pago {payment.id}", "subtitle": s_money(payment.total_amount), "path": f"/pagos/{payment.id}"})
    return results


def search_audit(db: Session, entity_type: str | None, limit: int, offset: int) -> tuple[list[AuditLog], int]:
    query = db.query(AuditLog)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    return rows, total
