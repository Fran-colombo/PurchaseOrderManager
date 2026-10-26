from enum import Enum


class UserRole(str, Enum):
    NORMAL = "normal"
    SYSADMIN = "sysadmin"


class RecordStatus(str, Enum):
    ACTIVE = "activo"
    INACTIVE = "inactivo"


class ProjectStatus(str, Enum):
    PLANNING = "planificacion"
    IN_PROGRESS = "en_ejecucion"
    FINISHED = "finalizada"
    SUSPENDED = "suspendida"
    CANCELLED = "cancelada"


class PurchaseOrderStatus(str, Enum):
    DRAFT = "borrador"
    ACTIVE = "vigente"
    COMPLETED = "finalizada"
    CANCELLED = "cancelada"


class RetentionBase(str, Enum):
    BASE_ONLY = "solo_base"
    BASE_PLUS_APPROVED_CAC = "base_mas_cac_aprobado"
    GROSS = "bruto_total"
    CUSTOM = "personalizada"


class ReleaseTrigger(str, Enum):
    PROJECT = "finalizacion_obra"
    PURCHASE_ORDER = "finalizacion_orden"
    SCOPE = "finalizacion_alcance"
    CONTRACTUAL = "fecha_contractual"
    CERTIFICATE = "fecha_certificado"


class CertificateStatus(str, Enum):
    DRAFT = "borrador"
    SUBMITTED = "presentado"
    APPROVED = "aprobado"
    INVOICED = "facturado"
    PARTIALLY_PAID = "parcialmente_pagado"
    PAID = "pagado"
    OBSERVED = "observado"
    VOIDED = "anulado"


class DocumentKind(str, Enum):
    PROGRESS = "avance"
    CREDIT_NOTE = "nota_credito"
    DEBIT_NOTE = "nota_debito"


class AdjustmentKind(str, Enum):
    INCLUDED = "incluido"
    COMPLEMENTARY = "complementario"
    SUBSEQUENT = "posterior"
    CREDIT_NOTE = "nota_credito"
    DEBIT_NOTE = "nota_debito"
    CORRECTION = "correccion"


class AdjustmentMethod(str, Enum):
    SIMPLE = "variacion_simple"
    CONTRACTUAL = "contractual"


class AdjustmentStatus(str, Enum):
    CALCULATED = "calculado"
    PRESENTED = "presentado"
    APPROVED = "aprobado"
    INVOICED = "facturado"
    PAID = "pagado"
    REJECTED = "rechazado"
    VOIDED = "anulado"
    SUPERSEDED = "reemplazado"


class PaymentStatus(str, Enum):
    REGISTERED = "registrado"
    VOIDED = "anulado"


class PaymentConcept(str, Enum):
    CERTIFICATE_NET = "neto_certificado"
    RETENTION_RECOVERY = "devolucion_caucion"
    OTHER = "otro"


class RetentionStatus(str, Enum):
    PENDING_DATE = "pendiente_fecha_finalizacion"
    ACCRUING = "en_plazo"
    UPCOMING = "proxima"
    CLAIMABLE = "habilitada_para_reclamar"
    CLAIMED = "reclamada"
    PARTIAL = "parcialmente_recuperada"
    RECOVERED = "recuperada"
    DISPUTED = "en_disputa"
    OVERDUE = "vencida_impaga"
    VOIDED = "anulada"


class ClaimStatus(str, Enum):
    PENDING = "pendiente_de_reclamar"
    SENT = "reclamo_enviado"
    FOLLOWUP = "en_seguimiento"
    PROMISED = "fecha_de_pago_prometida"
    PARTIAL = "parcialmente_recuperado"
    RECOVERED = "recuperado"
    DISPUTED = "en_disputa"
    VOIDED = "anulado"


class ClaimChannel(str, Enum):
    EMAIL = "correo"
    WHATSAPP = "whatsapp"
    PHONE = "telefono"
    FORMAL = "nota_formal"
    OTHER = "otro"


class ReminderStatus(str, Enum):
    PENDING = "pendiente"
    SEEN = "visto"
    MANAGED = "gestionado"


class MilestoneScope(str, Enum):
    PROJECT = "obra"
    PURCHASE_ORDER = "orden"
    SCOPE = "alcance"
    CONTRACTUAL = "contractual"


COUNTS_IN_CERTIFIED = {
    CertificateStatus.SUBMITTED.value,
    CertificateStatus.APPROVED.value,
    CertificateStatus.INVOICED.value,
    CertificateStatus.PARTIALLY_PAID.value,
    CertificateStatus.PAID.value,
    CertificateStatus.OBSERVED.value,
}

INVOICED_STATUSES = {
    CertificateStatus.INVOICED.value,
    CertificateStatus.PARTIALLY_PAID.value,
    CertificateStatus.PAID.value,
}

EXIGIBLE_STATUSES = INVOICED_STATUSES | {CertificateStatus.APPROVED.value}

APPROVED_ADJUSTMENT = {
    AdjustmentStatus.APPROVED.value,
    AdjustmentStatus.INVOICED.value,
    AdjustmentStatus.PAID.value,
}

ACTIVE_ADJUSTMENT = {
    AdjustmentStatus.CALCULATED.value,
    AdjustmentStatus.PRESENTED.value,
    AdjustmentStatus.APPROVED.value,
    AdjustmentStatus.INVOICED.value,
    AdjustmentStatus.PAID.value,
}

OPEN_CLAIM = {
    ClaimStatus.SENT.value,
    ClaimStatus.FOLLOWUP.value,
    ClaimStatus.PROMISED.value,
    ClaimStatus.PARTIAL.value,
    ClaimStatus.DISPUTED.value,
    ClaimStatus.PENDING.value,
}
