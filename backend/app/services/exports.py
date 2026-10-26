import csv
import io

from openpyxl import Workbook


def export_table(report: dict, fmt: str) -> tuple[bytes, str, str]:
    columns = report["columns"]
    keys = [column["key"] for column in columns]
    labels = [column["label"] for column in columns]
    if fmt == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(labels)
        for row in report["rows"]:
            writer.writerow([row.get(key, "") for key in keys])
        if report.get("totals"):
            writer.writerow([report["totals"].get(key, "") for key in keys])
        filename = f"{report['name']}.csv"
        return buffer.getvalue().encode("utf-8-sig"), "text/csv; charset=utf-8", filename
    if fmt == "xlsx":
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = report["title"][:31]
        sheet.append(labels)
        for row in report["rows"]:
            sheet.append([row.get(key, "") for key in keys])
        if report.get("totals"):
            sheet.append([report["totals"].get(key, "") for key in keys])
        binary = io.BytesIO()
        workbook.save(binary)
        filename = f"{report['name']}.xlsx"
        return (
            binary.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename,
        )
    from app.core.errors import AppError

    raise AppError("El formato de exportación debe ser csv o xlsx.", code="invalid_format")
