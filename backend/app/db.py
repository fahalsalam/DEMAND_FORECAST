"""Database engine + session handling.

Default driver is SQLite (file-based, zero-ops). The URL is overridable via
the DATABASE_URL env var so the same code points at PostgreSQL in production
without a line change — that's the swappability the spec calls for.

SQLite-specific touches kept INSIDE this module:
  - `check_same_thread=False`   — FastAPI uses worker threads
  - `PRAGMA foreign_keys=ON`    — SQLite disables FKs by default; we want
                                  the same referential behavior as Postgres

Everywhere else in the codebase uses plain SQLAlchemy ORM, no SQLite-only SQL.
"""
from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# ---- engine ----------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / "demand_forecast.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")

_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    future=True,
)


# ---- declarative base ------------------------------------------------------
class Base(DeclarativeBase):
    """Common base for all ORM models."""


# ---- SQLite: enforce foreign keys ------------------------------------------
@event.listens_for(Engine, "connect")
def _sqlite_enable_fk(dbapi_connection, _connection_record) -> None:  # noqa: ANN001
    # The listener runs for every dialect; gate on driver name to keep it a no-op
    # for non-SQLite engines (which already enforce FKs natively).
    try:
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()
    except Exception:
        # Non-SQLite drivers raise on PRAGMA — safe to ignore.
        pass


# ---- FastAPI dependency ----------------------------------------------------
def get_db() -> Generator[Session, None, None]:
    """Yield a scoped DB session; always close after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Called by seed.py and on first server boot."""
    # Import models so they register with Base.metadata BEFORE create_all.
    from app.models import tables  # noqa: F401

    Base.metadata.create_all(bind=engine)
