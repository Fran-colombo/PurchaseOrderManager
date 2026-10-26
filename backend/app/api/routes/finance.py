from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_or_404, require_sysadmin
from app.core.database import get_db
from app.core.errors import AppError
from app.models import CacAdjustment, CacIndex, Certificate, Claim, ClaimRetention, CompletionMilestone, Payment, PurchaseOrder, Retention, User
from app.models.enums import UserRole
from app.schemas.inputs import (
    AdjustmentIn,
    AdjustmentPreviewIn,
    ApplicationIn,
    CertificateIn,
    CertificateUpdate,
    ClaimEventIn,
    ClaimIn,
    IndexIn,
    MilestoneIn,
    MilestoneUpdate,
    PaymentIn,
    ReasonIn,
    RetentionUpdate,
    StatusIn,
)
from app.services.audit import write_audit
from app.services.calculations import simple_variation
from app.services.ledger import refresh_retention_status
from app.services.presenters import adjustment_out, certificate_out, claim_out, index_out, milestone_out, payment_out, retention_out
from app.services.serialize import s_coef, s_money
from app.services.workflow import (
    add_application,
    add_claim_event,
    create_claim,
    create_payment,
    create_standalone_adjustment,
    milestone_preview,
    reactivate_certificate,
    register_milestone,
    save_certificate,
    set_adjustment_status,
    update_milestone,
    void_certificate,
    void_claim,
    void_payment,
    affected_retentions,
)

router = APIRouter(tags=["finanzas"])


def _page(query, page: int, page_size: int):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return rows, total, page, page_size


@router.get("/certificates")
def list_certificates(
    q: str = "",
    project_id: int | None = None,
    purchase_order_id: int | None = None,
    client_id: int | None = None,
    status: str = "",
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Certificate)
    if client_id:
        query = query.join(PurchaseOrder, PurchaseOrder.id == Certificate.purchase_order_id).filter(PurchaseOrder.client_id == client_id)
    if q:
        query = query.filter(Certificate.client_number.ilike(f"%{q}%"))
    if project_id:
        query = query.filter(Certificate.project_id == project_id)
    if purchase_order_id:
        query = query.filter(Certificate.purchase_order_id == purchase_order_id)
    if status:
        query = query.filter(Certificate.status == status)
    rows, total, page, page_size = _page(query.order_by(Certificate.id.desc()), page, page_size)
    return {"items": [certificate_out(db, row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/certificates")
def create_certificate(data: CertificateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cert = save_certificate(db, user, data.model_dump())
    return certificate_out(db, cert, detailed=True)


@router.get("/certificates/{certificate_id}")
def get_certificate(certificate_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    cert = get_or_404(db, Certificate, certificate_id, "No se encontró el certificado.")
    return certificate_out(db, cert, detailed=True)


@router.put("/certificates/{certificate_id}")
def update_certificate(certificate_id: int, data: CertificateUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cert = get_or_404(db, Certificate, certificate_id, "No se encontró el certificado.")
    cert = save_certificate(db, user, data.model_dump(exclude_unset=True), cert)
    return certificate_out(db, cert, detailed=True)


@router.post("/certificates/{certificate_id}/void")
def void_cert(certificate_id: int, data: ReasonIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cert = get_or_404(db, Certificate, certificate_id, "No se encontró el certificado.")
    return certificate_out(db, void_certificate(db, user, cert, data.reason), detailed=True)


@router.post("/certificates/{certificate_id}/reactivate")
def reactivate_cert(certificate_id: int, data: ReasonIn, db: Session = Depends(get_db), user: User = Depends(require_sysadmin)):
    cert = get_or_404(db, Certificate, certificate_id, "No se encontró el certificado.")
    return certificate_out(db, reactivate_certificate(db, user, cert, data.reason), detailed=True)


@router.delete("/certificates/{certificate_id}")
def delete_certificate(certificate_id: int, db: Session = Depends(get_db), _: User = Depends(require_sysadmin)):
    cert = get_or_404(db, Certificate, certificate_id, "No se encontró el certificado.")
    if cert.status != "borrador":
        raise AppError("Los certificados emitidos se anulan con un motivo. No se borran.", 409, "historical")
    for adjustment in list(cert.adjustments):
        db.delete(adjustment)
    if cert.retention:
        db.delete(cert.retention)
    db.delete(cert)
    return {"ok": True}


@router.get("/cac-indexes")
def list_indexes(series_code: str = "", page: int = 1, page_size: int = 50, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(CacIndex)
    if series_code:
        query = query.filter(CacIndex.series_code == series_code)
    rows, total, page, page_size = _page(query.order_by(CacIndex.period_year.desc(), CacIndex.period_month.desc()), page, page_size)
    return {"items": [index_out(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/cac-indexes")
def create_index(data: IndexIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if data.published_value < 0:
        raise AppError("El índice no puede ser negativo.", code="cac_index_invalid")
    row = CacIndex(**data.model_dump())
    db.add(row)
    db.flush()
    write_audit(db, user, "cac_index", row.id, "crear", new={"value": str(row.published_value), "series": row.series_code})
    return index_out(row)


@router.put("/cac-indexes/{index_id}")
def update_index(index_id: int, data: IndexIn, db: Session = Depends(get_db), user: User = Depends(require_sysadmin)):
    row = get_or_404(db, CacIndex, index_id, "No se encontró el índice.")
    if data.published_value == 0:
        raise AppError("El índice CAC base no puede quedar en cero si se usa para reajustar.", code="cac_index_zero")
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    write_audit(db, user, "cac_index", row.id, "editar", reason="Edición de índice publicada")
    return index_out(row)


@router.delete("/cac-indexes/{index_id}")
def delete_index(index_id: int, db: Session = Depends(get_db), _: User = Depends(require_sysadmin)):
    row = get_or_404(db, CacIndex, index_id, "No se encontró el índice.")
    used = db.query(CacAdjustment).filter((CacAdjustment.base_index_id == row.id) | (CacAdjustment.update_index_id == row.id)).count()
    if used:
        raise AppError("El índice ya se usó en reajustes. No se puede borrar.", 409, "has_dependencies")
    db.delete(row)
    return {"ok": True}


@router.post("/cac-indexes/import")
def import_indexes(_: User = Depends(require_sysadmin)):
    raise AppError(
        "La importación automática desde una fuente oficial de la CAC no está configurada. Cargá los índices manualmente.",
        501,
        "not_configured",
    )


@router.post("/adjustments/preview")
def preview_adjustment(data: AdjustmentPreviewIn, _: User = Depends(get_current_user)):
    result = simple_variation(data.adjustable_base, data.index_base, data.index_updated)
    return {
        "coefficient": s_coef(result["coefficient"]),
        "updated_amount": s_money(result["updated_amount"]),
        "adjustment_amount": s_money(result["adjustment_amount"]),
        "formula": result["formula"],
        "official": False,
    }


@router.get("/adjustments")
def list_adjustments(purchase_order_id: int | None = None, status: str = "", page: int = 1, page_size: int = 20, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(CacAdjustment)
    if purchase_order_id:
        query = query.filter(CacAdjustment.purchase_order_id == purchase_order_id)
    if status:
        query = query.filter(CacAdjustment.status == status)
    rows, total, page, page_size = _page(query.order_by(CacAdjustment.id.desc()), page, page_size)
    return {"items": [adjustment_out(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/adjustments")
def create_adjustment(data: AdjustmentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return adjustment_out(create_standalone_adjustment(db, user, data.model_dump()))


@router.get("/adjustments/{adjustment_id}")
def get_adjustment(adjustment_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return adjustment_out(get_or_404(db, CacAdjustment, adjustment_id, "No se encontró el reajuste."))


@router.post("/adjustments/{adjustment_id}/status")
def adjustment_status(adjustment_id: int, data: StatusIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = get_or_404(db, CacAdjustment, adjustment_id, "No se encontró el reajuste.")
    return adjustment_out(set_adjustment_status(db, user, row, data.status, data.reason))


@router.get("/payments")
def list_payments(client_id: int | None = None, q: str = "", page: int = 1, page_size: int = 20, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(Payment)
    if client_id:
        query = query.filter(Payment.client_id == client_id)
    if q:
        query = query.filter(Payment.reference.ilike(f"%{q}%"))
    rows, total, page, page_size = _page(query.order_by(Payment.payment_date.desc()), page, page_size)
    return {"items": [payment_out(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/payments")
def create_payment_route(data: PaymentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return payment_out(create_payment(db, user, data.model_dump()), detailed=True)


@router.get("/payments/{payment_id}")
def get_payment(payment_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return payment_out(get_or_404(db, Payment, payment_id, "No se encontró el pago."), detailed=True)


@router.post("/payments/{payment_id}/applications")
def apply_payment(payment_id: int, data: ApplicationIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    payment = get_or_404(db, Payment, payment_id, "No se encontró el pago.")
    add_application(db, user, payment, data.model_dump())
    return payment_out(payment, detailed=True)


@router.post("/payments/{payment_id}/void")
def void_payment_route(payment_id: int, data: ReasonIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    payment = get_or_404(db, Payment, payment_id, "No se encontró el pago.")
    return payment_out(void_payment(db, user, payment, data.reason), detailed=True)


@router.get("/retentions")
def list_retentions(
    status: str = "",
    client_id: int | None = None,
    project_id: int | None = None,
    purchase_order_id: int | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Retention)
    if status:
        query = query.filter(Retention.status == status)
    if client_id:
        query = query.filter(Retention.client_id == client_id)
    if project_id:
        query = query.filter(Retention.project_id == project_id)
    if purchase_order_id:
        query = query.filter(Retention.purchase_order_id == purchase_order_id)
    rows, total, page, page_size = _page(query.order_by(Retention.id.desc()), page, page_size)
    return {"items": [retention_out(db, row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/retentions/{retention_id}")
def get_retention(retention_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    retention = get_or_404(db, Retention, retention_id, "No se encontró la retención.")
    claims = db.query(Claim).join(ClaimRetention, ClaimRetention.claim_id == Claim.id).filter(ClaimRetention.retention_id == retention.id).all()
    data = retention_out(db, retention)
    data["claims"] = [claim_out(claim) for claim in claims]
    return data


@router.put("/retentions/{retention_id}")
def update_retention(retention_id: int, data: RetentionUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    retention = get_or_404(db, Retention, retention_id, "No se encontró la retención.")
    payload = data.model_dump(exclude_unset=True)
    if "notes" in payload:
        retention.notes = payload["notes"] or ""
    if "disputed" in payload:
        retention.disputed = bool(payload["disputed"])
    if "next_followup_date" in payload:
        retention.next_followup_date = payload["next_followup_date"]
    refresh_retention_status(db, retention)
    write_audit(db, user, "retention", retention.id, "editar", new={"disputed": retention.disputed, "status": retention.status})
    return retention_out(db, retention)


@router.post("/retentions/{retention_id}/void")
def void_retention(retention_id: int, data: ReasonIn, db: Session = Depends(get_db), user: User = Depends(require_sysadmin)):
    retention = get_or_404(db, Retention, retention_id, "No se encontró la retención.")
    if not data.reason.strip():
        raise AppError("Indicá el motivo de la anulación.", code="reason_required")
    from app.models.base import utcnow
    from app.models.enums import RetentionStatus

    retention.status = RetentionStatus.VOIDED.value
    retention.void_reason = data.reason.strip()
    retention.voided_at = utcnow()
    retention.voided_by_id = user.id
    retention.pending_amount = 0
    write_audit(db, user, "retention", retention.id, "anular", reason=data.reason)
    return retention_out(db, retention)


@router.post("/milestones/preview")
def preview_milestone(data: MilestoneIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = affected_retentions(db, data.scope_type, data.project_id, data.purchase_order_id, data.contract_scope_id)
    return {"affected": milestone_preview(rows, data.effective_date)}


@router.get("/milestones")
def list_milestones(project_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(CompletionMilestone)
    if project_id:
        query = query.filter(CompletionMilestone.project_id == project_id)
    return [milestone_out(row) for row in query.order_by(CompletionMilestone.effective_date.desc()).all()]


@router.post("/milestones")
def create_milestone(data: MilestoneIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return milestone_out(register_milestone(db, user, data.model_dump()))


@router.put("/milestones/{milestone_id}")
def edit_milestone(milestone_id: int, data: MilestoneUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = get_or_404(db, CompletionMilestone, milestone_id, "No se encontró el hito de finalización.")
    return milestone_out(update_milestone(db, user, row, data.model_dump(exclude_unset=True)))


@router.get("/claims")
def list_claims(client_id: int | None = None, status: str = "", page: int = 1, page_size: int = 20, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(Claim)
    if client_id:
        query = query.filter(Claim.client_id == client_id)
    if status:
        query = query.filter(Claim.status == status)
    rows, total, page, page_size = _page(query.order_by(Claim.claim_date.desc()), page, page_size)
    return {"items": [claim_out(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/claims")
def create_claim_route(data: ClaimIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return claim_out(create_claim(db, user, data.model_dump()), detailed=True)


@router.get("/claims/{claim_id}")
def get_claim(claim_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return claim_out(get_or_404(db, Claim, claim_id, "No se encontró el reclamo."), detailed=True)


@router.post("/claims/{claim_id}/events")
def claim_event(claim_id: int, data: ClaimEventIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    claim = get_or_404(db, Claim, claim_id, "No se encontró el reclamo.")
    add_claim_event(db, user, claim, data.model_dump(exclude_unset=True))
    return claim_out(claim, detailed=True)


@router.post("/claims/{claim_id}/void")
def void_claim_route(claim_id: int, data: ReasonIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    claim = get_or_404(db, Claim, claim_id, "No se encontró el reclamo.")
    return claim_out(void_claim(db, user, claim, data.reason), detailed=True)
