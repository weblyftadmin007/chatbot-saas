from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List, Dict, Any
import json
import uuid
import base64
import time
import httpx
from datetime import datetime, timedelta, timezone

from app.schemas import (
    TenantCreate,
    TenantUpdate,
    TenantResponse,
    AdminTenantListResponse,
    AnalyticsResponse,
    KnowledgeUploadRequest
)
from app.database import get_db
from app.config import settings
from app.services.knowledge import knowledge_service
from jose import jwt, JWTError, jwk


router = APIRouter(prefix="/admin", tags=["admin"])
security = HTTPBearer(auto_error=False)

_jwks_cache = {"keys": None, "fetched_at": 0.0}


def _derive_frontend_api(publishable_key: str) -> Optional[str]:
    """Derive the Clerk Frontend API host from a pk_... publishable key.

    Clerk encodes the Frontend API host (e.g. 'foo-bar.clerk.accounts.dev$')
    as base64url after the 'pk_test_'/'pk_live_' prefix.
    """
    if not publishable_key or not publishable_key.startswith("pk_"):
        return None
    payload = publishable_key.split("_", 2)[-1]
    try:
        decoded = base64.urlsafe_b64decode(
            payload + "=" * (-len(payload) % 4)
        ).decode("utf-8")
    except Exception:
        return None
    host = decoded.split("$")[0].strip()
    if host and "." in host:
        return host
    return None


def _get_jwks() -> List[Dict[str, Any]]:
    """Fetch and cache Clerk's JWKS public keys"""
    now = time.time()
    if _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < 3600:
        return _jwks_cache["keys"]

    jwks_url = settings.clerk_jwks_url
    if not jwks_url:
        api_host = _derive_frontend_api(settings.clerk_publishable_key)
        if api_host:
            jwks_url = f"https://{api_host}/.well-known/jwks.json"
    if not jwks_url:
        raise HTTPException(status_code=500, detail="Clerk JWKS URL could not be determined")

    try:
        resp = httpx.get(jwks_url, timeout=10.0)
        resp.raise_for_status()
        keys = resp.json().get("keys", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Clerk JWKS: {e}")

    _jwks_cache["keys"] = keys
    _jwks_cache["fetched_at"] = now
    return keys


async def verify_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Verify a Clerk-issued admin JWT against Clerk's JWKS public keys"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        header = jwt.get_unverified_header(credentials.credentials)
        kid = header.get("kid")

        key = next(
            (candidate for candidate in _get_jwks() if candidate.get("kid") == kid),
            None
        )
        if key is None:
            raise HTTPException(status_code=401, detail="Unable to verify token: unknown key id")

        rsa_key = jwk.construct(key)
        payload = jwt.decode(
            credentials.credentials,
            rsa_key,
            algorithms=["RS256"],
            options={"verify_aud": False}  # Clerk tokens identify the app via 'azp'
        )

        # Verify the issuer matches our Clerk frontend API when we can derive it
        api_host = _derive_frontend_api(settings.clerk_publishable_key)
        iss = payload.get('iss')
        if iss and api_host and iss != f"https://{api_host}":
            raise HTTPException(status_code=401, detail="Invalid token issuer")

        email = payload.get('email') or payload.get('email_address')
        if email != settings.admin_email:
            raise HTTPException(status_code=403, detail="Not authorized")
        return email
    except HTTPException:
        raise
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


@router.get("/tenants", response_model=AdminTenantListResponse)
async def list_tenants(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    plan: Optional[str] = None,
    admin_email: str = Depends(verify_admin)
):
    """List all tenants with pagination"""
    db = get_db()

    where_clauses = ["plan != 'deleted'"]
    params = []

    if search:
        where_clauses.append("(name LIKE ? OR slug LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if plan:
        where_clauses.append("plan = ?")
        params.append(plan)

    where_sql = " AND ".join(where_clauses)

    # Total count
    count_result = await db.execute(
        f"SELECT COUNT(*) FROM tenants WHERE {where_sql}",
        params
    )
    total = count_result.rows[0][0] if count_result.rows else 0

    # Paginated results
    offset = (page - 1) * page_size
    params.extend([page_size, offset])

    result = await db.execute(f"""
        SELECT * FROM tenants WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    """, params)

    tenants = []
    for row in result.rows:
        t = dict(zip(result.columns, row))
        tenants.append(TenantResponse(
            id=t['id'],
            slug=t['slug'],
            name=t['name'],
            domain=t.get('domain'),
            plan=t.get('plan', 'free'),
            settings=json.loads(t.get('settings', '{}')),
            business_hours=json.loads(t.get('business_hours', '{}')) if t.get('business_hours') else None,
            timezone=t.get('timezone', 'UTC'),
            slot_duration=t.get('slot_duration', 30),
            buffer_minutes=t.get('buffer_minutes', 15),
            created_at=t['created_at'],
            updated_at=t['updated_at']
        ))

    return AdminTenantListResponse(
        tenants=tenants,
        total=total,
        page=page,
        page_size=page_size
    )


@router.post("/tenants", response_model=TenantResponse)
async def create_tenant(
    tenant_data: TenantCreate,
    admin_email: str = Depends(verify_admin)
):
    """Create a new tenant"""
    db = get_db()

    # Check slug uniqueness
    existing = await db.execute("SELECT id FROM tenants WHERE slug = ?", [tenant_data.slug])
    if existing.rows:
        raise HTTPException(status_code=400, detail="Slug already exists")

    tenant_id = str(uuid.uuid4())
    now = int(datetime.now(timezone.utc).timestamp())

    settings_dict = {
        "bot_name": "Assistant",
        "greeting": tenant_data.greeting,
        "primary_color": tenant_data.primary_color,
        "secondary_color": "#1E40AF",
        "show_branding": True
    }

    await db.execute("""
        INSERT INTO tenants (id, slug, name, plan, settings, created_at, updated_at)
        VALUES (?, ?, ?, 'free', ?, ?, ?)
    """, [tenant_id, tenant_data.slug, tenant_data.name, json.dumps(settings_dict), now, now])

    result = await db.execute("SELECT * FROM tenants WHERE id = ?", [tenant_id])
    t = dict(zip(result.columns, result.rows[0]))

    return TenantResponse(
        id=t['id'],
        slug=t['slug'],
        name=t['name'],
        domain=t.get('domain'),
        plan=t.get('plan', 'free'),
        settings=json.loads(t.get('settings', '{}')),
        business_hours=None,
        timezone=t.get('timezone', 'UTC'),
        slot_duration=t.get('slot_duration', 30),
        buffer_minutes=t.get('buffer_minutes', 15),
        created_at=t['created_at'],
        updated_at=t['updated_at']
    )


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: str,
    admin_email: str = Depends(verify_admin)
):
    """Get tenant by ID"""
    db = get_db()
    result = await db.execute("SELECT * FROM tenants WHERE id = ?", [tenant_id])
    if not result.rows:
        raise HTTPException(status_code=404, detail="Tenant not found")

    t = dict(zip(result.columns, result.rows[0]))
    return TenantResponse(
        id=t['id'],
        slug=t['slug'],
        name=t['name'],
        domain=t.get('domain'),
        plan=t.get('plan', 'free'),
        settings=json.loads(t.get('settings', '{}')),
        business_hours=json.loads(t.get('business_hours', '{}')) if t.get('business_hours') else None,
        timezone=t.get('timezone', 'UTC'),
        slot_duration=t.get('slot_duration', 30),
        buffer_minutes=t.get('buffer_minutes', 15),
        created_at=t['created_at'],
        updated_at=t['updated_at']
    )


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: str,
    update: TenantUpdate,
    admin_email: str = Depends(verify_admin)
):
    """Update tenant (admin)"""
    db = get_db()

    updates = []
    values = []

    if update.name is not None:
        updates.append("name = ?")
        values.append(update.name)
    if update.primary_color is not None:
        updates.append("settings = json_set(settings, '$.primary_color', ?)")
        values.append(update.primary_color)
    if update.secondary_color is not None:
        updates.append("settings = json_set(settings, '$.secondary_color', ?)")
        values.append(update.secondary_color)
    if update.greeting is not None:
        updates.append("settings = json_set(settings, '$.greeting', ?)")
        values.append(update.greeting)
    if update.bot_name is not None:
        updates.append("settings = json_set(settings, '$.bot_name', ?)")
        values.append(update.bot_name)
    if update.logo_url is not None:
        updates.append("settings = json_set(settings, '$.logo_url', ?)")
        values.append(update.logo_url)
    if update.show_branding is not None:
        updates.append("settings = json_set(settings, '$.show_branding', ?)")
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

    result = await db.execute("SELECT * FROM tenants WHERE id = ?", [tenant_id])
    t = dict(zip(result.columns, result.rows[0]))

    return TenantResponse(
        id=t['id'],
        slug=t['slug'],
        name=t['name'],
        domain=t.get('domain'),
        plan=t.get('plan', 'free'),
        settings=json.loads(t.get('settings', '{}')),
        business_hours=json.loads(t.get('business_hours', '{}')) if t.get('business_hours') else None,
        timezone=t.get('timezone', 'UTC'),
        slot_duration=t.get('slot_duration', 30),
        buffer_minutes=t.get('buffer_minutes', 15),
        created_at=t['created_at'],
        updated_at=t['updated_at']
    )


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    admin_email: str = Depends(verify_admin)
):
    """Soft delete tenant"""
    db = get_db()
    await db.execute(
        "UPDATE tenants SET plan = 'deleted', updated_at = ? WHERE id = ?",
        [int(datetime.now(timezone.utc).timestamp()), tenant_id]
    )
    return {"success": True}


@router.post("/tenants/{tenant_id}/impersonate")
async def impersonate_tenant(
    tenant_id: str,
    admin_email: str = Depends(verify_admin)
):
    """Generate impersonation token for tenant dashboard"""
    # In a real implementation, you'd create a short-lived token
    # For now, return the tenant slug for frontend to use
    db = get_db()
    result = await db.execute("SELECT slug FROM tenants WHERE id = ?", [tenant_id])
    if not result.rows:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return {"tenant_slug": result.rows[0][0]}


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_platform_analytics(
    admin_email: str = Depends(verify_admin)
):
    """Get platform-wide analytics"""
    db = get_db()

    # Total tenants
    total_tenants_result = await db.execute("SELECT COUNT(*) FROM tenants WHERE plan != 'deleted'")
    total_tenants = total_tenants_result.rows[0][0] if total_tenants_result.rows else 0

    # Active tenants (had activity in last 30 days)
    since = int((datetime.now(timezone.utc) - timedelta(days=30)).timestamp())
    active_result = await db.execute("""
        SELECT COUNT(DISTINCT tenant_id) FROM usage_logs WHERE created_at > ?
    """, [since])
    active_tenants = active_result.rows[0][0] if active_result.rows else 0

    # Total conversations
    conv_result = await db.execute("SELECT COUNT(*) FROM conversations")
    total_conversations = conv_result.rows[0][0] if conv_result.rows else 0

    # Total appointments
    appt_result = await db.execute("SELECT COUNT(*) FROM appointments")
    total_appointments = appt_result.rows[0][0] if appt_result.rows else 0

    # Total messages
    msg_result = await db.execute("SELECT COUNT(*) FROM messages")
    total_messages = msg_result.rows[0][0] if msg_result.rows else 0

    # Last 7 days
    since_7 = int((datetime.now(timezone.utc) - timedelta(days=7)).timestamp())
    msg_7_result = await db.execute("SELECT COUNT(*) FROM messages WHERE created_at > ?", [since_7])
    messages_7 = msg_7_result.rows[0][0] if msg_7_result.rows else 0

    appt_7_result = await db.execute("SELECT COUNT(*) FROM appointments WHERE created_at > ?", [since_7])
    appointments_7 = appt_7_result.rows[0][0] if appt_7_result.rows else 0

    # Top tenants by conversations
    top_result = await db.execute("""
        SELECT t.name, t.slug, COUNT(c.id) as conv_count
        FROM conversations c
        JOIN tenants t ON c.tenant_id = t.id
        GROUP BY t.id
        ORDER BY conv_count DESC
        LIMIT 10
    """)
    top_tenants = [
        {"name": row[0], "slug": row[1], "conversations": row[2]}
        for row in top_result.rows
    ]

    return AnalyticsResponse(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        total_conversations=total_conversations,
        total_appointments=total_appointments,
        total_messages=total_messages,
        messages_last_7_days=messages_7,
        appointments_last_7_days=appointments_7,
        top_tenants=top_tenants
    )


@router.get("/tenants/{tenant_id}/conversations")
async def get_tenant_conversations(
    tenant_id: str,
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    admin_email: str = Depends(verify_admin)
):
    """List conversations for a specific tenant (admin)"""
    db = get_db()
    result = await db.execute("""
        SELECT
            c.id,
            c.end_user_id,
            eu.email as end_user_email,
            c.status,
            c.created_at,
            c.updated_at,
            (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
            (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
        FROM conversations c
        LEFT JOIN end_users eu ON c.end_user_id = eu.id
        WHERE c.tenant_id = ?
        ORDER BY c.updated_at DESC
        LIMIT ? OFFSET ?
    """, [tenant_id, limit, offset])
    return [dict(zip(result.columns, row)) for row in result.rows]


@router.get("/tenants/{tenant_id}/appointments")
async def get_tenant_appointments(
    tenant_id: str,
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    admin_email: str = Depends(verify_admin)
):
    """List appointments for a specific tenant (admin)"""
    db = get_db()
    query = """
        SELECT a.*, eu.email as end_user_email, eu.name as end_user_name
        FROM appointments a
        LEFT JOIN end_users eu ON a.end_user_id = eu.id
        WHERE a.tenant_id = ?
    """
    params = [tenant_id]
    if status:
        query += " AND a.status = ?"
        params.append(status)
    query += " ORDER BY a.start_time DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    result = await db.execute(query, params)
    return [dict(zip(result.columns, row)) for row in result.rows]


@router.post("/tenants/{tenant_id}/knowledge")
async def upload_tenant_knowledge(
    tenant_id: str,
    file: UploadFile = File(...),
    source_id: str = Form(...),
    source_type: str = Form("pdf"),
    admin_email: str = Depends(verify_admin)
):
    """Upload a knowledge file for a tenant (admin)"""
    content = await file.read()

    if source_type == 'pdf':
        result = await knowledge_service.process_pdf(tenant_id, content, source_id)
    elif source_type in ['txt', 'md']:
        text = content.decode('utf-8')
        result = await knowledge_service.process_text(tenant_id, text, source_id, source_type)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    return {
        "source_id": source_id,
        "chunks_created": result['chunks_created'],
        "content_preview": f"Processed {result['chunks_created']} chunks"
    }


@router.post("/tenants/{tenant_id}/knowledge/text")
async def upload_tenant_knowledge_text(
    tenant_id: str,
    request: KnowledgeUploadRequest,
    admin_email: str = Depends(verify_admin)
):
    """Upload knowledge as text/FAQ for a tenant (admin)"""
    if request.source_type == 'faq':
        try:
            faq_items = json.loads(request.content)
            result = await knowledge_service.process_faq(tenant_id, faq_items, request.source_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid FAQ format")
    else:
        result = await knowledge_service.process_text(
            tenant_id, request.content, request.source_id, request.source_type
        )

    return {
        "source_id": request.source_id,
        "chunks_created": result['chunks_created'],
        "content_preview": f"Processed {result['chunks_created']} chunks"
    }


@router.delete("/tenants/{tenant_id}/knowledge/{source_id}")
async def delete_tenant_knowledge(
    tenant_id: str,
    source_id: str,
    admin_email: str = Depends(verify_admin)
):
    """Delete a knowledge source for a tenant (admin)"""
    deleted = await knowledge_service.delete_source(tenant_id, source_id)
    return {"deleted_chunks": deleted}


@router.get("/tenants/{tenant_id}/knowledge")
async def list_tenant_knowledge(
    tenant_id: str,
    admin_email: str = Depends(verify_admin)
):
    """List knowledge sources for a tenant (admin)"""
    sources = await knowledge_service.list_sources(tenant_id)
    return sources


@router.get("/usage")
async def get_usage_logs(
    tenant_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = Query(100, le=1000),
    admin_email: str = Depends(verify_admin)
):
    """Get usage logs"""
    db = get_db()

    where = []
    params = []

    if tenant_id:
        where.append("tenant_id = ?")
        params.append(tenant_id)
    if event_type:
        where.append("event_type = ?")
        params.append(event_type)

    where_sql = " AND ".join(where) if where else "1=1"
    params.append(limit)

    result = await db.execute(f"""
        SELECT * FROM usage_logs WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT ?
    """, params)

    return [dict(zip(result.columns, row)) for row in result.rows]