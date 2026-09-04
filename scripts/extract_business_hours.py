#!/usr/bin/env python3
"""Extract business hours from PDF for a tenant"""

import sys
import os
import argparse
import fitz  # PyMuPDF

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.database import Database
from backend.app.config import settings
from backend.app.services.knowledge import knowledge_service


async def main():
    parser = argparse.ArgumentParser(description='Extract business hours from PDF')
    parser.add_argument('--tenant', required=True, help='Tenant slug')
    parser.add_argument('--file', required=True, help='Path to PDF file')
    args = parser.parse_args()

    # Initialize database
    db = Database()
    sync_db = db.sync_connect()

    # Get tenant ID
    result = sync_db.execute("SELECT id FROM tenants WHERE slug = ?", [args.tenant])
    if not result.rows:
        print(f"Error: Tenant '{args.tenant}' not found")
        sys.exit(1)

    tenant_id = result.rows[0][0]
    print(f"Found tenant: {args.tenant} (ID: {tenant_id})")

    # Read PDF
    if not os.path.exists(args.file):
        print(f"Error: File '{args.file}' not found")
        sys.exit(1)

    doc = fitz.open(args.file)
    full_text = ""
    for page_num in range(len(doc)):
        page = doc[page_num]
        full_text += f"\n--- Page {page_num + 1} ---\n{page.get_text()}"
    doc.close()

    print(f"Extracted {len(full_text)} characters from PDF")
    print("Analyzing with AI...")

    # Extract business hours
    business_hours = await knowledge_service.extract_business_hours(full_text)

    if not business_hours:
        print("No business hours found in document")
        return

    print(f"Found business hours: {business_hours}")

    # Update tenant
    import json
    sync_db.execute("""
        UPDATE tenants SET business_hours = ?, updated_at = strftime('%s','now')
        WHERE id = ?
    """, [json.dumps(business_hours), tenant_id])

    print("Business hours saved to tenant!")


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())