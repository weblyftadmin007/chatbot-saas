#!/usr/bin/env python3
"""Test Google Apps Script email"""

import sys
import os
import argparse
import httpx

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.config import settings


async def main():
    parser = argparse.ArgumentParser(description='Test Google Apps Script email')
    parser.add_argument('--to', required=True, help='Recipient email')
    parser.add_argument('--url', help='GAS Web App URL (defaults to config)')
    args = parser.parse_args()

    gas_url = args.url or settings.gas_webapp_url

    if not gas_url:
        print("Error: GAS_WEBAPP_URL not configured")
        sys.exit(1)

    print(f"Testing email to {args.to} via {gas_url}")

    test_html = """
    <!DOCTYPE html>
    <html>
    <body style="font-family: sans-serif; padding: 20px;">
        <h1 style="color: #3B82F6;">Test Email</h1>
        <p>This is a test email from your chatbot system.</p>
        <p>If you receive this, the Google Apps Script integration is working!</p>
        <hr>
        <p style="color: #64748B; font-size: 12px;">Sent via Gmail API</p>
    </body>
    </html>
    """

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                gas_url,
                json={
                    "to": args.to,
                    "subject": "Chatbot Test Email",
                    "html": test_html
                }
            )

        result = response.json()
        if result.get('success'):
            print("✓ Email sent successfully!")
        else:
            print(f"✗ Email failed: {result.get('error', 'Unknown error')}")
            sys.exit(1)

    except Exception as e:
        print(f"✗ Request failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())