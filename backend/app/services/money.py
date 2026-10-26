from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")
COEF_Q = Decimal("0.00000001")
ZERO = Decimal("0")


def D(value) -> Decimal:
    if value is None or value == "":
        return ZERO
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def money(value) -> Decimal:
    return D(value).quantize(CENT, rounding=ROUND_HALF_UP)


def coef(value) -> Decimal:
    return D(value).quantize(COEF_Q, rounding=ROUND_HALF_UP)


def dec_str(value) -> str:
    return format(money(value), "f")


def nearly(a, b, tolerance: Decimal = CENT) -> bool:
    return abs(money(a) - money(b)) <= tolerance
