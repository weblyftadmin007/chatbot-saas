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
  -d '{"name":"Weblyft Design","slug":"weblyft-design","greeting":"Hi! How can I help?","bot_name":"Weblyft Assistant","primary_color":"#0EA5E9"}'
# → 201 with the tenant object; note the "id" (TENANT_ID)
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

## 6. Embed on the client site

```html
<script src="https://chatbot-widget.pages.dev/widget.js"
        data-tenant="weblyft-design"
        data-api-url="$API"></script>
```

> Removed vs. the old doc: HF Space terminal, `python scripts/*.py`,
> Ollama. The legacy `scripts/` still talk to the database directly and are
> only useful with the old local backend — they are ported to the Worker API
> in Phase 4.
