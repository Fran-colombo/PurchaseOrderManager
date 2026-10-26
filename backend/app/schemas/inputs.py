from datetime import date
from decimal import Decimal

import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _email(value: str) -> str:
    value = value.strip().lower()
    if not _EMAIL_RE.match(value):
        raise ValueError("El correo electrónico no es válido.")
    return value


# Acepta dominios internos como .local, comunes en cuentas de la empresa.
EmailStr = Annotated[str, AfterValidator(_email)]


def _choice(value: str | None, allowed: set[str], label: str) -> str | None:
    if value is None:
        return value
    if value not in allowed:
        raise ValueError(f"{label} no es válido.")
    return value


class LoginIn(BaseModel):
    email: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ProfileIn(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: EmailStr
    full_name: str = ""
    password: str = Field(min_length=8)
    role: str = "normal"
    is_active: bool = True

    @field_validator("role")
    @classmethod
    def role_ok(cls, value: str) -> str:
        return _choice(value, {"normal", "sysadmin"}, "Rol") or "normal"


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8)

    @field_validator("role")
    @classmethod
    def role_ok(cls, value: str | None) -> str | None:
        return _choice(value, {"normal", "sysadmin"}, "Rol")


class ClientIn(BaseModel):
    legal_name: str = Field(min_length=2, max_length=200)
    trade_name: str = ""
    cuit: str | None = None
    contact_name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    notes: str = ""
    status: str = "activo"


class ClientUpdate(BaseModel):
    legal_name: str | None = None
    trade_name: str | None = None
    cuit: str | None = None
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None
    status: str | None = None


class ProjectIn(BaseModel):
    client_id: int
    name: str = Field(min_length=2)
    location: str = ""
    internal_code: str = ""
    start_date: date | None = None
    estimated_end_date: date | None = None
    actual_end_date: date | None = None
    status: str = "planificacion"
    internal_owner: str = ""
    notes: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    internal_code: str | None = None
    start_date: date | None = None
    estimated_end_date: date | None = None
    actual_end_date: date | None = None
    status: str | None = None
    internal_owner: str | None = None
    notes: str | None = None


class PurchaseOrderIn(BaseModel):
    client_po_number: str
    client_id: int
    project_id: int
    issue_date: date | None = None
    acceptance_date: date | None = None
    currency: str = "ARS"
    payment_terms: str = ""
    payment_term_days: int | None = None
    retention_percent: Decimal = Decimal("5")
    retention_base_type: str = "solo_base"
    retention_concepts: list[str] = []
    release_trigger: str = "finalizacion_orden"
    release_days: int = 180
    contractual_start_date: date | None = None
    explicit_release_date: date | None = None
    release_scope_id: int | None = None
    status: str = "vigente"
    notes: str = ""


class PurchaseOrderUpdate(BaseModel):
    client_po_number: str | None = None
    issue_date: date | None = None
    acceptance_date: date | None = None
    currency: str | None = None
    payment_terms: str | None = None
    payment_term_days: int | None = None
    retention_percent: Decimal | None = None
    retention_base_type: str | None = None
    retention_concepts: list[str] | None = None
    release_trigger: str | None = None
    release_days: int | None = None
    contractual_start_date: date | None = None
    explicit_release_date: date | None = None
    release_scope_id: int | None = None
    status: str | None = None
    notes: str | None = None
    confirm_recalculation: bool = False
    reason: str = ""


class PoItemIn(BaseModel):
    description: str
    sector: str = ""
    unit_id: int | None = None
    scope_id: int | None = None
    contracted_quantity: Decimal
    unit_price: Decimal
    status: str = "activo"
    sort_order: int = 0
    allow_overage: bool = False


class ScopeIn(BaseModel):
    name: str
    description: str = ""


class CertificateItemIn(BaseModel):
    po_item_id: int
    quantity: Decimal
    unit_price: Decimal | None = None
    calculation_method: str = "ninguno"
    cac_base_index_id: int | None = None
    cac_update_index_id: int | None = None
    contractual_amount: Decimal | None = None
    formula_text: str = ""
    parameters: dict = {}
    adjustment_status: str = "calculado"
    allow_overage: bool = False
    overage_reason: str = ""
    allow_readjust: bool = False
    readjust_reason: str = ""
    already_includes_update: bool = False
    notes: str = ""


class CertificateIn(BaseModel):
    purchase_order_id: int
    client_number: str
    document_type: str = "avance"
    issue_date: date | None = None
    period_from: date | None = None
    period_to: date | None = None
    received_date: date | None = None
    approved_date: date | None = None
    invoiced_date: date | None = None
    payment_due_date: date | None = None
    status: str = "borrador"
    other_additions: Decimal = Decimal("0")
    other_deductions: Decimal = Decimal("0")
    notes: str = ""
    items: list[CertificateItemIn] = []
    confirm_financial_change: bool = False
    change_reason: str = ""


class CertificateUpdate(BaseModel):
    client_number: str | None = None
    document_type: str | None = None
    issue_date: date | None = None
    period_from: date | None = None
    period_to: date | None = None
    received_date: date | None = None
    approved_date: date | None = None
    invoiced_date: date | None = None
    payment_due_date: date | None = None
    status: str | None = None
    other_additions: Decimal | None = None
    other_deductions: Decimal | None = None
    notes: str | None = None
    items: list[CertificateItemIn] | None = None
    confirm_financial_change: bool = False
    change_reason: str = ""


class ReasonIn(BaseModel):
    reason: str


class IndexIn(BaseModel):
    period_year: int
    period_month: int = Field(ge=1, le=12)
    series_code: str
    series_name: str = ""
    published_value: Decimal
    publication_date: date | None = None
    source: str = ""
    source_url: str = ""
    notes: str = ""


class AdjustmentIn(BaseModel):
    purchase_order_id: int
    certificate_id: int | None = None
    certificate_item_id: int | None = None
    kind: str = "posterior"
    method: str = "variacion_simple"
    adjustable_base: Decimal
    base_index_id: int | None = None
    update_index_id: int | None = None
    validated_amount: Decimal | None = None
    formula_text: str = ""
    parameters: dict = {}
    status: str = "calculado"
    replaces_id: int | None = None
    allow_readjust: bool = False
    readjust_reason: str = ""
    already_includes_update: bool = False
    notes: str = ""
    base_period_year: int | None = None
    base_period_month: int | None = None
    update_period_year: int | None = None
    update_period_month: int | None = None


class AdjustmentPreviewIn(BaseModel):
    adjustable_base: Decimal
    index_base: Decimal
    index_updated: Decimal


class StatusIn(BaseModel):
    status: str
    reason: str = ""


class ApplicationIn(BaseModel):
    concept: str
    amount: Decimal
    certificate_id: int | None = None
    retention_id: int | None = None
    authorized_overage: bool = False
    overage_reason: str = ""
    notes: str = ""


class PaymentIn(BaseModel):
    client_id: int
    payment_date: date
    total_amount: Decimal
    currency: str = "ARS"
    method: str = ""
    reference: str = ""
    notes: str = ""
    applications: list[ApplicationIn] = []


class MilestoneIn(BaseModel):
    scope_type: str
    project_id: int
    purchase_order_id: int | None = None
    contract_scope_id: int | None = None
    effective_date: date
    notes: str = ""
    confirm: bool = False
    reason: str = ""


class MilestoneUpdate(BaseModel):
    effective_date: date | None = None
    notes: str | None = None
    confirm: bool = False
    reason: str = ""


class ClaimLinkIn(BaseModel):
    retention_id: int
    amount: Decimal | None = None


class ClaimIn(BaseModel):
    client_id: int
    project_id: int | None = None
    purchase_order_id: int | None = None
    claim_date: date
    channel: str = "correo"
    recipient: str = ""
    internal_owner: str = ""
    response: str = ""
    promised_payment_date: date | None = None
    next_followup_date: date | None = None
    status: str = "reclamo_enviado"
    amount_claimed: Decimal = Decimal("0")
    currency: str = "ARS"
    notes: str = ""
    retentions: list[ClaimLinkIn] = []


class ClaimEventIn(BaseModel):
    description: str
    event_type: str = "seguimiento"
    status: str | None = None
    response: str | None = None
    promised_payment_date: date | None = None
    next_followup_date: date | None = None


class RetentionUpdate(BaseModel):
    notes: str | None = None
    disputed: bool | None = None
    next_followup_date: date | None = None


class ReminderRuleIn(BaseModel):
    days_before: int | None = None
    repeat_every_days: int | None = None
    is_active: bool | None = None
    description: str | None = None


class ContactIn(BaseModel):
    channel: Literal["whatsapp", "email", "telefono", "otro"]
    notes: str = ""


class SettingIn(BaseModel):
    value: str
