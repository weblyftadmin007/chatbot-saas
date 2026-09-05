# Manual Onboarding (via the Worker API)

Phase 1 onboarding is done with a few `curl` calls against the Cloudflare
Worker. Auth: `Authorization: Bearer <ADMIN_BOOTSTRAP_TOKEN>` — set the
bootstrap token first (DEPLOY.md §5), or use a Clerk session JWT once your
email is in `ADMIN_EMAILS`.

Prereqs: Worker deployed (`$API`), Turso schema loaded, one embedding quota
available in AI Studio.

```bash
API="https://chatbot-api.<your-subdomain>.workers.dev"
TOKEN="<your admin token>"
```

## 1. Health

```bash
curl "$API/health"
```

## 2. Create a tenant

```bash
curl -X POST "$API/admin/tenants" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Weblyft Design","slug":"weblyft-design","greeting":"Hi! How can I help?","bot_name":"Weblyft Assistant","primary_color":"#0EA5E9","gas_url":"https://script.google.com/macros/s/.../exec","notification_email":"bookings@weblyft.com","spreadsheet_id":"1AbC123...","quick_replies":["What are your hours?","How do I get in touch?"]}'
# → 201 with the tenant object; note the "id" (TENANT_ID)
```

`gas_url`, `notification_email`, `spreadsheet_id`, and `quick_replies` are
optional per-tenant settings (bookings and GAS integration). You can also set
them later via the admin dashboard → Tenant → Settings → "Notifications &
Integrations", or PATCH just the settings:

```bash
curl -X PATCH "$API/admin/tenants/$TENANT_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"settings":{"gas_url":"https://script.google.com/macros/s/.../exec","notification_email":"bookings@weblyft.com","spreadsheet_id":"1AbC123...","quick_replies":["What are your hours?"]}}'
```

For bookings to work, also set business hours and slot config:

```bash
curl -X PATCH "$API/admin/tenants/$TENANT_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"timezone":"Asia/Kolkata","slot_duration":30,"buffer_minutes":15,"business_hours":{"monday":{"open":"09:00","close":"18:00"},"tuesday":{"open":"09:00","close":"18:00"},"wednesday":{"open":"09:00","close":"18:00"},"thursday":{"open":"09:00","close":"18:00"},"friday":{"open":"09:00","close":"18:00"}}}'
```

## 3. Upload knowledge

Plain text:

```bash
TENANT_ID="<tenant id>"
curl -X POST "$API/admin/tenants/$TENANT_ID/knowledge/text" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source_id":"faq-1","source_type":"txt","content":"..."}'
```

FAQ format (Q&A pairs are chunked individually):

```bash
curl -X POST "$API/admin/tenants/$TENANT_ID/knowledge/text" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source_id":"faq-1","source_type":"faq","content":"[{\"question\":\"What are your hours?\",\"answer\":\"Mon-Fri 9am-5pm\"}]"}'
```

Re-uploading the same `source_id` replaces the source. PDFs: extract the text
on your machine (e.g. `pdftotext file.pdf -`) and upload it as `txt` —
the Worker does not parse PDFs (spec §5.6).

## 4. List / delete knowledge

```bash
curl "$API/admin/tenants/$TENANT_ID/knowledge" -H "Authorization: Bearer $TOKEN"
curl -X DELETE "$API/admin/tenants/$TENANT_ID/knowledge/faq-1" -H "Authorization: Bearer $TOKEN"
```

## 5. Test the widget endpoint (no auth needed)

```bash
curl "$API/widget/config/weblyft-design"
curl -N -X POST "$API/widget/chat/weblyft-design" -H "Content-Type: application/json" \
  -d '{"message":"What are your hours?"}'
```

## 7. Booking notifications (per tenant)

Each tenant's Google Apps Script web app handles customer/business emails and
the appointments Google Sheet. Steps per tenant:

1. In the tenant's Google account: script.google.com → New Project → paste
   `gas-email/Code.gs` → set `TEST_RECIPIENT` → Deploy → Web App
   (Execute as "Me", access "Anyone") → copy the `/exec` URL.
2. Run `testEmail()` once (authorizes Gmail); optional `testBooking()` verifies
   the full customer + business + sheet-row flow.
3. Paste the URL, the business notification email, and the appointments Google
   Sheet ID into the admin dashboard → Tenant → Settings → "Notifications &
   Integrations", or PATCH `settings` as above (steps 2–3).

Booking is saved regardless of GAS availability: if the `/exec` URL is missing
or fails, the Worker logs it and the visitor still gets a confirmation in chat.

## 8. Embed on the client site

```html
<script src="https://chatbot-widget.YOUR-SUBDOMAIN.pages.dev/widget.js"
        data-tenant="weblyft-design"
        data-api-url="$API"></script>
```

> Removed vs. the old doc: HF Space terminal, `python scripts/*.py`,
> Ollama. The legacy `scripts/` still talk to the database directly and are
> only useful with the old local backend — they are ported to the Worker API
> in Phase 4.
