from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, IdMixin, TimestampMixin, utcnow

MONEY = Numeric(18, 2)
QTY = Numeric(18, 4)
COEF = Numeric(18, 8)
PERCENT = Numeric(8, 4)
INDEX_VALUE = Numeric(18, 4)


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(180), default="")
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="normal", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=1)


class RefreshToken(Base, IdMixin):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LoginAttempt(Base, IdMixin):
    __tablename__ = "login_attempts"

    username: Mapped[str] = mapped_column(String(80), index=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class UnitOfMeasure(Base, IdMixin):
    __tablename__ = "units"

    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AppSetting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")


class Client(Base, IdMixin, TimestampMixin):
    __tablename__ = "clients"

    legal_name: Mapped[str] = mapped_column(String(200))
    trade_name: Mapped[str] = mapped_column(String(200), default="")
    cuit: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    contact_name: Mapped[str] = mapped_column(String(180), default="")
    email: Mapped[str] = mapped_column(String(180), default="")
    phone: Mapped[str] = mapped_column(String(80), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="activo", index=True)

    projects: Mapped[list["Project"]] = relationship(back_populates="client")
    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="client")


class Project(Base, IdMixin, TimestampMixin):
    __tablename__ = "projects"

    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    location: Mapped[str] = mapped_column(Text, default="")
    internal_code: Mapped[str] = mapped_column(String(60), default="", index=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    estimated_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="planificacion", index=True)
    internal_owner: Mapped[str] = mapped_column(String(180), default="")
    notes: Mapped[str] = mapped_column(Text, default="")

    client: Mapped[Client] = relationship(back_populates="projects")
    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="project")


class PurchaseOrder(Base, IdMixin, TimestampMixin):
    __tablename__ = "purchase_orders"
    __table_args__ = (UniqueConstraint("client_id", "client_po_number", name="uq_client_po_number"),)

    client_po_number: Mapped[str] = mapped_column(String(80), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    acceptance_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="ARS")
    payment_terms: Mapped[str] = mapped_column(Text, default="")
    payment_term_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retention_percent: Mapped[Decimal] = mapped_column(PERCENT, default=Decimal("5"))
    retention_base_type: Mapped[str] = mapped_column(String(40), default="solo_base")
    retention_concepts: Mapped[list] = mapped_column(JSON, default=list)
    release_trigger: Mapped[str] = mapped_column(String(40), default="finalizacion_orden")
    release_days: Mapped[int] = mapped_column(Integer, default=180)
    contractual_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    explicit_release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    release_scope_id: Mapped[int | None] = mapped_column(
        ForeignKey("contract_scopes.id", use_alter=True, name="fk_po_release_scope"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(32), default="vigente", index=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    client: Mapped[Client] = relationship(back_populates="purchase_orders")
    project: Mapped[Project] = relationship(back_populates="purchase_orders")
    items: Mapped[list["PurchaseOrderItem"]] = relationship(back_populates="purchase_order", cascade="all, delete-orphan")
    scopes: Mapped[list["ContractScope"]] = relationship(
        back_populates="purchase_order",
        foreign_keys="ContractScope.purchase_order_id",
        cascade="all, delete-orphan",
    )
    certificates: Mapped[list["Certificate"]] = relationship(back_populates="purchase_order")


class ContractScope(Base, IdMixin, TimestampMixin):
    __tablename__ = "contract_scopes"

    purchase_order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    name: Mapped[str] = mapped_column(String(180))
    description: Mapped[str] = mapped_column(Text, default="")

    purchase_order: Mapped[PurchaseOrder] = relationship(
        back_populates="scopes", foreign_keys=[purchase_order_id]
    )


class PurchaseOrderItem(Base, IdMixin, TimestampMixin):
    __tablename__ = "purchase_order_items"

    purchase_order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    scope_id: Mapped[int | None] = mapped_column(ForeignKey("contract_scopes.id"), nullable=True)
    description: Mapped[str] = mapped_column(String(300))
    sector: Mapped[str] = mapped_column(String(180), default="")
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    contracted_quantity: Mapped[Decimal] = mapped_column(QTY, default=Decimal("0"))
    unit_price: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    original_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(32), default="activo")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    purchase_order: Mapped[PurchaseOrder] = relationship(back_populates="items")
    unit: Mapped[UnitOfMeasure | None] = relationship()
    scope: Mapped[ContractScope | None] = relationship()


class CacIndex(Base, IdMixin, TimestampMixin):
    __tablename__ = "cac_indexes"
    __table_args__ = (UniqueConstraint("series_code", "period_year", "period_month", name="uq_cac_period"),)

    period_year: Mapped[int] = mapped_column(Integer, index=True)
    period_month: Mapped[int] = mapped_column(Integer)
    series_code: Mapped[str] = mapped_column(String(40), index=True)
    series_name: Mapped[str] = mapped_column(String(180), default="")
    published_value: Mapped[Decimal] = mapped_column(INDEX_VALUE)
    publication_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    source: Mapped[str] = mapped_column(String(180), default="")
    source_url: Mapped[str] = mapped_column(String(400), default="")
    notes: Mapped[str] = mapped_column(Text, default="")


class Certificate(Base, IdMixin, TimestampMixin):
    __tablename__ = "certificates"
    __table_args__ = (
        Index(
            "uq_cert_number_active",
            "purchase_order_id",
            "client_number",
            unique=True,
            sqlite_where=text("status != 'anulado'"),
            postgresql_where=text("status != 'anulado'"),
        ),
    )

    client_number: Mapped[str] = mapped_column(String(80), index=True)
    purchase_order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    document_type: Mapped[str] = mapped_column(String(32), default="avance")
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    received_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    approved_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    invoiced_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="borrador", index=True)
    currency: Mapped[str] = mapped_column(String(8), default="ARS")
    base_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    cac_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    cac_approved_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    other_additions: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    gross_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    retention_base_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    retention_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    other_deductions: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    net_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    retention_percent_snapshot: Mapped[Decimal] = mapped_column(PERCENT, default=Decimal("5"))
    retention_base_type_snapshot: Mapped[str] = mapped_column(String(40), default="solo_base")
    retention_concepts_snapshot: Mapped[list] = mapped_column(JSON, default=list)
    retention_formula: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    void_reason: Mapped[str] = mapped_column(Text, default="")
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    purchase_order: Mapped[PurchaseOrder] = relationship(back_populates="certificates")
    items: Mapped[list["CertificateItem"]] = relationship(back_populates="certificate", cascade="all, delete-orphan")
    adjustments: Mapped[list["CacAdjustment"]] = relationship(back_populates="certificate")
    retention: Mapped["Retention | None"] = relationship(back_populates="certificate", uselist=False)


class CertificateItem(Base, IdMixin):
    __tablename__ = "certificate_items"

    certificate_id: Mapped[int] = mapped_column(ForeignKey("certificates.id"), index=True)
    po_item_id: Mapped[int] = mapped_column(ForeignKey("purchase_order_items.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(QTY, default=Decimal("0"))
    accumulated_quantity: Mapped[Decimal] = mapped_column(QTY, default=Decimal("0"))
    unit_price: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    base_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    adjustment_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    adjusted_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    calculation_method: Mapped[str] = mapped_column(String(40), default="ninguno")
    coefficient: Mapped[Decimal | None] = mapped_column(COEF, nullable=True)
    cac_base_index_id: Mapped[int | None] = mapped_column(ForeignKey("cac_indexes.id"), nullable=True)
    cac_update_index_id: Mapped[int | None] = mapped_column(ForeignKey("cac_indexes.id"), nullable=True)
    overage_authorized: Mapped[bool] = mapped_column(Boolean, default=False)
    overage_reason: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")

    certificate: Mapped[Certificate] = relationship(back_populates="items")
    po_item: Mapped[PurchaseOrderItem] = relationship()


class CacAdjustment(Base, IdMixin, TimestampMixin):
    __tablename__ = "cac_adjustments"

    certificate_id: Mapped[int | None] = mapped_column(ForeignKey("certificates.id"), nullable=True, index=True)
    certificate_item_id: Mapped[int | None] = mapped_column(ForeignKey("certificate_items.id"), nullable=True)
    purchase_order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32), default="incluido")
    method: Mapped[str] = mapped_column(String(32), default="variacion_simple")
    base_period_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    base_period_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    update_period_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    update_period_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    base_index_id: Mapped[int | None] = mapped_column(ForeignKey("cac_indexes.id"), nullable=True)
    update_index_id: Mapped[int | None] = mapped_column(ForeignKey("cac_indexes.id"), nullable=True)
    formula_text: Mapped[str] = mapped_column(Text, default="")
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)
    coefficient: Mapped[Decimal | None] = mapped_column(COEF, nullable=True)
    adjustable_base: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    updated_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    adjustment_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    presented_amount: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    approved_amount: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="calculado", index=True)
    replaces_id: Mapped[int | None] = mapped_column(ForeignKey("cac_adjustments.id"), nullable=True)
    readjust_reason: Mapped[str] = mapped_column(Text, default="")
    already_includes_update: Mapped[bool] = mapped_column(Boolean, default=False)
    calculated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    void_reason: Mapped[str] = mapped_column(Text, default="")
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    certificate: Mapped[Certificate | None] = relationship(back_populates="adjustments")


class Payment(Base, IdMixin, TimestampMixin):
    __tablename__ = "payments"

    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    payment_date: Mapped[date] = mapped_column(Date)
    total_amount: Mapped[Decimal] = mapped_column(MONEY)
    currency: Mapped[str] = mapped_column(String(8), default="ARS")
    method: Mapped[str] = mapped_column(String(80), default="")
    reference: Mapped[str] = mapped_column(String(120), default="", index=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="registrado", index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    void_reason: Mapped[str] = mapped_column(Text, default="")
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    applications: Mapped[list["PaymentApplication"]] = relationship(
        back_populates="payment", cascade="all, delete-orphan"
    )


class PaymentApplication(Base, IdMixin):
    __tablename__ = "payment_applications"

    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), index=True)
    certificate_id: Mapped[int | None] = mapped_column(ForeignKey("certificates.id"), nullable=True, index=True)
    retention_id: Mapped[int | None] = mapped_column(ForeignKey("retentions.id"), nullable=True, index=True)
    concept: Mapped[str] = mapped_column(String(40))
    amount: Mapped[Decimal] = mapped_column(MONEY)
    authorized_overage: Mapped[bool] = mapped_column(Boolean, default=False)
    overage_reason: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    payment: Mapped[Payment] = relationship(back_populates="applications")


class CompletionMilestone(Base, IdMixin):
    __tablename__ = "completion_milestones"

    scope_type: Mapped[str] = mapped_column(String(32))
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    purchase_order_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_orders.id"), nullable=True, index=True)
    contract_scope_id: Mapped[int | None] = mapped_column(ForeignKey("contract_scopes.id"), nullable=True)
    effective_date: Mapped[date] = mapped_column(Date)
    notes: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Retention(Base, IdMixin, TimestampMixin):
    __tablename__ = "retentions"

    certificate_id: Mapped[int] = mapped_column(ForeignKey("certificates.id"), unique=True, index=True)
    purchase_order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    calculation_base: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    base_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    percent: Mapped[Decimal] = mapped_column(PERCENT, default=Decimal("5"))
    retained_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    retention_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    release_trigger: Mapped[str] = mapped_column(String(40))
    release_days: Mapped[int] = mapped_column(Integer, default=180)
    milestone_id: Mapped[int | None] = mapped_column(ForeignKey("completion_milestones.id"), nullable=True)
    completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    contractual_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    explicit_release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_release_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    claim_enabled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    recovered_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    pending_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(48), default="pendiente_fecha_finalizacion", index=True)
    disputed: Mapped[bool] = mapped_column(Boolean, default=False)
    last_claim_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_followup_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    formula: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    void_reason: Mapped[str] = mapped_column(Text, default="")
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    certificate: Mapped[Certificate] = relationship(back_populates="retention")


class Claim(Base, IdMixin, TimestampMixin):
    __tablename__ = "claims"

    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    purchase_order_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_orders.id"), nullable=True, index=True)
    claim_date: Mapped[date] = mapped_column(Date)
    channel: Mapped[str] = mapped_column(String(32), default="correo")
    recipient: Mapped[str] = mapped_column(String(180), default="")
    internal_owner: Mapped[str] = mapped_column(String(180), default="")
    response: Mapped[str] = mapped_column(Text, default="")
    promised_payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_followup_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="reclamo_enviado", index=True)
    amount_claimed: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(8), default="ARS")
    notes: Mapped[str] = mapped_column(Text, default="")
    void_reason: Mapped[str] = mapped_column(Text, default="")
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    links: Mapped[list["ClaimRetention"]] = relationship(back_populates="claim", cascade="all, delete-orphan")
    events: Mapped[list["ClaimEvent"]] = relationship(back_populates="claim", cascade="all, delete-orphan")


class ClaimRetention(Base, IdMixin):
    __tablename__ = "claim_retentions"
    __table_args__ = (UniqueConstraint("claim_id", "retention_id", name="uq_claim_retention"),)

    claim_id: Mapped[int] = mapped_column(ForeignKey("claims.id"), index=True)
    retention_id: Mapped[int] = mapped_column(ForeignKey("retentions.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))

    claim: Mapped[Claim] = relationship(back_populates="links")


class ClaimEvent(Base, IdMixin):
    __tablename__ = "claim_events"

    claim_id: Mapped[int] = mapped_column(ForeignKey("claims.id"), index=True)
    event_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    event_type: Mapped[str] = mapped_column(String(40), default="nota")
    description: Mapped[str] = mapped_column(Text, default="")
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    claim: Mapped[Claim] = relationship(back_populates="events")


class ReminderRule(Base, IdMixin):
    __tablename__ = "reminder_rules"

    code: Mapped[str] = mapped_column(String(40), unique=True)
    days_before: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repeat_every_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(String(200), default="")


class Reminder(Base, IdMixin):
    __tablename__ = "reminders"
    __table_args__ = (UniqueConstraint("entity_type", "entity_id", "anchor_key", name="uq_reminder_anchor"),)

    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    anchor_key: Mapped[str] = mapped_column(String(120))
    rule_code: Mapped[str] = mapped_column(String(40), default="")
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(Text, default="")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(8), default="ARS")
    priority: Mapped[str] = mapped_column(String(16), default="media")
    status: Mapped[str] = mapped_column(String(20), default="pendiente", index=True)
    link_path: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    managed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmailLog(Base, IdMixin):
    __tablename__ = "email_logs"

    reminder_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    to_address: Mapped[str] = mapped_column(String(180))
    subject: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(20), index=True)
    automatic: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Document(Base, IdMixin):
    __tablename__ = "documents"

    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(80), unique=True)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base, IdMixin):
    __tablename__ = "audit_logs"

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[str] = mapped_column(String(40), default="")
    action: Mapped[str] = mapped_column(String(40))
    old_values: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_values: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    impact: Mapped[str] = mapped_column(Text, default="")
