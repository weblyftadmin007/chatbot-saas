# Deployment Guide — $0 Cloudflare Stack

The chatbot now deploys entirely on **Cloudflare** at $0/month (no card):

1. **Cloudflare Worker (`chatbot-api`)** — backend: widget chat (SSE) + RAG + admin-lite ingest (`worker/`)
2. **Cloudflare Pages (`chatbot-widget`)** — embeddable widget SDK (static)
3. **Cloudflare Pages (`chatbot-admin`)** — admin dashboard (static, Clerk auth)

All deploys are automated with GitHub Actions on push to `main`.

---

## 0. Where we are in the plan (phases in detail)

The migration from the old Hugging Face Docker backend is tracked in
[`hf-docker-exit-spec.md`](hf-docker-exit-spec.md). The PDF guides
(`guide-30-day.html/pdf`, `guide-deep-dive.html/pdf`, `guide-practical.html/pdf`)
contain the full roadmap; here is the summary:

**Phase 1 — Chat + RAG live (this build)**
- Cloudflare Worker backend: `GET /health`, `GET /widget/config/:slug`,
  `POST /widget/chat/:slug` (SSE stream), `GET /widget/history/:slug`.
- RAG pipeline: knowledge chunks → Gemini `gemini-embedding-001` @768-dim →
  Turso `knowledge_chunks` (float32 BLOBs, ranked by cosine in the Worker) → Gemini Flash answer.
- Admin-lite ingest (Clerk JWT **or** bootstrap token): create tenant, upload
  text/markdown/FAQ knowledge, list/delete sources. No PDF upload (text is
  extracted in the browser/CLI — spec §5.6).
- Widget SDK gains an optional `data-api-url` attribute pointing at the Worker.
- Graceful handling of free-tier limits (429s → friendly messages, in-memory
  self-throttle) — spec §5.7.

**Phase 2 — Appointments + email**
- Port `availability`, `book_appointment`, cancel flows and business-hours
  parsing into the Worker; wire Google Apps Script email confirmations
  (`gas-email/`); `email_pending` retry UX on Gmail quota.

**Phase 3 — Full admin dashboard APIs**
- `/admin/*` + `/api/*`: tenant CRUD, analytics, conversations, appointments,
  usage, impersonate; PDF upload (browser-side `pdfjs-dist` extraction);
  Clerk-only auth (drop the bootstrap token); wire the admin dashboard to
  `VITE_API_URL`.

**Phase 4 — Cleanup**
- Rewrite remaining docs/guides, port `scripts/` to HTTP calls against the
  Worker, delete `backend/` once parity is confirmed.

---

## 1. Prerequisites & secrets

Create the free accounts (details + exact screens in `SETUP.md`):
GitHub, Cloudflare, Google AI Studio, Turso, Clerk, Google Apps Script.

GitHub repository secrets (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Deploys Worker + Pages (edit perms on Cloudflare Workers/Pages) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account id |
| `TURSO_DATABASE_URL` | `libsql://your-db.turso.io` |
| `TURSO_AUTH_TOKEN` | Turso database token |
| `GEMINI_API_KEY` | Google AI Studio (free tier) |
| `CLERK_PUBLISHABLE_KEY` | Clerk `pk_test_...` (JWKS + admin-dashboard) |
| `ADMIN_EMAILS` | Comma-separated emails allowed on `/admin/*` (must match your Clerk user) |
| `ADMIN_BOOTSTRAP_TOKEN` | *Optional* — see §5 (delete it in Phase 3) |
| (Phase 2) `GAS_WEBAPP_URL` | Google Apps Script web app URL (email) |
| (Phase 4) `CLERK_SECRET_KEY` | Not required by the Worker yet |

## 2. Create the Turso database + schema

The Worker talks to Turso over HTTP. Embeddings are stored as float32 BLOBs in
`knowledge_chunks` and ranked by cosine similarity inside the Worker — Turso's
hosted database does **not** ship the sqlite-vec extension (`CREATE VIRTUAL TABLE
... USING vec0` fails with `no such module: vec0`), so the schema has **7 tables**,
not 8.

```bash
turso db create chatbot-db
turso db shell chatbot-db < worker/db/schema.sql   # idempotent — safe to re-run
```

Copy the connection URL + token from `turso db show chatbot-db` into the
GitHub secrets above. (The schema is the same one the old backend used —
`worker/db/schema.sql` mirrors `backend/migrations/versions/001_initial_schema.sql`.)

## 3. Deploy the Worker (`chatbot-api`)

Push to `main` (or run the workflow manually): **GitHub Actions →
"Deploy Chatbot API Worker to Cloudflare"**. It typechecks, runs
`wrangler deploy`, then writes the Worker secrets from your GitHub secrets.

Manual alternative (from `worker/`):

```bash
npm install
npx wrangler login
npx wrangler deploy
echo "$TURSO_DATABASE_URL" | npx wrangler secret put TURSO_DATABASE_URL
# ... same for TURSO_AUTH_TOKEN, GEMINI_API_KEY, CLERK_PUBLISHABLE_KEY, ADMIN_EMAILS
```

Verify: `curl https://chatbot-api.<your-subdomain>.workers.dev/health`
→ `{"status":"healthy","version":"1.0.0",...}`

> `wrangler whoami` shows your subdomain (the part before `workers.dev`).

## 4. Deploy the static sites (Cloudflare Pages, once each)

Both are one-time "Connect to Git" setups; afterwards pushes to `main`
auto-deploy via the existing workflows.

**Widget → `chatbot-widget`**
- Build command: `cd widget && npm run build`
- Output directory: `widget/dist`
- Widget JS: `https://chatbot-widget.YOUR-SUBDOMAIN.pages.dev/widget.js`

**Admin → `chatbot-admin`**
- Build command: `cd admin-dashboard && npm run build`
- Output directory: `admin-dashboard/dist`
- Environment variables (Pages → Settings → Environment variables):
  - `VITE_CLERK_PUBLISHABLE_KEY` = your `pk_test_...` (required for sign-in)
  - `VITE_API_URL` = the Worker origin (e.g. `https://chatbot-api.<subdomain>.workers.dev`)
    — needed from Phase 3 on; add it now to be ready.
- Add the Pages domain to Clerk → Domains (allowed redirect origin).

## 5. Onboard the first tenant + knowledge

The Worker's `/admin/*` endpoints accept either a Clerk session JWT (from an
email in `ADMIN_EMAILS`) or — until the admin dashboard is wired up — the
`ADMIN_BOOTSTRAP_TOKEN` you set as a GitHub/Worker secret.

1. Set `ADMIN_BOOTSTRAP_TOKEN` to a long random string (GitHub secret, then
   re-run the deploy workflow, or `wrangler secret put`).
2. Create a tenant:
   ```bash
   TOKEN="<your bootstrap token>"
   API="https://chatbot-api.<your-subdomain>.workers.dev"
   curl -X POST "$API/admin/tenants" -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"Weblyft Design","slug":"weblyft-design","greeting":"Hi! How can I help?","primary_color":"#0EA5E9"}'
   ```
3. Upload knowledge (text):
   ```bash
   TENANT_ID="<id from the response>"
   curl -X POST "$API/admin/tenants/$TENANT_ID/knowledge/text" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"source_id":"faq-1","source_type":"txt","content":"We are open Mon-Fri 9am-5pm. We offer web design and SEO. Contact hello@weblyft.design for a quote."}'
   ```
   FAQ format: `source_type: "faq"`, `content` = JSON array of `{"question","answer"}`.
   Re-uploading the same `source_id` replaces the source (idempotent).
4. Remove the bootstrap token once Clerk sign-in works: delete the GitHub
   secret and run `npx wrangler secret delete ADMIN_BOOTSTRAP_TOKEN`.

## 6. Embed the widget on a client site

```html
<script src="https://chatbot-widget.YOUR-SUBDOMAIN.pages.dev/widget.js"
        data-tenant="weblyft-design"
        data-api-url="https://chatbot-api.<your-subdomain>.workers.dev"></script>
```

`data-api-url` is optional — omit it when the widget is served from a host
that proxies `/widget/*` to the backend (same-origin mode).

## 7. Verify everything works

- [ ] `curl https://chatbot-api.<subdomain>.workers.dev/health` → healthy
- [ ] `curl https://chatbot-api.<subdomain>.workers.dev/widget/config/weblyft-design` → tenant config JSON
- [ ] Chat streams:
  ```bash
  curl -N -X POST "$API/widget/chat/weblyft-design" -H "Content-Type: application/json" \
    -d '{"message":"What are your hours?"}'
  ```
  → SSE frames ending in `{"type":"done",...}`
- [ ] Widget loads on a test page → floating button appears → answers from knowledge
- [ ] Conversation history survives a reload (same browser session)

### Common issues

**"I'm at my usage limit" / 429 messages** — Gemini free-tier daily cap hit;
try again later or check the model's free RPD in AI Studio (limits change —
see spec §5.7). Embeddings quota errors during upload return HTTP 429
`{code:"embed_quota"}`.

**Widget loads but chat 404s** — check `data-api-url` points at the Worker,
not the Pages origin, and the tenant slug matches exactly.

**Vector search returns nothing** — confirm `worker/db/schema.sql` ran on the
Turso DB and chunks were embedded (list sources:
`GET /admin/tenants/<id>/knowledge`).

**Missing secrets on deploy** — re-run the workflow; the "Set Worker secrets"
step logs `wrangler secret put` for each.

## 8. Local development

```bash
cd worker && npm install
# Copy your env values into a .dev.vars file (wrangler auto-loads it):
#   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... GEMINI_API_KEY=...
#   CLERK_PUBLISHABLE_KEY=... ADMIN_EMAILS=you@example.com ADMIN_BOOTSTRAP_TOKEN=...
npx wrangler dev
```

Widget/admin: `npm install && npm run dev` (set `VITE_CLERK_PUBLISHABLE_KEY`
and `VITE_API_URL=http://localhost:8787` in a local `.env` for the admin).

## 9. Scaling beyond the free tier (no code changes needed)

| Resource | Free | Paid option |
|---|---|---|
| Workers requests/CPU | 100k/day, 10 ms CPU | Workers Paid ($5/mo) |
| Gemini | Volatile free quotas | Add billing in AI Studio (higher tiers) |
| Turso | 9GB / 1B reads | Turso Scale |
| Clerk | 10k MAU | Clerk paid |
| Gmail | 100/day | Google Workspace |

## 10. Rollback

- Worker: `npx wrangler rollback` (previous deployment) or revert the commit and push.
- Pages: GitHub Actions → previous successful run → "Re-run".
