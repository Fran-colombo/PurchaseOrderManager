from decimal import Decimal

import pytest

from app.core.errors import AppError
from app.services.calculations import compute_release_date, retention_amount, retention_parts, simple_variation
from datetime import date


def test_simple_variation_one_million():
    result = simple_variation(Decimal("1000000"), Decimal("100"), Decimal("120"))
    assert result["updated_amount"] == Decimal("1200000.00")
    assert result["adjustment_amount"] == Decimal("200000.00")
    assert result["coefficient"] == Decimal("1.20000000")


def test_rejects_zero_base_index():
    with pytest.raises(AppError) as caught:
        simple_variation(Decimal("1000"), Decimal("0"), Decimal("120"))
    assert caught.value.code == "cac_index_zero"


def test_retention_percent_on_configured_base():
    base_only, _ = retention_parts("solo_base", [], Decimal("1000000"), Decimal("200000"), Decimal("200000"))
    assert retention_amount(base_only, Decimal("5")) == Decimal("50000.00")
    with_cac, parts = retention_parts("base_mas_cac_aprobado", [], Decimal("1000000"), Decimal("200000"), Decimal("200000"))
    assert with_cac == Decimal("1200000.00")
    assert retention_amount(with_cac, Decimal("5")) == Decimal("60000.00")
    assert "cac_aprobado" in parts


def test_release_date_is_not_invented():
    assert compute_release_date("finalizacion_orden", None, None, None, date(2026, 1, 1), 180) is None
    start = date(2026, 1, 1)
    assert compute_release_date("finalizacion_orden", start, None, None, date(2026, 3, 1), 180) == date(2026, 6, 30)
