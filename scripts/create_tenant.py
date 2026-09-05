#!/usr/bin/env python3
"""Create a new tenant"""

import sys
import os
import argparse
import uuid
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.database import Database
from backend.app.config import settings


def main():
    parser = argparse.ArgumentParser(description='Create a new tenant')
    parser.add_argument('--name', required=True, help='Business name')
    parser.add_argument('--slug', required=True, help='URL-friendly slug (lowercase, hyphens)')
    parser.add_argument('--color', default='#3B82F6', help='Primary color (hex)')
    parser.add_argument('--greeting', default='Hi! How can I help you today?', help='Welcome message')
    parser.add_argument('--bot-name', default='Assistant', help='Chatbot display name')
    parser.add_argument('--gas-url', default='', help="Tenant's Google Apps Script web app URL (/exec)")
    parser.add_argument('--notification-email', default='', help='Business email to notify on bookings')
    parser.add_argument('--spreadsheet-id', default='', help='Google Sheet ID for appointments')
    parser.add_argument('--quick-reply', action='append', default=[], help='Quick reply suggestion (repeatable)')
    args = parser.parse_args()

    # Validate slug
    import re
    if not re.match(r'^[a-z0-9-]+$', args.slug):
        print("Error: Slug must be lowercase letters, numbers, and hyphens only")
        sys.exit(1)

    # Initialize database
    db = Database()
    sync_db = db.sync_connect()

    # Check if slug exists
    result = sync_db.execute("SELECT id FROM tenants WHERE slug = ?", [args.slug])
    if result.rows:
        print(f"Error: Tenant with slug '{args.slug}' already exists")
        sys.exit(1)

    # Create tenant
    tenant_id = str(uuid.uuid4())
    now = int(__import__('datetime').datetime.utcnow().timestamp())

    settings_dict = {
        "bot_name": args.bot_name,
        "greeting": args.greeting,
        "primary_color": args.color,
        "secondary_color": "#1E40AF",
        "show_branding": True
    }
    if args.gas_url.strip():
        settings_dict["gas_url"] = args.gas_url.strip()
    if args.notification_email.strip():
        settings_dict["notification_email"] = args.notification_email.strip().lower()
    if args.spreadsheet_id.strip():
        settings_dict["spreadsheet_id"] = args.spreadsheet_id.strip()
    if args.quick_reply:
        settings_dict["quick_replies"] = [r.strip() for r in args.quick_reply if r.strip()]

    sync_db.execute("""
        INSERT INTO tenants (id, slug, name, plan, settings, created_at, updated_at)
        VALUES (?, ?, ?, 'free', ?, ?, ?)
    """, [tenant_id, args.slug, args.name, json.dumps(settings_dict), now, now])

    print(f"Tenant created successfully!")
    print(f"  ID: {tenant_id}")
    print(f"  Name: {args.name}")
    print(f"  Slug: {args.slug}")
    print(f"  Color: {args.color}")
    print(f"")
    print(f"Widget embed code:")
    print(f'<script src="https://your-widget-domain.pages.dev/widget.js" data-tenant="{args.slug}"></script>')


if __name__ == '__main__':
    main()