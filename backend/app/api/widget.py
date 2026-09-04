from fastapi import APIRouter, Request, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any
import json
import uuid
from datetime import datetime, timezone

from app.schemas import (
    WidgetConfigResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    AvailabilityRequest,
    SlotResponse,
    BookAppointmentRequest,
    BookAppointmentResponse,
    HealthResponse
)
from app.services.llm import llm_service
from app.services.rag import rag_service
from app.services.appointments import intent_service, appointment_service
from app.services.email import email_service
from app.services.knowledge import knowledge_service
from app.database import get_db


router = APIRouter(prefix="/widget", tags=["widget"])


@router.get("/config/{tenant_slug}", response_model=WidgetConfigResponse)
async def get_widget_config(tenant_slug: str):
    """Get widget configuration for a tenant"""
    db = get_db()
    result = await db.execute(
        "SELECT * FROM tenants WHERE slug = ? AND plan != 'deleted'",
        [tenant_slug]
    )

    if not result.rows:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant = dict(zip(result.columns, result.rows[0]))
    settings = tenant.get('settings', '{}')

    import json
    try:
        settings_dict = json.loads(settings)
    except Exception:
        settings_dict = {}

    business_hours = tenant.get('business_hours')
    if business_hours:
        try:
            business_hours = json.loads(business_hours)
        except Exception:
            business_hours = None

    return WidgetConfigResponse(
        tenant_slug=tenant['slug'],
        tenant_name=tenant['name'],
        bot_name=settings_dict.get('bot_name', 'Assistant'),
        greeting=settings_dict.get('greeting', 'Hi! How can I help you today?'),
        primary_color=settings_dict.get('primary_color', '#3B82F6'),
        secondary_color=settings_dict.get('secondary_color', '#1E40AF'),
        logo_url=settings_dict.get('logo_url'),
        show_branding=settings_dict.get('show_branding', True),
        business_hours=business_hours
    )


@router.post("/chat/{tenant_slug}")
async def chat_widget(
    tenant_slug: str,
    request: ChatMessageRequest,
    req: Request
):
    """Handle chat message with streaming response"""
    db = get_db()

    # Get tenant
    tenant_result = await db.execute(
        "SELECT * FROM tenants WHERE slug = ? AND plan != 'deleted'",
        [tenant_slug]
    )
    if not tenant_result.rows:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant = dict(zip(tenant_result.columns, tenant_result.rows[0]))
    tenant_id = tenant['id']

    # Get or create conversation
    conversation_id = request.conversation_id
    if not conversation_id:
        conversation_id = str(uuid.uuid4())
        now = int(datetime.now(timezone.utc).timestamp())
        await db.execute("""
            INSERT INTO conversations (id, tenant_id, status, created_at, updated_at)
            VALUES (?, ?, 'active', ?, ?)
        """, [conversation_id, tenant_id, now, now])

    # Save user message
    user_msg_id = str(uuid.uuid4())
    now = int(datetime.now(timezone.utc).timestamp())
    await db.execute("""
        INSERT INTO messages (id, conversation_id, role, content, created_at)
        VALUES (?, ?, 'user', ?, ?)
    """, [user_msg_id, conversation_id, request.message, now])

    # Classify intent
    intent = await intent_service.classify(request.message)

    # Log usage
    await db.execute("""
        INSERT INTO usage_logs (id, tenant_id, event_type, metadata, created_at)
        VALUES (?, ?, 'message', ?, ?)
    """, [str(uuid.uuid4()), tenant_id, json.dumps({'intent': intent}), now])

    async def generate_response():
        response_parts = []
        full_response = ""

        if intent == 'general_query':
            # RAG search
            chunks = await rag_service.search(tenant_id, request.message)
            context = [c['content'] for c in chunks]

            if context:
                async for chunk in llm_service.synthesize_answer(request.message, context):
                    response_parts.append(chunk)
                    full_response += chunk
                    yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
            else:
                # No knowledge found
                no_info = "I don't have that information in my knowledge base. Would you like me to help you with something else?"
                response_parts.append(no_info)
                full_response += no_info
                yield f"data: {json.dumps({'type': 'content', 'content': no_info})}\n\n"

        elif intent == 'book_appointment':
            # Extract booking details
            details = await intent_service.extract_booking_details(request.message)

            if details.get('preferred_date') and details.get('preferred_time'):
                # Try to book specific time
                tz = tenant.get('timezone', 'UTC')
                try:
                    import pytz
                    tz_obj = pytz.timezone(tz)
                    dt_str = f"{details['preferred_date']} {details['preferred_time']}"
                    naive_dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
                    localized = tz_obj.localize(naive_dt)
                    start_ts = int(localized.timestamp())
                    duration = details.get('duration_minutes', 30)
                    end_ts = start_ts + duration * 60

                    # Check availability
                    slots = await appointment_service.get_availability(
                        tenant_id, details['preferred_date'], details['preferred_date'], tz
                    )

                    slot_available = any(
                        s['start_time'] == start_ts and s['available']
                        for s in slots
                    )

                    if slot_available:
                        # Book it
                        appointment = await appointment_service.book_appointment(
                            tenant_id=tenant_id,
                            conversation_id=conversation_id,
                            end_user_id=None,  # No end-user row exists yet in chat flow
                            start_time=start_ts,
                            end_time=end_ts,
                            title=details.get('title'),
                            notes=details.get('notes')
                        )

                        # TODO: collect the customer's email in the chat flow before
                        # sending a confirmation. For now we only notify the business
                        # if a notification_email is configured for the tenant.
                        settings_dict = json.loads(tenant.get('settings', '{}'))
                        business_email = settings_dict.get('notification_email')
                        if business_email:
                            await email_service.send_business_notification(
                                to_email=business_email,
                                appointment=appointment,
                                customer_name='Chat visitor',
                                customer_email='not provided',
                                tenant_name=tenant['name']
                            )

                        msg = f"Great! I've booked your appointment for {details['preferred_date']} at {details['preferred_time']}. You'll receive a confirmation email shortly."
                        response_parts.append(msg)
                        full_response += msg
                        yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"
                    else:
                        msg = "That time slot is no longer available. Let me show you available slots."
                        response_parts.append(msg)
                        full_response += msg
                        yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"
                        yield f"data: {json.dumps({'type': 'slots', 'slots': slots})}\n\n"
                except Exception as e:
                    msg = f"I had trouble booking that time. Let me show you available slots instead."
                    response_parts.append(msg)
                    full_response += msg
                    yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"

            else:
                # Ask for preferred date/time or show availability
                msg = "I'd be happy to help you book an appointment! What date and time would you prefer?"
                response_parts.append(msg)
                full_response += msg
                yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"

        elif intent == 'check_availability':
            # Extract date range
            details = await intent_service.extract_booking_details(request.message)

            if details.get('preferred_date'):
                start_date = details['preferred_date']
                end_date = details['preferred_date']
            else:
                # Default to next 7 days
                from datetime import date, timedelta
                start_date = date.today().isoformat()
                end_date = (date.today() + timedelta(days=7)).isoformat()

            tz = tenant.get('timezone', 'UTC')
            slots = await appointment_service.get_availability(tenant_id, start_date, end_date, tz)

            if slots:
                msg = f"Here are available slots for {start_date} to {end_date}:"
                response_parts.append(msg)
                full_response += msg
                yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"
                yield f"data: {json.dumps({'type': 'slots', 'slots': slots})}\n\n"
            else:
                msg = "No available slots found for that period."
                response_parts.append(msg)
                full_response += msg
                yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"

        elif intent == 'cancel_appointment':
            # Try to actually cancel: extract the booking email (and optional date)
            details = await intent_service.extract_cancel_details(request.message)
            email = (details.get('email') or '').strip().lower()
            cancelled = 0
            if email:
                users = await db.execute(
                    "SELECT id FROM end_users WHERE tenant_id = ? AND LOWER(email) = ?",
                    [tenant_id, email]
                )
                user_ids = [row[0] for row in users.rows]
                if user_ids:
                    start_ts = end_ts = None
                    if details.get('date'):
                        try:
                            import pytz
                            tz_obj = pytz.timezone(tenant.get('timezone', 'UTC'))
                            day_start = tz_obj.localize(
                                datetime.strptime(details['date'], "%Y-%m-%d")
                            )
                            start_ts = int(day_start.timestamp())
                            end_ts = start_ts + 86400
                        except Exception:
                            start_ts = end_ts = None
                    cancelled = await appointment_service.cancel_appointments(
                        tenant_id, user_ids, start_time=start_ts, end_time=end_ts
                    )

            if cancelled:
                msg = f"I've cancelled {cancelled} appointment{'s' if cancelled != 1 else ''} for you. Is there anything else I can help with?"
            elif email:
                msg = "I couldn't find any upcoming appointments for that email. If you booked with a different email, let me know — or tell me the date of the appointment."
            else:
                msg = "To cancel an appointment, I'll need the email you booked with (and optionally the date). Could you provide that?"
            response_parts.append(msg)
            full_response += msg
            yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"

        elif intent == 'transfer_human':
            msg = "I'll make sure someone from the team reaches out to you shortly. Is there anything else I can help with in the meantime?"
            response_parts.append(msg)
            full_response += msg
            yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"

        else:  # unclear
            msg = "I'm not sure I understand. Could you rephrase that? I can help with booking appointments, answering questions, or checking availability."
            response_parts.append(msg)
            full_response += msg
            yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"

        # Save assistant response
        assistant_msg_id = str(uuid.uuid4())
        await db.execute("""
            INSERT INTO messages (id, conversation_id, role, content, intent, created_at)
            VALUES (?, ?, 'assistant', ?, ?, ?)
        """, [assistant_msg_id, conversation_id, full_response, intent, now])

        # Update conversation timestamp
        await db.execute("""
            UPDATE conversations SET updated_at = ? WHERE id = ?
        """, [now, conversation_id])

        # Send completion signal
        yield f"data: {json.dumps({'type': 'done', 'conversation_id': conversation_id, 'intent': intent})}\n\n"

    return StreamingResponse(
        generate_response(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/availability/{tenant_slug}")
async def get_availability(
    tenant_slug: str,
    start_date: str = Query(...),
    end_date: str = Query(...),
    timezone: str = Query("UTC")
):
    """Get available slots for date range"""
    db = get_db()
    result = await db.execute("SELECT id FROM tenants WHERE slug = ?", [tenant_slug])
    if not result.rows:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant_id = result.rows[0][0]
    slots = await appointment_service.get_availability(tenant_id, start_date, end_date, timezone)

    return {"slots": slots}


@router.post("/appointments/{tenant_slug}", response_model=BookAppointmentResponse)
async def book_appointment(
    tenant_slug: str,
    request: BookAppointmentRequest
):
    """Book an appointment"""
    db = get_db()
    result = await db.execute("SELECT * FROM tenants WHERE slug = ?", [tenant_slug])
    if not result.rows:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant = dict(zip(result.columns, result.rows[0]))
    tenant_id = tenant['id']

    # Find or create end user (dedupe by email within the tenant)
    now = int(datetime.now(timezone.utc).timestamp())
    user_result = await db.execute(
        "SELECT id FROM end_users WHERE tenant_id = ? AND email = ? LIMIT 1",
        [tenant_id, request.email]
    )
    if user_result.rows:
        end_user_id = user_result.rows[0][0]
    else:
        end_user_id = str(uuid.uuid4())
        await db.execute("""
            INSERT INTO end_users (id, tenant_id, email, name, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, [end_user_id, tenant_id, request.email, request.name or '', now])

    # Create conversation
    conversation_id = str(uuid.uuid4())
    await db.execute("""
        INSERT INTO conversations (id, tenant_id, end_user_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?)
    """, [conversation_id, tenant_id, end_user_id, now, now])

    # Book appointment
    appointment = await appointment_service.book_appointment(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        end_user_id=end_user_id,
        start_time=request.start_time,
        end_time=request.end_time,
        title=request.title,
        notes=request.notes
    )

    # Send confirmation emails
    await email_service.send_appointment_confirmation(
        to_email=request.email,
        to_name=request.name or 'Customer',
        appointment=appointment,
        tenant_name=tenant['name'],
        tenant_settings=tenant
    )

    # Also notify business (if email in settings)
    settings_dict = json.loads(tenant.get('settings', '{}'))
    business_email = settings_dict.get('notification_email')
    if business_email:
        await email_service.send_business_notification(
            to_email=business_email,
            appointment=appointment,
            customer_name=request.name or 'Customer',
            customer_email=request.email,
            tenant_name=tenant['name']
        )

    return BookAppointmentResponse(
        appointment_id=appointment['id'],
        status=appointment['status'],
        start_time=appointment['start_time'],
        end_time=appointment['end_time'],
        confirmation_message="Appointment booked successfully!"
    )


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        timestamp=int(datetime.now(timezone.utc).timestamp())
    )


@router.get("/history/{tenant_slug}")
async def get_history(
    tenant_slug: str,
    conversation_id: str = Query(...)
):
    """Get message history for a conversation"""
    db = get_db()

    # Verify the conversation belongs to the tenant
    conv_result = await db.execute("""
        SELECT c.id FROM conversations c
        JOIN tenants t ON c.tenant_id = t.id
        WHERE c.id = ? AND t.slug = ? AND t.plan != 'deleted'
    """, [conversation_id, tenant_slug])
    if not conv_result.rows:
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute("""
        SELECT id, role, content, intent, created_at
        FROM messages WHERE conversation_id = ?
        ORDER BY created_at
    """, [conversation_id])

    return {
        "conversation_id": conversation_id,
        "messages": [dict(zip(result.columns, row)) for row in result.rows]
    }