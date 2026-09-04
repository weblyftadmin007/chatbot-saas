from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import sys
import os

# Add app to path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.database import get_sync_db
from app.models import *

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None  # We use raw SQL migrations


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Use our sync database connection
    sync_db = get_sync_db()

    # For libsql, we need to run migrations directly
    # This is a placeholder - actual migrations run via scripts
    pass


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()