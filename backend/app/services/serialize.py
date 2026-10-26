from datetime import date, datetime
from decimal import Decimal

from app.services.money import D, money


def jsonable(value):
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    return value


def s_money(value) -> str:
    return format(money(value), "f")


def s_qty(value) -> str:
    return format(D(value).quantize(Decimal("0.0001")), "f")


def s_coef(value) -> str | None:
    if value is None:
        return None
    return format(D(value).quantize(Decimal("0.00000001")), "f")


def s_percent(value) -> str:
    return format(D(value).quantize(Decimal("0.0001")), "f")
