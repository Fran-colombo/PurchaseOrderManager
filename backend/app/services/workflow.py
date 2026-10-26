from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    CacAdjustment,
    CacIndex,
    Certificate,
    CertificateItem,
    Claim,
    ClaimEvent,
    ClaimRetention,
    Client,
    CompletionMilestone,
    ContractScope,
    Payment,
    PaymentApplication,
    Project,
    PurchaseOrder,
    PurchaseOrderItem,
    Retention,
    User,
)
from app.models.base import utcnow
from app.models.enums import (
    ACTIVE_ADJUSTMENT,
    APPROVED_ADJUSTMENT,
    COUNTS_IN_CERTIFIED,
    AdjustmentMethod,
    AdjustmentStatus,
    CertificateStatus,
    ClaimStatus,
    PaymentConcept,
    PaymentStatus,
    ReleaseTrigger,
    RetentionStatus,
    UserRole,
)
from app.services.audit import write_audit
from app.services.calculations import compute_release_date, contractual_adjustment, simple_variation
from app.services.ledger import (
    _refresh_release_date,
    collected_amount,
    duplicate_application,
    payment_remaining,
    prepare_lines,
    recalculate_certificate,
    recovered_amount,
    refresh_payment_status,
    refresh_retention_status,
)
from app.services.money import D, money
from app.services.serialize import s_money

RETENTION_FIELDS = {
    "retention_percent",
    "retention_base_type",
    "retention_concepts",
    "release_trigger",
    "release_days",
    "contractual_start_date",
    "explicit_release_date",
    "release_scope_id",
}


def _require_reason(reason: str, message: str) -> str:
    text = (reason or "").strip()
    if not text:
        raise AppError(message, code="reason_required")
    return text


def certificate_amounts(cert: Certificate) -> dict:
    return {
        "base_amount": s_money(cert.base_amount),
        "cac_amount": s_money(cert.cac_amount),
        "gross_amount": s_money(cert.gross_amount),
        "retention_amount": s_money(cert.retention_amount),
        "net_amount": s_money(cert.net_amount),
        "formula": cert.retention_formula,
    }


def save_certificate(db: Session, user: User, data: dict, cert: Certificate | None = None) -> Certificate:
    po = db.get(PurchaseOrder, data["purchase_order_id"] if cert is None else cert.purchase_order_id)
    if cert is None:
        po = db.get(PurchaseOrder, data["purchase_order_id"])
        if po is None:
            raise AppError("No se encontró la orden de compra.", 404, "not_found")
        number = data["client_number"].strip()
        duplicate = (
            db.query(Certificate)
            .filter(
                Certificate.purchase_order_id == po.id,
                Certificate.client_number == number,
                Certificate.status != CertificateStatus.VOIDED.value,
            )
            .first()
        )
        if duplicate:
            raise AppError(
                "Ya existe un certificado con ese número en esta orden de compra.",
                409,
                "duplicate_certificate",
            )
        cert = Certificate(
            client_number=number,
            purchase_order_id=po.id,
            project_id=po.project_id,
            document_type=data.get("document_type") or "avance",
            currency=po.currency,
            status=data.get("status") or CertificateStatus.DRAFT.value,
            retention_percent_snapshot=po.retention_percent,
            retention_base_type_snapshot=po.retention_base_type,
            retention_concepts_snapshot=list(po.retention_concepts or []),
        )
        db.add(cert)
        db.flush()
        creating = True
        before = None
    else:
        po = db.get(PurchaseOrder, cert.purchase_order_id)
        if cert.status == CertificateStatus.VOIDED.value:
            raise AppError("El certificado está anulado. Reactivalo antes de editarlo.", 409, "voided")
        creating = False
        before = certificate_amounts(cert)
        if data.get("client_number") and data["client_number"].strip() != cert.client_number:
            number = data["client_number"].strip()
            duplicate = (
                db.query(Certificate)
                .filter(
                    Certificate.purchase_order_id == po.id,
                    Certificate.client_number == number,
                    Certificate.status != CertificateStatus.VOIDED.value,
                    Certificate.id != cert.id,
                )
                .first()
            )
            if duplicate:
                raise AppError(
                    "Ya existe un certificado con ese número en esta orden de compra.",
                    409,
                    "duplicate_certificate",
                )
            cert.client_number = number

    _assign_certificate_header(cert, data)
    if data.get("items") is not None:
        issued = cert.status != CertificateStatus.DRAFT.value and not creating
        if issued and not data.get("confirm_financial_change"):
            prepared = prepare_lines(db, cert, po, data["items"], ignore_current_adjustments=True)
            raise AppError(
                "Cambiar los ítems modifica importes de un certificado ya emitido. Revisá el impacto y confirmá.",
                409,
                "confirm_required",
                {"before": before, "lines": len(prepared), "reason_required": True},
            )
        if issued:
            _require_reason(data.get("change_reason") or "", "Indicá el motivo de la corrección.")
            _void_adjustments(db, user, cert, data.get("change_reason") or "Corrección de ítems")
            for adjustment in cert.adjustments:
                adjustment.certificate_item_id = None
        else:
            for adjustment in list(cert.adjustments):
                db.delete(adjustment)
            db.flush()
        for item in list(cert.items):
            db.delete(item)
        db.flush()
        prepared = prepare_lines(db, cert, po, data["items"], ignore_current_adjustments=True)
        for line in prepared:
            item = CertificateItem(
                certificate_id=cert.id,
                po_item_id=line["po_item"].id,
                quantity=line["quantity"],
                accumulated_quantity=line["accumulated_quantity"],
                unit_price=line["unit_price"],
                base_amount=line["base_amount"],
                adjustment_amount=line["adjustment_amount"],
                adjusted_amount=line["adjusted_amount"],
                calculation_method=line["method"],
                coefficient=line["coefficient"],
                cac_base_index_id=line["cac_base_index_id"],
                cac_update_index_id=line["cac_update_index_id"],
                overage_authorized=line["overage_authorized"],
                overage_reason=line["overage_reason"],
                notes=line["notes"],
            )
            db.add(item)
            db.flush()
            if line["adjustment"]:
                payload = line["adjustment"]
                db.add(
                    CacAdjustment(
                        certificate_id=cert.id,
                        certificate_item_id=item.id,
                        calculated_by_id=user.id,
                        **payload,
                    )
                )
        db.flush()

    recalculate_certificate(db, cert)
    write_audit(
        db,
        user,
        "certificate",
        cert.id,
        "crear" if creating else "editar",
        old=before,
        new=certificate_amounts(cert),
        reason=data.get("change_reason") or "",
        impact="Se actualizaron los importes del certificado y su retención.",
    )
    db.flush()
    return cert


def _assign_certificate_header(cert: Certificate, data: dict) -> None:
    for field in (
        "document_type",
        "issue_date",
        "period_from",
        "period_to",
        "received_date",
        "approved_date",
        "invoiced_date",
        "payment_due_date",
        "notes",
    ):
        if field in data and data[field] is not None:
            setattr(cert, field, data[field])
    if "other_additions" in data and data["other_additions"] is not None:
        cert.other_additions = money(data["other_additions"])
    if "other_deductions" in data and data["other_deductions"] is not None:
        cert.other_deductions = money(data["other_deductions"])
    if data.get("status"):
        cert.status = data["status"]
    if cert.invoiced_date and cert.status == CertificateStatus.APPROVED.value:
        cert.status = CertificateStatus.INVOICED.value


def _void_adjustments(db: Session, user: User, cert: Certificate, reason: str) -> None:
    for adjustment in cert.adjustments:
        if adjustment.status in ACTIVE_ADJUSTMENT:
            adjustment.status = AdjustmentStatus.VOIDED.value
            adjustment.void_reason = reason
            adjustment.voided_at = utcnow()
            adjustment.voided_by_id = user.id


def void_certificate(db: Session, user: User, cert: Certificate, reason: str) -> Certificate:
    reason = _require_reason(reason, "Indicá el motivo de la anulación.")
    active_payments = (
        db.query(PaymentApplication)
        .join(Payment, Payment.id == PaymentApplication.payment_id)
        .filter(
            PaymentApplication.certificate_id == cert.id,
            Payment.status == PaymentStatus.REGISTERED.value,
        )
        .count()
    )
    if active_payments:
        raise AppError(
            "Este certificado tiene pagos aplicados. Anulá o reasigná esos pagos antes de anularlo.",
            409,
            "has_payments",
        )
    before = certificate_amounts(cert)
    cert.status = CertificateStatus.VOIDED.value
    cert.void_reason = reason
    cert.voided_at = utcnow()
    cert.voided_by_id = user.id
    if cert.retention:
        cert.retention.status = RetentionStatus.VOIDED.value
        cert.retention.void_reason = reason
        cert.retention.voided_at = utcnow()
        cert.retention.voided_by_id = user.id
        cert.retention.pending_amount = Decimal("0")
    write_audit(
        db,
        user,
        "certificate",
        cert.id,
        "anular",
        old=before,
        new={"status": cert.status},
        reason=reason,
        impact="El certificado y su retención dejan de entrar en los saldos vigentes.",
    )
    db.flush()
    return cert


def reactivate_certificate(db: Session, user: User, cert: Certificate, reason: str) -> Certificate:
    if user.role != UserRole.SYSADMIN.value:
        raise AppError("Solo un administrador puede reactivar un certificado.", 403, "forbidden")
    reason = _require_reason(reason, "Indicá el motivo de la reactivación.")
    cert.status = CertificateStatus.SUBMITTED.value
    cert.void_reason = ""
    cert.voided_at = None
    cert.voided_by_id = None
    if cert.retention:
        cert.retention.voided_at = None
        cert.retention.void_reason = ""
    recalculate_certificate(db, cert)
    write_audit(db, user, "certificate", cert.id, "reactivar", reason=reason, new=certificate_amounts(cert))
    db.flush()
    return cert


def create_standalone_adjustment(db: Session, user: User, data: dict) -> CacAdjustment:
    po = db.get(PurchaseOrder, data["purchase_order_id"])
    if po is None:
        raise AppError("No se encontró la orden de compra.", 404, "not_found")
    if data.get("already_includes_update") and not data.get("allow_readjust"):
        raise AppError(
            "No se puede reajustar un importe que ya incluye actualización sin autorización explícita.",
            409,
            "duplicate_adjustment",
        )
    if data.get("allow_readjust"):
        _require_reason(data.get("readjust_reason") or "", "Indicá el motivo para reajustar de nuevo.")
    if data.get("certificate_item_id"):
        existing = (
            db.query(CacAdjustment)
            .filter(
                CacAdjustment.certificate_item_id == data["certificate_item_id"],
                CacAdjustment.status.in_(ACTIVE_ADJUSTMENT),
            )
            .count()
        )
        if existing and not data.get("allow_readjust"):
            raise AppError("Ese rubro ya tiene un reajuste vigente.", 409, "duplicate_adjustment")
        if data.get("allow_readjust"):
            for current in (
                db.query(CacAdjustment)
                .filter(
                    CacAdjustment.certificate_item_id == data["certificate_item_id"],
                    CacAdjustment.status.in_(ACTIVE_ADJUSTMENT),
                )
                .all()
            ):
                current.status = AdjustmentStatus.SUPERSEDED.value
    method = data["method"]
    base = money(data["adjustable_base"])
    if method == AdjustmentMethod.SIMPLE.value:
        base_index = db.get(CacIndex, data.get("base_index_id"))
        update_index = db.get(CacIndex, data.get("update_index_id"))
        if base_index is None or update_index is None:
            raise AppError("Elegí el índice CAC base y el actualizado.", code="cac_index_missing")
        result = simple_variation(base, base_index.published_value, update_index.published_value)
        periods = {
            "base_period_year": base_index.period_year,
            "base_period_month": base_index.period_month,
            "update_period_year": update_index.period_year,
            "update_period_month": update_index.period_month,
            "base_index_id": base_index.id,
            "update_index_id": update_index.id,
        }
    elif method == AdjustmentMethod.CONTRACTUAL.value:
        result = contractual_adjustment(base, data.get("validated_amount"), data.get("formula_text") or "", data.get("parameters"))
        periods = {
            "base_period_year": data.get("base_period_year"),
            "base_period_month": data.get("base_period_month"),
            "update_period_year": data.get("update_period_year"),
            "update_period_month": data.get("update_period_month"),
            "base_index_id": None,
            "update_index_id": None,
        }
    else:
        raise AppError("El método de cálculo no es válido.", code="invalid_method")

    status = data.get("status") or AdjustmentStatus.CALCULATED.value
    approved_amount = result["adjustment_amount"] if status in APPROVED_ADJUSTMENT else None
    presented_amount = result["adjustment_amount"] if status in APPROVED_ADJUSTMENT or status == AdjustmentStatus.PRESENTED.value else None
    if data.get("replaces_id"):
        previous = db.get(CacAdjustment, data["replaces_id"])
        if previous:
            previous.status = AdjustmentStatus.SUPERSEDED.value
    adjustment = CacAdjustment(
        certificate_id=data.get("certificate_id"),
        certificate_item_id=data.get("certificate_item_id"),
        purchase_order_id=po.id,
        project_id=po.project_id,
        kind=data.get("kind") or "posterior",
        method=method,
        formula_text=result["formula"],
        parameters=result.get("parameters") or {},
        coefficient=result["coefficient"],
        adjustable_base=base,
        updated_amount=result["updated_amount"],
        adjustment_amount=result["adjustment_amount"],
        presented_amount=presented_amount,
        approved_amount=approved_amount,
        status=status,
        replaces_id=data.get("replaces_id"),
        readjust_reason=data.get("readjust_reason") or "",
        already_includes_update=bool(data.get("already_includes_update")),
        calculated_by_id=user.id,
        notes=data.get("notes") or "",
        **periods,
    )
    db.add(adjustment)
    db.flush()
    if adjustment.certificate_id:
        cert = db.get(Certificate, adjustment.certificate_id)
        if cert:
            recalculate_certificate(db, cert)
    write_audit(
        db,
        user,
        "cac_adjustment",
        adjustment.id,
        "crear",
        new={"adjustment_amount": s_money(adjustment.adjustment_amount), "status": adjustment.status, "method": method},
        impact="El reajuste queda como cálculo registrado hasta que se apruebe. No se lo toma como importe oficial del cliente.",
    )
    return adjustment


def set_adjustment_status(db: Session, user: User, adjustment: CacAdjustment, status: str, reason: str) -> CacAdjustment:
    if status not in {item.value for item in AdjustmentStatus}:
        raise AppError("El estado del reajuste no es válido.", code="invalid_status")
    if status == AdjustmentStatus.VOIDED.value:
        _require_reason(reason, "Indicá el motivo de la anulación.")
        adjustment.void_reason = reason
        adjustment.voided_at = utcnow()
        adjustment.voided_by_id = user.id
    before = adjustment.status
    adjustment.status = status
    if status in APPROVED_ADJUSTMENT and adjustment.approved_amount is None:
        adjustment.approved_amount = adjustment.adjustment_amount
    if status in APPROVED_ADJUSTMENT or status == AdjustmentStatus.PRESENTED.value:
        if adjustment.presented_amount is None:
            adjustment.presented_amount = adjustment.adjustment_amount
    if adjustment.certificate_id:
        cert = db.get(Certificate, adjustment.certificate_id)
        if cert:
            recalculate_certificate(db, cert)
    write_audit(
        db,
        user,
        "cac_adjustment",
        adjustment.id,
        "cambiar_estado",
        old={"status": before},
        new={"status": status, "approved_amount": s_money(adjustment.approved_amount or 0)},
        reason=reason or "",
        impact="Un reajuste calculado no se considera aprobado hasta este cambio.",
    )
    db.flush()
    return adjustment


def create_payment(db: Session, user: User, data: dict) -> Payment:
    client = db.get(Client, data["client_id"])
    if client is None:
        raise AppError("No se encontró el cliente.", 404, "not_found")
    payment = Payment(
        client_id=client.id,
        payment_date=data["payment_date"],
        total_amount=money(data["total_amount"]),
        currency=data.get("currency") or "ARS",
        method=data.get("method") or "",
        reference=data.get("reference") or "",
        notes=data.get("notes") or "",
        created_by_id=user.id,
        status=PaymentStatus.REGISTERED.value,
    )
    if payment.total_amount <= 0:
        raise AppError("El importe del pago debe ser mayor a cero.")
    db.add(payment)
    db.flush()
    for application in data.get("applications") or []:
        add_application(db, user, payment, application)
    write_audit(
        db,
        user,
        "payment",
        payment.id,
        "crear",
        new={"total_amount": s_money(payment.total_amount), "currency": payment.currency},
    )
    return payment


def add_application(db: Session, user: User, payment: Payment, data: dict) -> PaymentApplication:
    if payment.status != PaymentStatus.REGISTERED.value:
        raise AppError("No se puede aplicar un pago anulado.", 409, "voided")
    amount = money(data["amount"])
    if amount <= 0:
        raise AppError("El importe a aplicar debe ser mayor a cero.")
    concept = data["concept"]
    certificate_id = data.get("certificate_id")
    retention_id = data.get("retention_id")
    if duplicate_application(db, payment.id, concept, certificate_id, retention_id):
        raise AppError("Esa aplicación ya fue registrada para este pago.", 409, "duplicate_application")
    remaining = payment_remaining(db, payment)
    if amount > remaining + Decimal("0.01") and not data.get("authorized_overage"):
        raise AppError("El importe supera el saldo disponible del pago.", 409, "payment_exceeded")
    if data.get("authorized_overage"):
        _require_reason(data.get("overage_reason") or "", "Indicá el motivo del ajuste de pago.")

    if concept == PaymentConcept.CERTIFICATE_NET.value:
        cert = db.get(Certificate, certificate_id)
        if cert is None or cert.status == CertificateStatus.VOIDED.value:
            raise AppError("El certificado no está disponible para cobrar.", code="invalid_certificate")
        if cert.currency != payment.currency:
            raise AppError("La moneda del pago no coincide con la del certificado.", code="currency_mismatch")
        target = abs(money(cert.net_amount))
        already = collected_amount(db, cert.id)
        if amount > target - already + Decimal("0.01") and not data.get("authorized_overage"):
            raise AppError("El importe supera el saldo pendiente del certificado.", 409, "certificate_exceeded")
    elif concept == PaymentConcept.RETENTION_RECOVERY.value:
        retention = db.get(Retention, retention_id)
        if retention is None or retention.status == RetentionStatus.VOIDED.value:
            raise AppError("La retención no está disponible.", code="invalid_retention")
        cert = db.get(Certificate, retention.certificate_id)
        if cert and cert.currency != payment.currency:
            raise AppError("La moneda del pago no coincide con la de la retención.", code="currency_mismatch")
        recoverable = money(D(retention.retained_amount) - recovered_amount(db, retention.id))
        if recoverable <= 0:
            raise AppError("Esta retención no tiene saldo pendiente de recuperar.", 409, "nothing_pending")
        if amount > recoverable + Decimal("0.01") and not data.get("authorized_overage"):
            raise AppError("El importe supera el saldo retenido pendiente.", 409, "retention_exceeded")
    elif concept != PaymentConcept.OTHER.value:
        raise AppError("El concepto del pago no es válido.", code="invalid_concept")

    application = PaymentApplication(
        payment_id=payment.id,
        certificate_id=certificate_id,
        retention_id=retention_id,
        concept=concept,
        amount=amount,
        authorized_overage=bool(data.get("authorized_overage")),
        overage_reason=data.get("overage_reason") or "",
        notes=data.get("notes") or "",
    )
    db.add(application)
    db.flush()
    if certificate_id and concept == PaymentConcept.CERTIFICATE_NET.value:
        refresh_payment_status(db, db.get(Certificate, certificate_id))
    if retention_id and concept == PaymentConcept.RETENTION_RECOVERY.value:
        retention = db.get(Retention, retention_id)
        retention.recovered_amount = recovered_amount(db, retention.id)
        refresh_retention_status(db, retention)
    write_audit(
        db,
        user,
        "payment_application",
        application.id,
        "crear",
        new={"payment_id": payment.id, "concept": concept, "amount": s_money(amount)},
        impact="El saldo pendiente se actualiza solo con dinero aplicado, no con la aprobación del certificado.",
    )
    return application


def void_payment(db: Session, user: User, payment: Payment, reason: str) -> Payment:
    reason = _require_reason(reason, "Indicá el motivo de la anulación del pago.")
    payment.status = PaymentStatus.VOIDED.value
    payment.void_reason = reason
    payment.voided_at = utcnow()
    payment.voided_by_id = user.id
    touched_certs = set()
    touched_retentions = set()
    for application in payment.applications:
        if application.certificate_id:
            touched_certs.add(application.certificate_id)
        if application.retention_id:
            touched_retentions.add(application.retention_id)
    for certificate_id in touched_certs:
        refresh_payment_status(db, db.get(Certificate, certificate_id))
    for retention_id in touched_retentions:
        retention = db.get(Retention, retention_id)
        retention.recovered_amount = recovered_amount(db, retention.id)
        refresh_retention_status(db, retention)
    write_audit(
        db,
        user,
        "payment",
        payment.id,
        "anular",
        reason=reason,
        impact="Las aplicaciones dejan de sumar en los cobros y en las cauciones recuperadas.",
    )
    db.flush()
    return payment


def affected_retentions(
    db: Session,
    scope_type: str,
    project_id: int,
    purchase_order_id: int | None,
    contract_scope_id: int | None,
) -> list[Retention]:
    query = (
        db.query(Retention)
        .join(Certificate, Certificate.id == Retention.certificate_id)
        .filter(Certificate.status != CertificateStatus.VOIDED.value, Retention.voided_at.is_(None))
    )
    if scope_type == "obra":
        rows = query.filter(
            Retention.project_id == project_id,
            Retention.release_trigger == ReleaseTrigger.PROJECT.value,
        ).all()
    elif scope_type == "orden":
        rows = query.filter(
            Retention.purchase_order_id == purchase_order_id,
            Retention.release_trigger == ReleaseTrigger.PURCHASE_ORDER.value,
        ).all()
    elif scope_type == "contractual":
        rows = query.filter(
            Retention.purchase_order_id == purchase_order_id,
            Retention.release_trigger == ReleaseTrigger.CONTRACTUAL.value,
        ).all()
    elif scope_type == "alcance":
        rows = []
        for retention in query.filter(Retention.release_trigger == ReleaseTrigger.SCOPE.value).all():
            po = db.get(PurchaseOrder, retention.purchase_order_id)
            if po and po.release_scope_id == contract_scope_id:
                rows.append(retention)
                continue
            cert = db.get(Certificate, retention.certificate_id)
            if cert and any(
                (item.po_item.scope_id if item.po_item else None) == contract_scope_id for item in cert.items
            ):
                rows.append(retention)
    else:
        raise AppError("El alcance del hito no es válido.", code="invalid_scope")
    return rows


def milestone_preview(retentions: list[Retention], effective_date: date) -> list[dict]:
    preview = []
    for retention in retentions:
        cert = retention.certificate
        new_date = compute_release_date(
            retention.release_trigger,
            effective_date,
            retention.contractual_start_date,
            retention.explicit_release_date,
            cert.issue_date if cert else None,
            retention.release_days,
        )
        preview.append(
            {
                "retention_id": retention.id,
                "certificate_id": retention.certificate_id,
                "pending_amount": s_money(retention.pending_amount),
                "previous_release_date": retention.expected_release_date.isoformat() if retention.expected_release_date else None,
                "new_release_date": new_date.isoformat() if new_date else None,
            }
        )
    return preview


def register_milestone(db: Session, user: User, data: dict) -> CompletionMilestone:
    project = db.get(Project, data["project_id"])
    if project is None:
        raise AppError("No se encontró la obra.", 404, "not_found")
    affected = affected_retentions(
        db,
        data["scope_type"],
        data["project_id"],
        data.get("purchase_order_id"),
        data.get("contract_scope_id"),
    )
    preview = milestone_preview(affected, data["effective_date"])
    if affected and not data.get("confirm"):
        raise AppError(
            "Registrá la finalización solo después de revisar las retenciones que cambian de vencimiento.",
            409,
            "confirm_required",
            {"affected": preview},
        )
    if affected and data.get("confirm"):
        _require_reason(data.get("reason") or "", "Indicá una observación o el motivo del registro.")
    _deactivate_previous(db, data)
    milestone = CompletionMilestone(
        scope_type=data["scope_type"],
        project_id=data["project_id"],
        purchase_order_id=data.get("purchase_order_id"),
        contract_scope_id=data.get("contract_scope_id"),
        effective_date=data["effective_date"],
        notes=data.get("notes") or data.get("reason") or "",
        recorded_by_id=user.id,
        is_active=True,
    )
    db.add(milestone)
    db.flush()
    if data["scope_type"] == "obra":
        project.actual_end_date = data["effective_date"]
    for retention in affected:
        previous = retention.expected_release_date.isoformat() if retention.expected_release_date else None
        retention.milestone_id = milestone.id
        retention.completion_date = data["effective_date"]
        cert = db.get(Certificate, retention.certificate_id)
        _refresh_release_date(retention, cert)
        refresh_retention_status(db, retention)
        write_audit(
            db,
            user,
            "retention",
            retention.id,
            "recalcular_vencimiento",
            old={"expected_release_date": previous},
            new={"expected_release_date": retention.expected_release_date.isoformat() if retention.expected_release_date else None},
            reason=data.get("reason") or "",
            impact="La fecha de liberación se calcula desde la finalización registrada, no desde la fecha del certificado.",
        )
    write_audit(
        db,
        user,
        "milestone",
        milestone.id,
        "crear",
        new={"effective_date": data["effective_date"].isoformat(), "scope_type": data["scope_type"]},
        reason=data.get("reason") or "",
    )
    db.flush()
    return milestone


def update_milestone(db: Session, user: User, milestone: CompletionMilestone, data: dict) -> CompletionMilestone:
    new_date = data.get("effective_date") or milestone.effective_date
    affected = affected_retentions(
        db,
        milestone.scope_type,
        milestone.project_id,
        milestone.purchase_order_id,
        milestone.contract_scope_id,
    )
    preview = milestone_preview(affected, new_date)
    if affected and not data.get("confirm"):
        raise AppError(
            "Cambiar la fecha de finalización modifica vencimientos de caución. Revisá el impacto antes de confirmar.",
            409,
            "confirm_required",
            {"affected": preview},
        )
    reason = ""
    if affected:
        reason = _require_reason(data.get("reason") or "", "Indicá el motivo del cambio de fecha.")
    old_date = milestone.effective_date
    milestone.effective_date = new_date
    if data.get("notes") is not None:
        milestone.notes = data["notes"]
    for retention in affected:
        previous = retention.expected_release_date.isoformat() if retention.expected_release_date else None
        retention.completion_date = new_date
        cert = db.get(Certificate, retention.certificate_id)
        _refresh_release_date(retention, cert)
        refresh_retention_status(db, retention)
        write_audit(
            db,
            user,
            "retention",
            retention.id,
            "recalcular_vencimiento",
            old={"expected_release_date": previous, "completion_date": old_date.isoformat()},
            new={"expected_release_date": retention.expected_release_date.isoformat() if retention.expected_release_date else None},
            reason=reason,
        )
    if milestone.scope_type == "obra":
        project = db.get(Project, milestone.project_id)
        if project:
            project.actual_end_date = new_date
    write_audit(
        db,
        user,
        "milestone",
        milestone.id,
        "editar",
        old={"effective_date": old_date.isoformat()},
        new={"effective_date": new_date.isoformat()},
        reason=reason,
    )
    db.flush()
    return milestone


def _deactivate_previous(db: Session, data: dict) -> None:
    query = db.query(CompletionMilestone).filter(CompletionMilestone.is_active.is_(True))
    scope = data["scope_type"]
    if scope == "obra":
        query = query.filter(CompletionMilestone.scope_type == "obra", CompletionMilestone.project_id == data["project_id"])
    elif scope == "orden":
        query = query.filter(
            CompletionMilestone.scope_type == "orden",
            CompletionMilestone.purchase_order_id == data.get("purchase_order_id"),
        )
    elif scope == "alcance":
        query = query.filter(
            CompletionMilestone.scope_type == "alcance",
            CompletionMilestone.contract_scope_id == data.get("contract_scope_id"),
        )
    elif scope == "contractual":
        query = query.filter(
            CompletionMilestone.scope_type == "contractual",
            CompletionMilestone.purchase_order_id == data.get("purchase_order_id"),
        )
    for previous in query.all():
        previous.is_active = False


def preview_retention_policy(db: Session, po: PurchaseOrder, data: dict) -> list[dict]:
    preview = []
    percent = D(data.get("retention_percent", po.retention_percent))
    base_type = data.get("retention_base_type", po.retention_base_type)
    concepts = data.get("retention_concepts", po.retention_concepts)
    for cert in po.certificates:
        if cert.status == CertificateStatus.VOIDED.value:
            continue
        old = s_money(cert.retention_amount)
        saved = (
            cert.retention_percent_snapshot,
            cert.retention_base_type_snapshot,
            list(cert.retention_concepts_snapshot or []),
        )
        cert.retention_percent_snapshot = percent
        cert.retention_base_type_snapshot = base_type
        cert.retention_concepts_snapshot = list(concepts or [])
        recalculate_certificate(db, cert)
        preview.append(
            {
                "certificate_id": cert.id,
                "client_number": cert.client_number,
                "previous_retention": old,
                "new_retention": s_money(cert.retention_amount),
                "formula": cert.retention_formula,
            }
        )
        cert.retention_percent_snapshot, cert.retention_base_type_snapshot, cert.retention_concepts_snapshot = saved
        recalculate_certificate(db, cert)
    return preview


def apply_purchase_order_changes(db: Session, user: User, po: PurchaseOrder, data: dict) -> PurchaseOrder:
    policy_changed = any(field in data for field in RETENTION_FIELDS)
    issued = [cert for cert in po.certificates if cert.status not in {CertificateStatus.DRAFT.value, CertificateStatus.VOIDED.value}]
    if policy_changed and issued and not data.get("confirm_recalculation"):
        raise AppError(
            "Cambiar la retención o el plazo no modifica solo los certificados ya emitidos. Confirmá si querés recalcularlos.",
            409,
            "confirm_required",
            {"certificates": [{"id": cert.id, "number": cert.client_number, "retention": s_money(cert.retention_amount)} for cert in issued]},
        )
    reason = ""
    if policy_changed and issued:
        reason = _require_reason(data.get("reason") or "", "Indicá el motivo del recálculo.")
    before = {
        "retention_percent": str(po.retention_percent),
        "retention_base_type": po.retention_base_type,
        "release_trigger": po.release_trigger,
        "release_days": po.release_days,
    }
    for field in (
        "client_po_number",
        "issue_date",
        "acceptance_date",
        "currency",
        "payment_terms",
        "payment_term_days",
        "retention_percent",
        "retention_base_type",
        "release_trigger",
        "release_days",
        "contractual_start_date",
        "explicit_release_date",
        "release_scope_id",
        "status",
        "notes",
    ):
        if field in data and data[field] is not None:
            setattr(po, field, data[field])
    if "retention_concepts" in data and data["retention_concepts"] is not None:
        po.retention_concepts = data["retention_concepts"]
    if "retention_percent" in data and data["retention_percent"] is not None:
        po.retention_percent = D(data["retention_percent"])
    if policy_changed and data.get("confirm_recalculation"):
        for cert in po.certificates:
            if cert.status == CertificateStatus.VOIDED.value:
                continue
            cert.retention_percent_snapshot = po.retention_percent
            cert.retention_base_type_snapshot = po.retention_base_type
            cert.retention_concepts_snapshot = list(po.retention_concepts or [])
            if cert.retention:
                cert.retention.release_trigger = po.release_trigger
                cert.retention.release_days = po.release_days
                cert.retention.contractual_start_date = po.contractual_start_date
                cert.retention.explicit_release_date = po.explicit_release_date
                _refresh_release_date(cert.retention, cert)
            recalculate_certificate(db, cert)
            write_audit(
                db,
                user,
                "certificate",
                cert.id,
                "recalcular_retencion",
                new=certificate_amounts(cert),
                reason=reason,
                impact="El recálculo quedó registrado. Los certificados no se modifican en silencio.",
            )
    write_audit(db, user, "purchase_order", po.id, "editar", old=before, new={"status": po.status}, reason=reason)
    db.flush()
    return po


def create_claim(db: Session, user: User, data: dict) -> Claim:
    client = db.get(Client, data["client_id"])
    if client is None:
        raise AppError("No se encontró el cliente.", 404, "not_found")
    claim = Claim(
        client_id=client.id,
        project_id=data.get("project_id"),
        purchase_order_id=data.get("purchase_order_id"),
        claim_date=data["claim_date"],
        channel=data.get("channel") or "correo",
        recipient=data.get("recipient") or "",
        internal_owner=data.get("internal_owner") or "",
        response=data.get("response") or "",
        promised_payment_date=data.get("promised_payment_date"),
        next_followup_date=data.get("next_followup_date"),
        status=data.get("status") or ClaimStatus.SENT.value,
        amount_claimed=money(data.get("amount_claimed") or 0),
        currency=data.get("currency") or "ARS",
        notes=data.get("notes") or "",
    )
    db.add(claim)
    db.flush()
    for link in data.get("retentions") or []:
        retention = db.get(Retention, link["retention_id"])
        if retention is None:
            raise AppError("Hay una retención que no existe.", code="invalid_retention")
        db.add(ClaimRetention(claim_id=claim.id, retention_id=retention.id, amount=money(link.get("amount") or retention.pending_amount)))
        retention.last_claim_date = claim.claim_date
        retention.next_followup_date = claim.next_followup_date
        refresh_retention_status(db, retention)
    db.add(
        ClaimEvent(
            claim_id=claim.id,
            event_type="reclamo",
            description=data.get("notes") or "Reclamo registrado",
            user_id=user.id,
        )
    )
    write_audit(
        db,
        user,
        "claim",
        claim.id,
        "crear",
        new={"amount_claimed": s_money(claim.amount_claimed), "status": claim.status},
        impact="El reclamo no recupera la caución. El saldo sigue pendiente hasta la devolución.",
    )
    db.flush()
    return claim


def add_claim_event(db: Session, user: User, claim: Claim, data: dict) -> ClaimEvent:
    if data.get("status"):
        claim.status = data["status"]
    if data.get("response") is not None:
        claim.response = data["response"]
    if "promised_payment_date" in data:
        claim.promised_payment_date = data["promised_payment_date"]
    if "next_followup_date" in data:
        claim.next_followup_date = data["next_followup_date"]
    event = ClaimEvent(
        claim_id=claim.id,
        event_type=data.get("event_type") or "seguimiento",
        description=data.get("description") or "",
        user_id=user.id,
    )
    db.add(event)
    for link in claim.links:
        retention = db.get(Retention, link.retention_id)
        if retention:
            retention.next_followup_date = claim.next_followup_date
            refresh_retention_status(db, retention)
    write_audit(db, user, "claim", claim.id, "seguimiento", new={"status": claim.status, "description": event.description})
    db.flush()
    return event


def void_claim(db: Session, user: User, claim: Claim, reason: str) -> Claim:
    reason = _require_reason(reason, "Indicá el motivo de la anulación del reclamo.")
    claim.status = ClaimStatus.VOIDED.value
    claim.void_reason = reason
    claim.voided_at = utcnow()
    claim.voided_by_id = user.id
    for link in claim.links:
        retention = db.get(Retention, link.retention_id)
        if retention:
            refresh_retention_status(db, retention)
    write_audit(db, user, "claim", claim.id, "anular", reason=reason)
    db.flush()
    return claim


def active_admin_count(db: Session, exclude_id: int | None = None) -> int:
    query = db.query(User).filter(User.role == UserRole.SYSADMIN.value, User.is_active.is_(True))
    if exclude_id is not None:
        query = query.filter(User.id != exclude_id)
    return query.count()


def guard_last_admin(db: Session, user: User, new_role: str | None, new_active: bool | None) -> None:
    if user.role != UserRole.SYSADMIN.value or not user.is_active:
        return
    role = new_role if new_role is not None else user.role
    active = user.is_active if new_active is None else new_active
    if role == UserRole.SYSADMIN.value and active:
        return
    if active_admin_count(db, exclude_id=user.id) <= 0:
        raise AppError(
            "No se puede desactivar ni cambiar el rol del último administrador activo.",
            409,
            "last_admin",
        )
