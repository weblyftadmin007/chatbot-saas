#!/usr/bin/env python3
"""Run database migrations directly on Turso/libSQL"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.database import Database
from app.config import settings


def run_migrations():
    """Execute migration SQL on Turso database"""
    db = Database()
    sync_db = db.sync_connect()

    # Read migration file
    migration_path = os.path.join(
        os.path.dirname(__file__),
        'migrations',
        'versions',
        '001_initial_schema.sql'
    )

    with open(migration_path, 'r') as f:
        sql = f.read()

    # Split by semicolon and execute each statement
    statements = [s.strip() for s in sql.split(';') if s.strip()]

    for stmt in statements:
        try:
            sync_db.execute(stmt)
            print(f"Executed: {stmt[:80]}...")
        except Exception as e:
            print(f"Error executing: {stmt[:80]}...")
            print(f"  Error: {e}")

    print("Migrations completed!")


if __name__ == "__main__":
    run_migrations()