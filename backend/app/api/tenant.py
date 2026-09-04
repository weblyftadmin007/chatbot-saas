from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from typing import Optional, List, Dict, Any
import json
import uuid
from datetime import datetime, timezone, timedelta

from app.schemas import (
    TenantCreate,
    TenantUpdate,
    TenantResponse,
    KnowledgeUploadRequest,
    KnowledgeChunkResponse
)
from app.database import get_db
from app.services.knowledge import knowledge_service
from app.middleware.tenant import get_current_tenant
from app.api.admin import verify_admin


# All tenant-management routes require a verified admin token; the tenant is
# selected via the X-Tenant-Slug header (or subdomain), never via spoofable
# client state alone.
router = APIRouter(prefix="/api/tenants", tags=["tenant"], dependencies=[Depends(verify_admin)])


@router.get("/me", response_model=TenantResponse)
async def get_my_tenant(tenant: dict = Depends(get_current_tenant)):
    """Get current tenant info"""
    return TenantResponse(
        id=tenant['id'],
        slug=tenant['slug'],
        name=tenant['name'],
        domain=tenant.get('domain'),
        plan=tenant.get('plan', 'free'),
        settings=json.loads(tenant.get('settings', '{}')),
        business_hours=json.loads(tenant.get('business_hours', '{}')) if tenant.get('business_hours') else None,
        timezone=tenant.get('timezone', 'UTC'),
        slot_duration=tenant.get('slot_duration', 30),
        buffer_minutes=tenant.get('buffer_minutes', 15),
        created_at=tenant['created_at'],
        updated_at=tenant['updated_at']
    )


@router.patch("/me", response_model=TenantResponse)
async def update_my_tenant(
    update: TenantUpdate,
    tenant: dict = Depends(get_current_tenant)
):
    """Update tenant settings"""
    db = get_db()
    tenant_id = tenant['id']

    # Build update fields
    updates = []
    values = []

    if update.name is not None:
        updates.append("name = ?")
        values.append(update.name)
    if update.primary_color is not None:
        updates.append("settings = json_set(COALESCE(settings, '{}'), '$.primary_color', ?)")
        values.append(update.primary_color)
    if update.secondary_color is not None:
        updates.append("settings = json_set(COALESCE(settings, '{}'), '$.secondary_color', ?)")
        values.append(update.secondary_color)
    if update.greeting is not None:
        updates.append("settings = json_set(COALESCE(settings, '{}'), '$.greeting', ?)")
        values.append(update.greeting)
    if update.bot_name is not None:
        updates.append("settings = json_set(COALESCE(settings, '{}'), '$.bot_name', ?)")
        values.append(update.bot_name)
    if update.logo_url is not None:
        updates.append("settings = json_set(COALESCE(settings, '{}'), '$.logo_url', ?)")
        values.append(update.logo_url)
    if update.show_branding is not None:
        updates.append("settings = json_set(COALESCE(settings, '{}'), '$.show_branding', ?)")
        values.append(update.show_branding)
    if update.timezone is not None:
        updates.append("timezone = ?")
        values.append(update.timezone)
    if update.slot_duration is not None:
        updates.append("slot_duration = ?")
        values.append(update.slot_duration)
    if update.buffer_minutes is not None:
        updates.append("buffer_minutes = ?")
        values.append(update.buffer_minutes)
    if update.business_hours is not None:
        updates.append("business_hours = ?")
        values.append(json.dumps(update.business_hours))

    if updates:
        updates.append("updated_at = ?")
        values.append(int(datetime.now(timezone.utc).timestamp()))
        values.append(tenant_id)

        await db.execute(f"""
            UPDATE tenants SET {', '.join(updates)} WHERE id = ?
        """, values)

    # Return updated tenant
    result = await db.execute("SELECT * FROM tenants WHERE id = ?", [tenant_id])
    updated = dict(zip(result.columns, result.rows[0]))

    return TenantResponse(
        id=updated['id'],
        slug=updated['slug'],
        name=updated['name'],
        domain=updated.get('domain'),
        plan=updated.get('plan', 'free'),
        settings=json.loads(updated.get('settings', '{}')),
        business_hours=json.loads(updated.get('business_hours', '{}')) if updated.get('business_hours') else None,
        timezone=updated.get('timezone', 'UTC'),
        slot_duration=updated.get('slot_duration', 30),
        buffer_minutes=updated.get('buffer_minutes', 15),
        created_at=updated['created_at'],
        updated_at=updated['updated_at']
    )


@router.post("/me/knowledge", response_model=KnowledgeChunkResponse)
async def upload_knowledge(
    file: UploadFile = File(...),
    source_id: str = Form(...),
    source_type: str = Form("pdf"),
    tenant: dict = Depends(get_current_tenant)
):
    """Upload knowledge file (PDF, TXT, MD)"""
    tenant_id = tenant['id']
    content = await file.read()

    if source_type == 'pdf':
        result = await knowledge_service.process_pdf(tenant_id, content, source_id)
    elif source_type in ['txt', 'md']:
        text = content.decode('utf-8')
        result = await knowledge_service.process_text(tenant_id, text, source_id, source_type)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    return KnowledgeChunkResponse(
        id=source_id,
        source_id=source_id,
        source_type=source_type,
        content_preview=f"Processed {result['chunks_created']} chunks",
        created_at=int(datetime.now(timezone.utc).timestamp())
    )


@router.post("/me/knowledge/text", response_model=KnowledgeChunkResponse)
async def upload_knowledge_text(
    request: KnowledgeUploadRequest,
    tenant: dict = Depends(get_current_tenant)
):
    """Upload knowledge as text/FAQ"""
    tenant_id = tenant['id']

    if request.source_type == 'faq':
        # Expect content to be JSON array of {question, answer}
        import json
        try:
            faq_items = json.loads(request.content)
            result = await knowledge_service.process_faq(tenant_id, faq_items, request.source_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid FAQ format")
    else:
        result = await knowledge_service.process_text(
            tenant_id, request.content, request.source_id, request.source_type
        )

    return KnowledgeChunkResponse(
        id=request.source_id,
        source_id=request.source_id,
        source_type=request.source_type,
        content_preview=f"Processed {result['chunks_created']} chunks",
        created_at=int(datetime.now(timezone.utc).timestamp())
    )


@router.delete("/me/knowledge/{source_id}")
async def delete_knowledge(
    source_id: str,
    tenant: dict = Depends(get_current_tenant)
):
    """Delete knowledge source"""
    tenant_id = tenant['id']
    deleted = await knowledge_service.delete_source(tenant_id, source_id)
    return {"deleted_chunks": deleted}


@router.get("/me/knowledge", response_model=List[KnowledgeChunkResponse])
async def list_knowledge(
    tenant: dict = Depends(get_current_tenant)
):
    """List all knowledge sources"""
    tenant_id = tenant['id']
    sources = await knowledge_service.list_sources(tenant_id)
    return [
        KnowledgeChunkResponse(
            id=s['source_id'],
            source_id=s['source_id'],
            source_type=s['source_type'],
            content_preview=f"{s['chunk_count']} chunks",
            created_at=s['last_updated']
        )
        for s in sources
    ]


@router.get("/me/conversations")
async def list_conversations(
    tenant: dict = Depends(get_current_tenant),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0)
):
    """List conversations for tenant"""
    db = get_db()
    tenant_id = tenant['id']

    result = await db.execute("""
        SELECT
            c.id,
            c.end_user_id,
            c.status,
            c.created_at,
            c.updated_at,
            (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
            (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
        FROM conversations c
        WHERE c.tenant_id = ?
        ORDER BY c.updated_at DESC
        LIMIT ? OFFSET ?
    """, [tenant_id, limit, offset])

    return [dict(zip(result.columns, row)) for row in result.rows]


@router.get("/me/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    tenant: dict = Depends(get_current_tenant)
):
    """Get full conversation with messages"""
    db = get_db()
    tenant_id = tenant['id']

    # Verify conversation belongs to tenant
    conv_result = await db.execute("""
        SELECT * FROM conversations WHERE id = ? AND tenant_id = ?
    """, [conversation_id, tenant_id])

    if not conv_result.rows:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv = dict(zip(conv_result.columns, conv_result.rows[0]))

    # Get messages
    msg_result = await db.execute("""
        SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at
    """, [conversation_id])

    messages = [dict(zip(msg_result.columns, row)) for row in msg_result.rows]

    return {
        "conversation": conv,
        "messages": messages
    }


@router.get("/me/appointments")
async def list_appointments(
    tenant: dict = Depends(get_current_tenant),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0)
):
    """List appointments for tenant"""
    db = get_db()
    tenant_id = tenant['id']

    query = "SELECT * FROM appointments WHERE tenant_id = ?"
    params = [tenant_id]

    if status:
        query += " AND status = ?"
        params.append(status)

    query += " ORDER BY start_time DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    result = await db.execute(query, params)
    return [dict(zip(result.columns, row)) for row in result.rows]


@router.get("/me/analytics")
async def get_analytics(
    tenant: dict = Depends(get_current_tenant),
    days: int = Query(30, le=365)
):
    """Get analytics for tenant"""
    db = get_db()
    tenant_id = tenant['id']

    since = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())

    # Total conversations
    conv_result = await db.execute(
        "SELECT COUNT(*) FROM conversations WHERE tenant_id = ?", [tenant_id]
    )
    total_conversations = conv_result.rows[0][0] if conv_result.rows else 0

    # Total appointments
    appt_result = await db.execute(
        "SELECT COUNT(*) FROM appointments WHERE tenant_id = ?", [tenant_id]
    )
    total_appointments = appt_result.rows[0][0] if appt_result.rows else 0

    # Messages in period
    msg_result = await db.execute(
        "SELECT COUNT(*) FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.tenant_id = ? AND m.created_at > ?",
        [tenant_id, since]
    )
    messages_period = msg_result.rows[0][0] if msg_result.rows else 0

    # Appointments in period
    appt_period_result = await db.execute(
        "SELECT COUNT(*) FROM appointments WHERE tenant_id = ? AND created_at > ?",
        [tenant_id, since]
    )
    appointments_period = appt_period_result.rows[0][0] if appt_period_result.rows else 0

    # Resolution rate (conversations with at least 1 assistant message)
    resolved_result = await db.execute("""
        SELECT COUNT(DISTINCT c.id) FROM conversations c
        JOIN messages m ON c.id = m.conversation_id
        WHERE c.tenant_id = ? AND m.role = 'assistant'
    """, [tenant_id])
    resolved = resolved_result.rows[0][0] if resolved_result.rows else 0

    resolution_rate = (resolved / total_conversations * 100) if total_conversations > 0 else 0

    return {
        "total_conversations": total_conversations,
        "total_appointments": total_appointments,
        "messages_last_period": messages_period,
        "appointments_last_period": appointments_period,
        "resolution_rate": round(resolution_rate, 1),
        "period_days": days
    }