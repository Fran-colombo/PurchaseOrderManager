"""Fórmulas financieras puras. El resto del sistema debe usar este módulo."""

from datetime import date, timedelta
from decimal import Decimal

from app.core.errors import AppError
from app.models.enums import RetentionBase
from app.services.money import D, ZERO, coef, money


def document_sign(document_type: str) -> Decimal:
    if document_type == "nota_credito":
        return Decimal("-1")
    return Decimal("1")


def line_amount(quantity, unit_price) -> Decimal:
    return money(D(quantity) * D(unit_price))


def simple_variation(adjustable_base, index_base, index_updated) -> dict:
    if index_base is None or index_updated is None:
        raise AppError("Faltan los índices CAC para calcular el reajuste.", code="cac_index_missing")
    base_idx = D(index_base)
    updated_idx = D(index_updated)
    if base_idx == 0:
        raise AppError("El índice CAC base no puede ser cero.", code="cac_index_zero")
    if base_idx < 0 or updated_idx < 0:
        raise AppError("Los índices CAC no pueden ser negativos.", code="cac_index_invalid")
    coefficient = coef(updated_idx / base_idx)
    updated_amount = money(D(adjustable_base) * coefficient)
    adjustment_amount = money(updated_amount - money(adjustable_base))
    return {
        "coefficient": coefficient,
        "updated_amount": updated_amount,
        "adjustment_amount": adjustment_amount,
        "formula": "coeficiente = indice_actualizado / indice_base; reajuste = base_reajustable x coeficiente - base_reajustable",
    }


def contractual_adjustment(adjustable_base, validated_amount, formula_text: str, parameters: dict | None) -> dict:
    if validated_amount is None:
        raise AppError("El método contractual exige un importe de reajuste validado.", code="cac_amount_required")
    adjustment_amount = money(validated_amount)
    updated_amount = money(D(adjustable_base) + adjustment_amount)
    return {
        "coefficient": None,
        "updated_amount": updated_amount,
        "adjustment_amount": adjustment_amount,
        "formula": formula_text or "Fórmula contractual registrada manualmente.",
        "parameters": parameters or {},
    }


def retention_parts(
    base_type: str,
    concepts: list[str] | None,
    base_amount,
    cac_registered,
    cac_approved,
    other_additions=0,
) -> tuple[Decimal, dict[str, Decimal]]:
    base_amount = money(base_amount)
    cac_registered = money(cac_registered)
    cac_approved = money(cac_approved)
    other_additions = money(other_additions)
    selected = set(concepts or [])

    if base_type == RetentionBase.BASE_ONLY.value:
        parts = {"base": base_amount}
    elif base_type == RetentionBase.BASE_PLUS_APPROVED_CAC.value:
        parts = {"base": base_amount, "cac_aprobado": cac_approved}
    elif base_type == RetentionBase.GROSS.value:
        parts = {"base": base_amount, "cac": cac_registered, "otros": other_additions}
    elif base_type == RetentionBase.CUSTOM.value:
        parts = {}
        if "base" in selected:
            parts["base"] = base_amount
        if "cac_aprobado" in selected:
            parts["cac_aprobado"] = cac_approved
        if "cac" in selected:
            parts["cac"] = cac_registered
        if "otros" in selected:
            parts["otros"] = other_additions
        if not parts:
            raise AppError("La base personalizada debe incluir al menos un concepto.", code="retention_concepts")
    else:
        raise AppError("La base de retención no es válida.", code="retention_base")

    total = money(sum(parts.values(), ZERO))
    return total, parts


def retention_amount(base, percent) -> Decimal:
    return money(D(base) * D(percent) / Decimal("100"))


def net_amount(gross, retention, other_deductions) -> Decimal:
    return money(D(gross) - D(retention) - D(other_deductions))


def gross_amount(base, cac, other_additions=0) -> Decimal:
    return money(D(base) + D(cac) + D(other_additions))


def formula_text(percent, parts: dict[str, Decimal], base_total, retained) -> str:
    detail = " + ".join(f"{name} {format(value, 'f')}" for name, value in parts.items())
    return (
        f"Conceptos de la base: {detail}. "
        f"Base sujeta a retención: {format(money(base_total), 'f')}. "
        f"Retención del {format(D(percent), 'f')}%: {format(money(retained), 'f')}."
    )


def compute_release_date(
    trigger: str,
    completion_date: date | None,
    contractual_start: date | None,
    explicit_release_date: date | None,
    certificate_date: date | None,
    release_days: int,
) -> date | None:
    """No inventa una fecha. Si falta el hito que inicia el plazo, devuelve None.

    Una fecha explícita de liberación, pactada en el contrato, tiene prioridad
    y no se calcula sumando días.
    """
    if explicit_release_date is not None:
        return explicit_release_date
    if trigger == "fecha_certificado":
        start = certificate_date
    elif trigger == "fecha_contractual":
        start = contractual_start or completion_date
    else:
        start = completion_date
    if start is None:
        return None
    return start + timedelta(days=int(release_days))


def pending_balance(exigible, collected) -> Decimal:
    return money(D(exigible) - D(collected))
