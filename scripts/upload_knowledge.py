#!/usr/bin/env python3
"""Upload knowledge base for a tenant"""

import sys
import os
import argparse
import uuid
import fitz  # PyMuPDF

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.database import Database
from backend.app.config import settings
from backend.app.services.knowledge import knowledge_service


async def main():
    parser = argparse.ArgumentParser(description='Upload knowledge base for a tenant')
    parser.add_argument('--tenant', required=True, help='Tenant slug')
    parser.add_argument('--file', required=True, help='Path to PDF/TXT/MD file')
    parser.add_argument('--source-type', choices=['pdf', 'txt', 'md'], default='pdf')
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

    # Read file
    if not os.path.exists(args.file):
        print(f"Error: File '{args.file}' not found")
        sys.exit(1)

    with open(args.file, 'rb') as f:
        content = f.read()

    print(f"Processing {args.file} ({len(content)} bytes)...")

    # Process based on type
    source_id = os.path.basename(args.file).replace('.', '_')

    if args.source_type == 'pdf':
        result = await knowledge_service.process_pdf(tenant_id, content, source_id)
    elif args.source_type in ['txt', 'md']:
        text = content.decode('utf-8')
        result = await knowledge_service.process_text(tenant_id, text, source_id, args.source_type)

    print(f"Success! Created {result['chunks_created']} chunks from {result['total_chars']} characters")
    print(f"Source ID: {result['source_id']}")


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())