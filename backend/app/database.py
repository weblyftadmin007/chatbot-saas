import os
import libsql_client
from contextlib import asynccontextmanager
from typing import AsyncGenerator
import json
from libsql_client import ResultSet

from app.config import settings


class Database:
    def __init__(self):
        self._client: libsql_client.Client = None
        self._sync_client: libsql_client.ClientSync = None

    async def connect(self):
        """Initialize async client for FastAPI"""
        self._client = libsql_client.create_client(
            url=settings.turso_database_url,
            auth_token=settings.turso_auth_token
        )
        # Enable vec extension
        await self._client.execute("PRAGMA enable_load_extension = true;")
        try:
            await self._client.execute("SELECT vec_version();")
        except Exception:
            # Try loading extension
            try:
                await self._client.execute("SELECT load_extension('vec0');")
            except Exception as e:
                print(f"Warning: Could not load vec extension: {e}")

    def sync_connect(self):
        """Initialize sync client for scripts/migrations"""
        if self._sync_client is None:
            self._sync_client = libsql_client.create_client_sync(
                url=settings.turso_database_url,
                auth_token=settings.turso_auth_token
            )
            # Enable vec extension
            self._sync_client.execute("PRAGMA enable_load_extension = true;")
            try:
                self._sync_client.execute("SELECT vec_version();")
            except Exception:
                try:
                    self._sync_client.execute("SELECT load_extension('vec0');")
                except Exception as e:
                    print(f"Warning: Could not load vec extension: {e}")
        return self._sync_client

    async def close(self):
        if self._client:
            await self._client.close()
        if self._sync_client:
            self._sync_client.close()

    @property
    def client(self) -> libsql_client.Client:
        return self._client

    @property
    def sync(self) -> libsql_client.ClientSync:
        return self.sync_connect()


db = Database()


@asynccontextmanager
async def lifespan(app) -> AsyncGenerator:
    await db.connect()
    yield
    await db.close()


def get_db() -> libsql_client.Client:
    return db.client


def get_sync_db() -> libsql_client.ClientSync:
    return db.sync