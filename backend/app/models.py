from sqlmodel import Field, SQLModel
from typing import Optional
from datetime import datetime, timezone
import uuid


class Tenant(SQLModel, table=True):
    __tablename__ = "tenants"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    slug: str = Field(unique=True, index=True, max_length=100)
    name: str = Field(max_length=200)
    domain: Optional[str] = Field(default=None, max_length=200)
    plan: str = Field(default="free", max_length=20)
    settings: str = Field(default="{}")  # JSON string
    business_hours: Optional[str] = Field(default=None)  # JSON string
    timezone: str = Field(default="UTC", max_length=50)
    slot_duration: int = Field(default=30)
    buffer_minutes: int = Field(default=15)
    created_at: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp()))
    updated_at: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp()))

    def get_settings(self) -> dict:
        import json
        return json.loads(self.settings) if self.settings else {}

    def set_settings(self, data: dict):
        import json
        self.settings = json.dumps(data)

    def get_business_hours(self) -> dict:
        import json
        return json.loads(self.business_hours) if self.business_hours else {}


class EndUser(SQLModel, table=True):
    __tablename__ = "end_users"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = Field(foreign_key="tenants.id", index=True)
    clerk_user_id: Optional[str] = Field(default=None, unique=True, max_length=100)
    email: Optional[str] = Field(default=None, max_length=200)
    name: Optional[str] = Field(default=None, max_length=100)
    metadata: str = Field(default="{}")
    created_at: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp()))


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = Field(foreign_key="tenants.id", index=True)
    end_user_id: str = Field(foreign_key="end_users.id", index=True)
    status: str = Field(default="active", max_length=20)
    metadata: str = Field(default="{}")
    created_at: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp()))
    updated_at: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp()))


class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    conversation_id: str = Field(foreign_key="conversations.id", index=True)
    role: str = Field(max_length=20)  # user, assistant, system, tool
    content: str
    intent: Optional[str] = Field(default=None, max_length=50)
    tool_calls: Optional[str] = Field(default=None)  # JSON string
    tokens_used: int = Field(default=0)
    created_at: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp()))


class Appointment(SQLModel, table=True):
    __tablename__ = "appointments"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = Field(foreign_key="tenants.id", index=True)
    conversation_id: str = Field(foreign_key="conversations.id", index=True)
    end_user_id: str = Field(foreign_key="end_users.id", index=True)
    start_time: int  # Unix timestamp
    end_time: int    # Unix timestamp
    status: str = Field(default="pending", max_length=20)  # pending, confirmed, cancelled, completed
    title: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None)
    metadata: str = Field(default="{}")
    created_at: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp()))
    updated_at: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp()))


class KnowledgeChunk(SQLModel, table=True):
    __tablename__ = "knowledge_chunks"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = Field(foreign_key="tenants.id", index=True)
    source_id: str = Field(max_length=200)
    source_type: str = Field(max_length=20)  # pdf, txt, md, url, faq
    content: str
    embedding: Optional[bytes] = Field(default=None)  # Serialized vector
    metadata: str = Field(default="{}")
    created_at: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp()))


class UsageLog(SQLModel, table=True):
    __tablename__ = "usage_logs"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = Field(foreign_key="tenants.id", index=True)
    event_type: str = Field(max_length=50)
    metadata: str = Field(default="{}")
    created_at: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp()))