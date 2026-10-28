from datetime import date, datetime

from app.models import (
    CacAdjustment,
    CacIndex,
    Certificate,
    CertificateItem,
    Claim,
    Client,
    CompletionMilestone,
    ContractScope,
    Document,
    Payment,
    PaymentApplication,
    Project,
    PurchaseOrder,
    PurchaseOrderItem,
    Reminder,
    Retention,
    User,
)
from app.services.ledger import certified_quantity, collected_amount, retention_flags
from app.services.money import D
from app.services.serialize import s_coef, s_money, s_percent, s_qty


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value else None


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": _iso(user.created_at),
        "updated_at": _iso(user.updated_at),
    }


def client_out(client: Client) -> dict:
    return {
        "id": client.id,
        "legal_name": client.legal_name,
        "trade_name": client.trade_name,
        "cuit": client.cuit,
        "contact_name": client.contact_name,
        "email": client.email,
        "phone": client.phone,
        "address": client.address,
        "notes": client.notes,
        "status": client.status,
        "created_at": _iso(client.created_at),
        "updated_at": _iso(client.updated_at),
    }


def project_out(project: Project, client: Client | None = None) -> dict:
    client = client or project.client
    return {
        "id": project.id,
        "client_id": project.client_id,
        "client_name": client.legal_name if client else "",
        "name": project.name,
        "location": project.location,
        "internal_code": project.internal_code,
        "start_date": _iso(project.start_date),
        "estimated_end_date": _iso(project.estimated_end_date),
        "actual_end_date": _iso(project.actual_end_date),
        "status": project.status,
        "internal_owner": project.internal_owner,
        "notes": project.notes,
        "created_at": _iso(project.created_at),
        "updated_at": _iso(project.updated_at),
    }


def po_item_out(db, item: PurchaseOrderItem) -> dict:
    certified = certified_quantity(db, item.id)
    pending = D(item.contracted_quantity) - certified
    return {
        "id": item.id,
        "purchase_order_id": item.purchase_order_id,
        "scope_id": item.scope_id,
        "description": item.description,
        "sector": item.sector,
        "unit_id": item.unit_id,
        "unit_name": item.unit.name if item.unit else "",
        "contracted_quantity": s_qty(item.contracted_quantity),
        "unit_price": s_money(item.unit_price),
        "original_amount": s_money(item.original_amount),
        "certified_quantity": s_qty(certified),
        "pending_quantity": s_qty(pending),
        "status": item.status,
        "sort_order": item.sort_order,
    }


def purchase_order_out(db, po: PurchaseOrder, with_items: bool = False) -> dict:
    contracted = sum((D(item.original_amount) for item in po.items if item.status == "activo"), D(0))
    data = {
        "id": po.id,
        "client_po_number": po.client_po_number,
        "client_id": po.client_id,
        "client_name": po.client.legal_name if po.client else "",
        "project_id": po.project_id,
        "project_name": po.project.name if po.project else "",
        "issue_date": _iso(po.issue_date),
        "acceptance_date": _iso(po.acceptance_date),
        "currency": po.currency,
        "payment_terms": po.payment_terms,
        "payment_term_days": po.payment_term_days,
        "retention_percent": s_percent(po.retention_percent),
        "retention_base_type": po.retention_base_type,
        "retention_concepts": list(po.retention_concepts or []),
        "release_trigger": po.release_trigger,
        "release_days": po.release_days,
        "contractual_start_date": _iso(po.contractual_start_date),
        "explicit_release_date": _iso(po.explicit_release_date),
        "release_scope_id": po.release_scope_id,
        "status": po.status,
        "notes": po.notes,
        "contracted_amount": s_money(contracted),
        "created_at": _iso(po.created_at),
        "updated_at": _iso(po.updated_at),
    }
    if with_items:
        data["items"] = [po_item_out(db, item) for item in sorted(po.items, key=lambda row: row.sort_order)]
        data["scopes"] = [
            {"id": scope.id, "name": scope.name, "description": scope.description} for scope in po.scopes
        ]
    return data


def certificate_item_out(item: CertificateItem) -> dict:
    return {
        "id": item.id,
        "po_item_id": item.po_item_id,
        "description": item.po_item.description if item.po_item else "",
        "quantity": s_qty(item.quantity),
        "accumulated_quantity": s_qty(item.accumulated_quantity),
        "unit_price": s_money(item.unit_price),
        "base_amount": s_money(item.base_amount),
        "adjustment_amount": s_money(item.adjustment_amount),
        "adjusted_amount": s_money(item.adjusted_amount),
        "calculation_method": item.calculation_method,
        "coefficient": s_coef(item.coefficient),
        "cac_base_index_id": item.cac_base_index_id,
        "cac_update_index_id": item.cac_update_index_id,
        "overage_authorized": item.overage_authorized,
        "overage_reason": item.overage_reason,
        "notes": item.notes,
    }


def adjustment_out(adjustment: CacAdjustment) -> dict:
    return {
        "id": adjustment.id,
        "certificate_id": adjustment.certificate_id,
        "certificate_item_id": adjustment.certificate_item_id,
        "purchase_order_id": adjustment.purchase_order_id,
        "project_id": adjustment.project_id,
        "kind": adjustment.kind,
        "method": adjustment.method,
        "base_period_year": adjustment.base_period_year,
        "base_period_month": adjustment.base_period_month,
        "update_period_year": adjustment.update_period_year,
        "update_period_month": adjustment.update_period_month,
        "base_index_id": adjustment.base_index_id,
        "update_index_id": adjustment.update_index_id,
        "formula_text": adjustment.formula_text,
        "parameters": adjustment.parameters or {},
        "coefficient": s_coef(adjustment.coefficient),
        "adjustable_base": s_money(adjustment.adjustable_base),
        "updated_amount": s_money(adjustment.updated_amount),
        "adjustment_amount": s_money(adjustment.adjustment_amount),
        "presented_amount": s_money(adjustment.presented_amount) if adjustment.presented_amount is not None else None,
        "approved_amount": s_money(adjustment.approved_amount) if adjustment.approved_amount is not None else None,
        "status": adjustment.status,
        "replaces_id": adjustment.replaces_id,
        "readjust_reason": adjustment.readjust_reason,
        "already_includes_update": adjustment.already_includes_update,
        "notes": adjustment.notes,
        "void_reason": adjustment.void_reason,
        "created_at": _iso(adjustment.created_at),
        "official": adjustment.status in {"aprobado", "facturado", "pagado"},
    }


def certificate_out(db, cert: Certificate, detailed: bool = False) -> dict:
    collected = collected_amount(db, cert.id) if cert.id else D(0)
    pending = abs(D(cert.net_amount)) - collected
    data = {
        "id": cert.id,
        "client_number": cert.client_number,
        "purchase_order_id": cert.purchase_order_id,
        "purchase_order_number": cert.purchase_order.client_po_number if cert.purchase_order else "",
        "project_id": cert.project_id,
        "project_name": cert.purchase_order.project.name if cert.purchase_order and cert.purchase_order.project else "",
        "client_id": cert.purchase_order.client_id if cert.purchase_order else None,
        "client_name": cert.purchase_order.client.legal_name if cert.purchase_order and cert.purchase_order.client else "",
        "document_type": cert.document_type,
        "issue_date": _iso(cert.issue_date),
        "period_from": _iso(cert.period_from),
        "period_to": _iso(cert.period_to),
        "received_date": _iso(cert.received_date),
        "approved_date": _iso(cert.approved_date),
        "invoiced_date": _iso(cert.invoiced_date),
        "invoice_number": cert.invoice_number or "",
        "payment_due_date": _iso(cert.payment_due_date),
        "status": cert.status,
        "currency": cert.currency,
        "base_amount": s_money(cert.base_amount),
        "cac_amount": s_money(cert.cac_amount),
        "cac_approved_amount": s_money(cert.cac_approved_amount),
        "other_additions": s_money(cert.other_additions),
        "gross_amount": s_money(cert.gross_amount),
        "retention_base_amount": s_money(cert.retention_base_amount),
        "retention_amount": s_money(cert.retention_amount),
        "other_deductions": s_money(cert.other_deductions),
        "net_amount": s_money(cert.net_amount),
        "collected_amount": s_money(collected),
        "pending_amount": s_money(pending),
        "retention_percent_snapshot": s_percent(cert.retention_percent_snapshot),
        "retention_base_type_snapshot": cert.retention_base_type_snapshot,
        "retention_concepts_snapshot": list(cert.retention_concepts_snapshot or []),
        "retention_formula": cert.retention_formula,
        "notes": cert.notes,
        "void_reason": cert.void_reason,
        "voided_at": _iso(cert.voided_at),
    }
    if detailed:
        data["items"] = [certificate_item_out(item) for item in cert.items]
        data["adjustments"] = [adjustment_out(item) for item in cert.adjustments]
        data["retention"] = retention_out(db, cert.retention) if cert.retention else None
        data["payments"] = [
            {
                "id": application.id,
                "payment_id": application.payment_id,
                "amount": s_money(application.amount),
                "concept": application.concept,
                "payment_date": _iso(application.payment.payment_date) if application.payment else None,
                "reference": application.payment.reference if application.payment else "",
                "payment_status": application.payment.status if application.payment else "",
            }
            for application in db.query(PaymentApplication).filter(PaymentApplication.certificate_id == cert.id).all()
        ]
    return data


def retention_out(db, retention: Retention | None) -> dict | None:
    if retention is None:
        return None
    flags = retention_flags(retention)
    cert = retention.certificate
    po = cert.purchase_order if cert else None
    return {
        "id": retention.id,
        "certificate_id": retention.certificate_id,
        "certificate_number": cert.client_number if cert else "",
        "purchase_order_id": retention.purchase_order_id,
        "purchase_order_number": po.client_po_number if po else "",
        "project_id": retention.project_id,
        "project_name": po.project.name if po and po.project else "",
        "client_id": retention.client_id,
        "client_name": po.client.legal_name if po and po.client else "",
        "currency": cert.currency if cert else "ARS",
        "calculation_base": s_money(retention.calculation_base),
        "base_breakdown": retention.base_breakdown or {},
        "percent": s_percent(retention.percent),
        "retained_amount": s_money(retention.retained_amount),
        "recovered_amount": s_money(retention.recovered_amount),
        "pending_amount": s_money(retention.pending_amount),
        "retention_date": _iso(retention.retention_date),
        "release_trigger": retention.release_trigger,
        "release_days": retention.release_days,
        "milestone_id": retention.milestone_id,
        "completion_date": _iso(retention.completion_date),
        "contractual_start_date": _iso(retention.contractual_start_date),
        "explicit_release_date": _iso(retention.explicit_release_date),
        "expected_release_date": _iso(retention.expected_release_date),
        "claim_enabled_date": _iso(retention.claim_enabled_date),
        "status": retention.status,
        "disputed": retention.disputed,
        "last_claim_date": _iso(retention.last_claim_date),
        "next_followup_date": _iso(retention.next_followup_date),
        "formula": retention.formula,
        "notes": retention.notes,
        "void_reason": retention.void_reason,
        **flags,
    }


def payment_out(payment: Payment, detailed: bool = False) -> dict:
    applied = sum((D(item.amount) for item in payment.applications), D(0))
    data = {
        "id": payment.id,
        "client_id": payment.client_id,
        "payment_date": _iso(payment.payment_date),
        "total_amount": s_money(payment.total_amount),
        "applied_amount": s_money(applied),
        "unapplied_amount": s_money(D(payment.total_amount) - applied),
        "currency": payment.currency,
        "method": payment.method,
        "reference": payment.reference,
        "notes": payment.notes,
        "status": payment.status,
        "void_reason": payment.void_reason,
        "created_at": _iso(payment.created_at),
    }
    if detailed:
        data["applications"] = [
            {
                "id": item.id,
                "certificate_id": item.certificate_id,
                "retention_id": item.retention_id,
                "concept": item.concept,
                "amount": s_money(item.amount),
                "notes": item.notes,
                "authorized_overage": item.authorized_overage,
                "overage_reason": item.overage_reason,
            }
            for item in payment.applications
        ]
    return data


def claim_out(claim: Claim, detailed: bool = False) -> dict:
    data = {
        "id": claim.id,
        "client_id": claim.client_id,
        "project_id": claim.project_id,
        "purchase_order_id": claim.purchase_order_id,
        "claim_date": _iso(claim.claim_date),
        "channel": claim.channel,
        "recipient": claim.recipient,
        "internal_owner": claim.internal_owner,
        "response": claim.response,
        "promised_payment_date": _iso(claim.promised_payment_date),
        "next_followup_date": _iso(claim.next_followup_date),
        "status": claim.status,
        "amount_claimed": s_money(claim.amount_claimed),
        "currency": claim.currency,
        "notes": claim.notes,
        "void_reason": claim.void_reason,
        "retention_ids": [link.retention_id for link in claim.links],
    }
    if detailed:
        data["events"] = [
            {
                "id": event.id,
                "event_date": _iso(event.event_date),
                "event_type": event.event_type,
                "description": event.description,
                "user_id": event.user_id,
            }
            for event in sorted(claim.events, key=lambda row: row.id)
        ]
        data["retentions"] = [
            {"retention_id": link.retention_id, "amount": s_money(link.amount)} for link in claim.links
        ]
    return data


def index_out(row: CacIndex) -> dict:
    return {
        "id": row.id,
        "period_year": row.period_year,
        "period_month": row.period_month,
        "series_code": row.series_code,
        "series_name": row.series_name,
        "published_value": format(D(row.published_value), "f"),
        "publication_date": _iso(row.publication_date),
        "source": row.source,
        "source_url": row.source_url,
        "notes": row.notes,
    }


def document_out(document: Document) -> dict:
    return {
        "id": document.id,
        "entity_type": document.entity_type,
        "entity_id": document.entity_id,
        "original_name": document.original_name,
        "content_type": document.content_type,
        "size_bytes": document.size_bytes,
        "uploaded_at": _iso(document.uploaded_at),
        "download_path": f"/api/documents/{document.id}/download",
    }


def reminder_out(reminder: Reminder) -> dict:
    return {
        "id": reminder.id,
        "entity_type": reminder.entity_type,
        "entity_id": reminder.entity_id,
        "title": reminder.title,
        "detail": reminder.detail,
        "due_date": _iso(reminder.due_date),
        "amount": s_money(reminder.amount),
        "currency": reminder.currency,
        "priority": reminder.priority,
        "status": reminder.status,
        "link_path": reminder.link_path,
        "created_at": _iso(reminder.created_at),
        "seen_at": _iso(reminder.seen_at),
        "managed_at": _iso(reminder.managed_at),
    }


def milestone_out(row: CompletionMilestone) -> dict:
    return {
        "id": row.id,
        "scope_type": row.scope_type,
        "project_id": row.project_id,
        "purchase_order_id": row.purchase_order_id,
        "contract_scope_id": row.contract_scope_id,
        "effective_date": _iso(row.effective_date),
        "notes": row.notes,
        "is_active": row.is_active,
        "recorded_at": _iso(row.recorded_at),
    }


def scope_out(scope: ContractScope) -> dict:
    return {
        "id": scope.id,
        "purchase_order_id": scope.purchase_order_id,
        "name": scope.name,
        "description": scope.description,
    }
