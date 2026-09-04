from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime


# Widget API Schemas
class WidgetConfigResponse(BaseModel):
    tenant_slug: str
    tenant_name: str
    bot_name: str = "Assistant"
    greeting: str = "Hi! How can I help you today?"
    primary_color: str = "#3B82F6"
    secondary_color: str = "#1E40AF"
    logo_url: Optional[str] = None
    show_branding: bool = True
    business_hours: Optional[Dict[str, Any]] = None


class ChatMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    conversation_id: Optional[str] = None
    session_id: Optional[str] = None


class ChatMessageResponse(BaseModel):
    conversation_id: str
    message_id: str
    role: str
    content: str
    intent: Optional[str] = None
    slots: Optional[List[Dict[str, Any]]] = None
    requires_action: Optional[str] = None  # "book_appointment", "pick_slot"


class AvailabilityRequest(BaseModel):
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    timezone: str = "UTC"


class SlotResponse(BaseModel):
    start_time: int
    end_time: int
    available: bool


class BookAppointmentRequest(BaseModel):
    start_time: int
    end_time: int
    title: Optional[str] = None
    notes: Optional[str] = None
    email: EmailStr
    name: Optional[str] = None


class BookAppointmentResponse(BaseModel):
    appointment_id: str
    status: str
    start_time: int
    end_time: int
    confirmation_message: str


# Tenant Dashboard Schemas
class TenantCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-z0-9-]+$')
    primary_color: str = Field(default="#3B82F6", pattern=r'^#[0-9A-Fa-f]{6}$')
    greeting: str = Field(default="Hi! How can I help you today?")


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    greeting: Optional[str] = None
    bot_name: Optional[str] = None
    logo_url: Optional[str] = None
    show_branding: Optional[bool] = None
    timezone: Optional[str] = None
    slot_duration: Optional[int] = None
    buffer_minutes: Optional[int] = None
    business_hours: Optional[Dict[str, Any]] = None


class TenantResponse(BaseModel):
    id: str
    slug: str
    name: str
    domain: Optional[str]
    plan: str
    settings: Dict[str, Any]
    business_hours: Optional[Dict[str, Any]]
    timezone: str
    slot_duration: int
    buffer_minutes: int
    created_at: int
    updated_at: int


class KnowledgeUploadRequest(BaseModel):
    source_id: str
    source_type: str  # pdf, txt, md, url, faq
    content: str
    metadata: Optional[Dict[str, Any]] = None


class KnowledgeChunkResponse(BaseModel):
    id: str
    source_id: str
    source_type: str
    content_preview: str
    created_at: int


# Admin Schemas
class AdminTenantListResponse(BaseModel):
    tenants: List[TenantResponse]
    total: int
    page: int
    page_size: int


class AnalyticsResponse(BaseModel):
    total_tenants: int
    active_tenants: int
    total_conversations: int
    total_appointments: int
    total_messages: int
    messages_last_7_days: int
    appointments_last_7_days: int
    top_tenants: List[Dict[str, Any]]


class ConversationSummary(BaseModel):
    id: str
    end_user_email: Optional[str]
    end_user_name: Optional[str]
    status: str
    message_count: int
    last_message_at: int
    created_at: int


class AppointmentSummary(BaseModel):
    id: str
    end_user_email: Optional[str]
    end_user_name: Optional[str]
    title: Optional[str]
    start_time: int
    end_time: int
    status: str
    created_at: int


# Email Schemas
class EmailRequest(BaseModel):
    to: EmailStr
    subject: str
    html: str


# Health
class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: int