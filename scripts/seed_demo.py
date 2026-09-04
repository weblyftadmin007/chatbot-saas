#!/usr/bin/env python3
"""Create demo tenant with sample data"""

import sys
import os
import uuid
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.database import Database
from backend.app.config import settings


def main():
    # Initialize database
    db = Database()
    sync_db = db.sync_connect()

    tenant_slug = "demo"
    tenant_name = "Demo Business"

    # Check if demo tenant exists
    result = sync_db.execute("SELECT id FROM tenants WHERE slug = ?", [tenant_slug])
    if result.rows:
        print(f"Demo tenant already exists (ID: {result.rows[0][0]})")
        tenant_id = result.rows[0][0]
    else:
        # Create demo tenant
        tenant_id = str(uuid.uuid4())
        now = int(__import__('datetime').datetime.utcnow().timestamp())

        settings_dict = {
            "bot_name": "Demo Assistant",
            "greeting": "Welcome! I'm here to help you book appointments and answer questions.",
            "primary_color": "#3B82F6",
            "secondary_color": "#1E40AF",
            "show_branding": True
        }

        business_hours = {
            "monday": {"open": "09:00", "close": "17:00"},
            "tuesday": {"open": "09:00", "close": "17:00"},
            "wednesday": {"open": "09:00", "close": "17:00"},
            "thursday": {"open": "09:00", "close": "17:00"},
            "friday": {"open": "09:00", "close": "17:00"},
            "saturday": {"open": None, "close": None},
            "sunday": {"open": None, "close": None},
            "timezone": "UTC"
        }

        sync_db.execute("""
            INSERT INTO tenants (id, slug, name, plan, settings, business_hours, timezone, created_at, updated_at)
            VALUES (?, ?, ?, 'free', ?, ?, ?, ?, ?)
        """, [tenant_id, tenant_slug, tenant_name, json.dumps(settings_dict), json.dumps(business_hours), "UTC", now, now])

        print(f"Created demo tenant: {tenant_name} ({tenant_slug})")

    # Add sample FAQ knowledge
    sample_faq = [
        {"question": "What are your business hours?", "answer": "We're open Monday through Friday, 9 AM to 5 PM."},
        {"question": "How do I book an appointment?", "answer": "Just tell me what day and time you'd like, and I'll check availability and book it for you."},
        {"question": "Can I cancel or reschedule?", "answer": "Yes! Just let me know the date and time of your appointment, and I'll cancel it for you."},
        {"question": "Do you offer refunds?", "answer": "We offer a full refund if you cancel at least 24 hours before your appointment."},
        {"question": "What services do you offer?", "answer": "We offer consulting, design, and development services. Let me know what you need help with!"},
        {"question": "How can I contact you?", "answer": "You can reach us through this chat, or email us at hello@demo.com."}
    ]

    # Check if FAQ already exists
    result = sync_db.execute("SELECT id FROM knowledge_chunks WHERE tenant_id = ? AND source_id = 'demo-faq'", [tenant_id])
    if not result.rows:
        print("Adding sample FAQ knowledge...")
        from backend.app.services.knowledge import knowledge_service
        import asyncio

        async def add_faq():
            await knowledge_service.process_faq(tenant_id, sample_faq, 'demo-faq')
            print("Sample FAQ added!")

        asyncio.run(add_faq())
    else:
        print("Sample FAQ already exists")

    print(f"\nDemo tenant ready!")
    print(f"Widget embed code:")
    print(f'<script src="https://your-widget-domain.pages.dev/widget.js" data-tenant="demo"></script>')


if __name__ == '__main__':
    main()