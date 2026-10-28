from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# create_all no agrega columnas a tablas que ya existen: las columnas nuevas se suman acá.
NEW_COLUMNS = [
    ("certificates", "invoice_number", "VARCHAR(80) NOT NULL DEFAULT ''"),
]


def add_missing_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table, column, ddl in NEW_COLUMNS:
            if table not in tables:
                continue
            existing = {col["name"] for col in inspector.get_columns(table)}
            if column not in existing:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
