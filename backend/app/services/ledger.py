"""Cálculos que leen la base y mantienen saldos consistentes."""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    CacAdjustment,
    CacIndex,
    Certificate,
    CertificateItem,
    Claim,
    ClaimRetention,
    CompletionMilestone,
    Payment,
    PaymentApplication,
    PurchaseOrder,
    PurchaseOrderItem,
    Retention,
)
from app.models.enums import (
    ACTIVE_ADJUSTMENT,
    APPROVED_ADJUSTMENT,
    COUNTS_IN_CERTIFIED,
    AdjustmentStatus,
    CertificateStatus,
    ClaimStatus,
    PaymentConcept,
    PaymentStatus,
    ReleaseTrigger,
    RetentionStatus,
)
from app.services.calculations import (
    compute_release_date,
    contractual_adjustment,
    document_sign,
    formula_text,
    gross_amount,
    line_amount,
    net_amount,
    retention_amount,
    retention_parts,
    simple_variation,
)
from app.services.money import D, ZERO, money
from app.services.serialize import s_money, s_qty

CENT = Decimal("0.01")


def _sign(cert: Certificate) -> Decimal:
    return document_sign(cert.document_type)


def certified_quantity(db: Session, po_item_id: int, exclude_certificate_id: int | None = None) -> Decimal:
    rows = (
        db.query(CertificateItem, Certificate)
        .join(Certificate, Certificate.id == CertificateItem.certificate_id)
        .filter(
            CertificateItem.po_item_id == po_item_id,
            Certificate.status.in_(COUNTS_IN_CERTIFIED),
        )
        .all()
    )
    total = ZERO
    for item, cert in rows:
        if exclude_certificate_id and cert.id == exclude_certificate_id:
            continue
        total += _sign(cert) * D(item.quantity)
    return total


def collected_amount(db: Session, certificate_id: int) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(PaymentApplication.amount), 0))
        .join(Payment, Payment.id == PaymentApplication.payment_id)
        .filter(
            PaymentApplication.certificate_id == certificate_id,
            PaymentApplication.concept == PaymentConcept.CERTIFICATE_NET.value,
            Payment.status == PaymentStatus.REGISTERED.value,
        )
        .scalar()
    )
    return money(total)


def recovered_amount(db: Session, retention_id: int | None) -> Decimal:
    if not retention_id:
        return ZERO
    total = (
        db.query(func.coalesce(func.sum(PaymentApplication.amount), 0))
        .join(Payment, Payment.id == PaymentApplication.payment_id)
        .filter(
            PaymentApplication.retention_id == retention_id,
            PaymentApplication.concept == PaymentConcept.RETENTION_RECOVERY.value,
            Payment.status == PaymentStatus.REGISTERED.value,
        )
        .scalar()
    )
    return money(total)


def has_open_claim(db: Session, retention_id: int | None) -> bool:
    if not retention_id:
        return False
    closed = {ClaimStatus.VOIDED.value, ClaimStatus.RECOVERED.value}
    found = (
        db.query(ClaimRetention.id)
        .join(Claim, Claim.id == ClaimRetention.claim_id)
        .filter(ClaimRetention.retention_id == retention_id, Claim.status.notin_(closed))
        .first()
    )
    return found is not None


def active_milestone_for(db: Session, po: PurchaseOrder) -> CompletionMilestone | None:
    query = db.query(CompletionMilestone).filter(CompletionMilestone.is_active.is_(True))
    trigger = po.release_trigger
    if trigger == ReleaseTrigger.PROJECT.value:
        return (
            query.filter(
                CompletionMilestone.scope_type == "obra",
                CompletionMilestone.project_id == po.project_id,
            )
            .order_by(CompletionMilestone.recorded_at.desc())
            .first()
        )
    if trigger == ReleaseTrigger.PURCHASE_ORDER.value:
        return query.filter(
            CompletionMilestone.scope_type == "orden",
            CompletionMilestone.purchase_order_id == po.id,
        ).first()
    if trigger == ReleaseTrigger.SCOPE.value and po.release_scope_id:
        return query.filter(
            CompletionMilestone.scope_type == "alcance",
            CompletionMilestone.contract_scope_id == po.release_scope_id,
        ).first()
    if trigger == ReleaseTrigger.CONTRACTUAL.value:
        return query.filter(
            CompletionMilestone.scope_type == "contractual",
            CompletionMilestone.purchase_order_id == po.id,
        ).first()
    return None


def prepare_lines(
    db: Session,
    cert: Certificate,
    po: PurchaseOrder,
    lines: list[dict],
    ignore_current_adjustments: bool = False,
) -> list[dict]:
    prepared: list[dict] = []
    for line in lines:
        po_item = db.get(PurchaseOrderItem, line["po_item_id"])
        if po_item is None or po_item.purchase_order_id != po.id:
            raise AppError("Hay un rubro que no pertenece a la orden de compra.", code="invalid_item")
        quantity = D(line["quantity"])
        if quantity < 0:
            raise AppError("La cantidad certificada no puede ser negativa.", code="invalid_quantity")
        unit_price = D(line["unit_price"] if line.get("unit_price") is not None else po_item.unit_price)
        base = line_amount(quantity, unit_price)
        already = certified_quantity(db, po_item.id, exclude_certificate_id=cert.id)
        projected = already + _sign(cert) * quantity
        over_contract = projected - D(po_item.contracted_quantity) > Decimal("0.0001")
        if over_contract and not line.get("allow_overage"):
            raise AppError(
                f"La cantidad de «{po_item.description}» superaría lo contratado "
                f"({s_qty(po_item.contracted_quantity)}). Autorizá el excedente e indicá el motivo si corresponde.",
                409,
                "overage",
                {
                    "po_item_id": po_item.id,
                    "contracted": s_qty(po_item.contracted_quantity),
                    "projected": s_qty(projected),
                },
            )
        if over_contract and not str(line.get("overage_reason") or "").strip():
            raise AppError("Indicá el motivo para certificar por encima de lo contratado.", code="reason_required")

        method = line.get("calculation_method") or "ninguno"
        adjustment = None
        adjustment_amount = ZERO
        coefficient = None
        adjusted_amount = base
        if method == "variacion_simple":
            base_index = db.get(CacIndex, line.get("cac_base_index_id"))
            update_index = db.get(CacIndex, line.get("cac_update_index_id"))
            if base_index is None or update_index is None:
                raise AppError("Elegí el índice CAC base y el índice actualizado.", code="cac_index_missing")
            _guard_readjust(db, line, po_item.id, cert.id, ignore_current_adjustments)
            result = simple_variation(base, base_index.published_value, update_index.published_value)
            adjustment_amount = result["adjustment_amount"]
            coefficient = result["coefficient"]
            adjusted_amount = result["updated_amount"]
            adjustment = _adjustment_dict(line, po, cert, result, base, base_index, update_index, method)
        elif method == "contractual":
            _guard_readjust(db, line, po_item.id, cert.id, ignore_current_adjustments)
            result = contractual_adjustment(
                base,
                line.get("contractual_amount"),
                line.get("formula_text") or "",
                line.get("parameters") or {},
            )
            adjustment_amount = result["adjustment_amount"]
            adjusted_amount = result["updated_amount"]
            adjustment = _adjustment_dict(line, po, cert, result, base, None, None, method)
        elif method != "ninguno":
            raise AppError("El método de reajuste no es válido.", code="invalid_method")

        prepared.append(
            {
                "po_item": po_item,
                "quantity": quantity,
                "unit_price": unit_price,
                "base_amount": base,
                "accumulated_quantity": projected,
                "adjustment_amount": adjustment_amount,
                "adjusted_amount": adjusted_amount,
                "coefficient": coefficient,
                "method": method,
                "cac_base_index_id": line.get("cac_base_index_id"),
                "cac_update_index_id": line.get("cac_update_index_id"),
                "overage_authorized": bool(over_contract and line.get("allow_overage")),
                "overage_reason": line.get("overage_reason") or "",
                "notes": line.get("notes") or "",
                "adjustment": adjustment,
            }
        )
    return prepared


def _guard_readjust(
    db: Session,
    line: dict,
    po_item_id: int,
    certificate_id: int | None,
    skip_existing: bool = False,
) -> None:
    if line.get("already_includes_update") and not line.get("allow_readjust"):
        raise AppError(
            "Ese importe ya incluye una actualización. No se reajusta de nuevo salvo autorización explícita y un motivo.",
            409,
            "duplicate_adjustment",
        )
    if line.get("allow_readjust") and not str(line.get("readjust_reason") or "").strip():
        raise AppError("Indicá el motivo para volver a reajustar un importe actualizado.", code="reason_required")
    if certificate_id is None or skip_existing:
        return
    existing = (
        db.query(CacAdjustment)
        .join(CertificateItem, CertificateItem.id == CacAdjustment.certificate_item_id)
        .filter(
            CertificateItem.certificate_id == certificate_id,
            CertificateItem.po_item_id == po_item_id,
            CacAdjustment.status.in_(ACTIVE_ADJUSTMENT),
        )
        .count()
    )
    if existing and not line.get("allow_readjust"):
        raise AppError(
            "Ese rubro ya tiene un reajuste vigente en el certificado.",
            409,
            "duplicate_adjustment",
        )


def _adjustment_dict(line, po, cert, result, base, base_index, update_index, method) -> dict:
    status = line.get("adjustment_status") or AdjustmentStatus.CALCULATED.value
    if status not in {item.value for item in AdjustmentStatus}:
        raise AppError("El estado del reajuste no es válido.", code="invalid_status")
    if status in {AdjustmentStatus.VOIDED.value, AdjustmentStatus.SUPERSEDED.value, AdjustmentStatus.REJECTED.value}:
        raise AppError("No se puede crear un reajuste directamente en ese estado.", code="invalid_status")
    approved_amount = None
    presented_amount = None
    if status in APPROVED_ADJUSTMENT:
        approved_amount = result["adjustment_amount"]
    if status in APPROVED_ADJUSTMENT or status == AdjustmentStatus.PRESENTED.value:
        presented_amount = result["adjustment_amount"]
    return {
        "purchase_order_id": po.id,
        "project_id": po.project_id,
        "kind": "incluido",
        "method": method,
        "base_period_year": base_index.period_year if base_index else None,
        "base_period_month": base_index.period_month if base_index else None,
        "update_period_year": update_index.period_year if update_index else None,
        "update_period_month": update_index.period_month if update_index else None,
        "base_index_id": base_index.id if base_index else None,
        "update_index_id": update_index.id if update_index else None,
        "formula_text": result["formula"],
        "parameters": result.get("parameters") or line.get("parameters") or {},
        "coefficient": result["coefficient"],
        "adjustable_base": money(base),
        "updated_amount": result["updated_amount"],
        "adjustment_amount": result["adjustment_amount"],
        "presented_amount": presented_amount,
        "approved_amount": approved_amount,
        "status": status,
        "readjust_reason": line.get("readjust_reason") or "",
        "already_includes_update": bool(line.get("already_includes_update")),
        "notes": line.get("notes") or "",
    }


def apply_header_totals(cert: Certificate, raw_base, raw_cac, raw_approved) -> tuple[Decimal, dict, Decimal]:
    additions = money(cert.other_additions)
    deductions = money(cert.other_deductions)
    ret_base, parts = retention_parts(
        cert.retention_base_type_snapshot,
        list(cert.retention_concepts_snapshot or []),
        raw_base,
        raw_cac,
        raw_approved,
        additions,
    )
    retained = retention_amount(ret_base, cert.retention_percent_snapshot)
    sign = _sign(cert)
    cert.base_amount = money(sign * D(raw_base))
    cert.cac_amount = money(sign * D(raw_cac))
    cert.cac_approved_amount = money(sign * D(raw_approved))
    cert.gross_amount = money(sign * gross_amount(raw_base, raw_cac, additions))
    cert.retention_base_amount = money(sign * ret_base)
    cert.retention_amount = money(sign * retained)
    cert.net_amount = money(sign * (gross_amount(raw_base, raw_cac, additions) - retained - deductions))
    cert.retention_formula = formula_text(cert.retention_percent_snapshot, parts, ret_base, retained)
    return ret_base, parts, retained


def totals_from_lines(cert: Certificate, prepared: list[dict], extra_adjustments: list[CacAdjustment] | None = None):
    raw_base = sum((D(line["base_amount"]) for line in prepared), ZERO)
    raw_cac = sum((D(line["adjustment_amount"]) for line in prepared), ZERO)
    raw_approved = ZERO
    for line in prepared:
        adjustment = line.get("adjustment")
        if adjustment and adjustment["status"] in APPROVED_ADJUSTMENT:
            raw_approved += D(adjustment["approved_amount"] or adjustment["adjustment_amount"])
    for adjustment in extra_adjustments or []:
        if adjustment.status not in ACTIVE_ADJUSTMENT:
            continue
        if adjustment.certificate_item_id and any(True for _ in prepared):
            # Los reajustes de ítems se reconstruyen con las líneas nuevas.
            if adjustment.kind == "incluido":
                continue
        raw_cac += D(adjustment.adjustment_amount)
        if adjustment.status in APPROVED_ADJUSTMENT:
            raw_approved += D(adjustment.approved_amount or adjustment.adjustment_amount)
    ret_base, parts, retained = apply_header_totals(cert, raw_base, raw_cac, raw_approved)
    return {
        "base": s_money(cert.base_amount),
        "cac": s_money(cert.cac_amount),
        "gross": s_money(cert.gross_amount),
        "retention_base": s_money(ret_base),
        "retention": s_money(cert.retention_amount),
        "net": s_money(cert.net_amount),
        "formula": cert.retention_formula,
        "parts": {key: format(value, "f") for key, value in parts.items()},
    }


def recalculate_certificate(db: Session, cert: Certificate, today: date | None = None) -> Certificate:
    po = db.get(PurchaseOrder, cert.purchase_order_id)
    if po is None:
        raise AppError("No se encontró la orden de compra del certificado.", 404)
    # Los ítems y reajustes se guardan por clave foránea; se recargan para no calcular con colecciones viejas.
    db.flush()
    db.expire(cert, ["items", "adjustments"])
    raw_base = sum((D(item.base_amount) for item in cert.items), ZERO)
    raw_cac = ZERO
    raw_approved = ZERO
    for adjustment in cert.adjustments:
        if adjustment.status not in ACTIVE_ADJUSTMENT:
            continue
        raw_cac += D(adjustment.adjustment_amount)
        if adjustment.status in APPROVED_ADJUSTMENT:
            raw_approved += D(adjustment.approved_amount if adjustment.approved_amount is not None else adjustment.adjustment_amount)
    ret_base, parts, retained = apply_header_totals(cert, raw_base, raw_cac, raw_approved)
    _ensure_retention(db, cert, po, ret_base, parts, retained, today or date.today())
    refresh_payment_status(db, cert)
    if cert.status in COUNTS_IN_CERTIFIED:
        _enforce_saved_quantities(db, cert)
    return cert


def _enforce_saved_quantities(db: Session, cert: Certificate) -> None:
    for item in cert.items:
        po_item = item.po_item or db.get(PurchaseOrderItem, item.po_item_id)
        others = certified_quantity(db, item.po_item_id, exclude_certificate_id=cert.id)
        projected = others + _sign(cert) * D(item.quantity)
        item.accumulated_quantity = projected
        if projected - D(po_item.contracted_quantity) > Decimal("0.0001") and not item.overage_authorized:
            raise AppError(
                f"La cantidad acumulada de «{po_item.description}» supera lo contratado.",
                409,
                "overage",
            )


def _ensure_retention(db, cert, po, ret_base, parts, retained, today: date) -> Retention:
    retention = cert.retention
    if retention is None:
        retention = db.query(Retention).filter(Retention.certificate_id == cert.id).one_or_none()
    if retention is None:
        retention = Retention(
            certificate_id=cert.id,
            purchase_order_id=po.id,
            project_id=cert.project_id,
            client_id=po.client_id,
            release_trigger=po.release_trigger,
            release_days=po.release_days,
            contractual_start_date=po.contractual_start_date,
            explicit_release_date=po.explicit_release_date,
        )
        milestone = active_milestone_for(db, po)
        if milestone is not None:
            retention.milestone_id = milestone.id
            retention.completion_date = milestone.effective_date
        db.add(retention)
        cert.retention = retention
    if cert.status == CertificateStatus.VOIDED.value:
        retention.status = RetentionStatus.VOIDED.value
        retention.pending_amount = ZERO
        return retention
    retention.calculation_base = money(ret_base)
    retention.base_breakdown = {key: format(value, "f") for key, value in parts.items()}
    retention.percent = cert.retention_percent_snapshot
    retention.retained_amount = cert.retention_amount
    retention.formula = cert.retention_formula
    retention.retention_date = cert.issue_date
    retention.purchase_order_id = po.id
    retention.project_id = cert.project_id
    retention.client_id = po.client_id
    db.flush()
    retention.recovered_amount = recovered_amount(db, retention.id)
    _refresh_release_date(retention, cert)
    refresh_retention_status(db, retention, today)
    return retention


def _refresh_release_date(retention: Retention, cert: Certificate) -> None:
    retention.expected_release_date = compute_release_date(
        retention.release_trigger,
        retention.completion_date,
        retention.contractual_start_date,
        retention.explicit_release_date,
        cert.issue_date,
        retention.release_days,
    )
    retention.claim_enabled_date = retention.expected_release_date


def refresh_retention_status(db: Session, retention: Retention, today: date | None = None) -> None:
    today = today or date.today()
    cert = retention.certificate or db.get(Certificate, retention.certificate_id)
    if cert and cert.status == CertificateStatus.VOIDED.value:
        retention.status = RetentionStatus.VOIDED.value
        retention.pending_amount = ZERO
        return
    if retention.voided_at is not None:
        retention.status = RetentionStatus.VOIDED.value
        retention.pending_amount = ZERO
        return
    retained = money(retention.retained_amount)
    recovered = money(retention.recovered_amount)
    pending = money(retained - recovered)
    retention.pending_amount = pending
    recoverable = money(retained - recovered) if retained > 0 else ZERO
    if retained > 0 and recoverable <= CENT:
        retention.status = RetentionStatus.RECOVERED.value
        return
    if retained > 0 and recovered > 0 and recoverable > CENT:
        retention.status = RetentionStatus.PARTIAL.value
        return
    if retention.disputed:
        retention.status = RetentionStatus.DISPUTED.value
        return
    if retention.expected_release_date is None:
        retention.status = RetentionStatus.PENDING_DATE.value
        return
    claimed = has_open_claim(db, retention.id)
    if claimed:
        retention.status = RetentionStatus.CLAIMED.value
        return
    if today > retention.expected_release_date:
        retention.status = RetentionStatus.OVERDUE.value
        return
    if today >= retention.expected_release_date:
        retention.status = RetentionStatus.CLAIMABLE.value
        return
    if retention.expected_release_date <= today + timedelta(days=30):
        retention.status = RetentionStatus.UPCOMING.value
        return
    retention.status = RetentionStatus.ACCRUING.value


def retention_flags(retention: Retention, today: date | None = None) -> dict:
    today = today or date.today()
    pending = money(retention.pending_amount)
    void = retention.status == RetentionStatus.VOIDED.value
    expected = retention.expected_release_date
    positive_pending = pending > CENT and not void
    return {
        "is_claimable": bool(expected is not None and today >= expected and positive_pending),
        "is_overdue": bool(expected is not None and today > expected and positive_pending),
        "is_upcoming_30": bool(
            expected is not None and today <= expected <= today + timedelta(days=30) and positive_pending
        ),
        "is_upcoming_7": bool(
            expected is not None and today <= expected <= today + timedelta(days=7) and positive_pending
        ),
        "missing_release_date": expected is None and not void and pending > CENT,
    }


def refresh_payment_status(db: Session, cert: Certificate) -> None:
    if cert.status in {CertificateStatus.DRAFT.value, CertificateStatus.VOIDED.value}:
        return
    if cert.id is None:
        return
    collected = collected_amount(db, cert.id)
    target = abs(money(cert.net_amount))
    if collected <= CENT:
        if cert.status in {CertificateStatus.PARTIALLY_PAID.value, CertificateStatus.PAID.value}:
            if cert.invoiced_date:
                cert.status = CertificateStatus.INVOICED.value
            elif cert.approved_date:
                cert.status = CertificateStatus.APPROVED.value
            else:
                cert.status = CertificateStatus.SUBMITTED.value
        return
    if target <= CENT or collected + CENT >= target:
        cert.status = CertificateStatus.PAID.value
    else:
        cert.status = CertificateStatus.PARTIALLY_PAID.value


def payment_remaining(db: Session, payment: Payment) -> Decimal:
    used = (
        db.query(func.coalesce(func.sum(PaymentApplication.amount), 0))
        .filter(PaymentApplication.payment_id == payment.id)
        .scalar()
    )
    return money(D(payment.total_amount) - D(used))


def duplicate_application(db: Session, payment_id: int, concept: str, certificate_id, retention_id) -> bool:
    query = db.query(PaymentApplication).filter(
        PaymentApplication.payment_id == payment_id,
        PaymentApplication.concept == concept,
    )
    if certificate_id is None:
        query = query.filter(PaymentApplication.certificate_id.is_(None))
    else:
        query = query.filter(PaymentApplication.certificate_id == certificate_id)
    if retention_id is None:
        query = query.filter(PaymentApplication.retention_id.is_(None))
    else:
        query = query.filter(PaymentApplication.retention_id == retention_id)
    return query.first() is not None
