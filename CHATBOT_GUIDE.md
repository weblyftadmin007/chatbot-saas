# Build Your Own AI Chatbot Business
## A Simple Guide (No Coding Needed)

---

## What Is This?

You're building a **robot helper** that lives on websites. It:
- Chats with visitors
- Answers questions from your knowledge base
- (Roadmap) Books appointments + sends confirmation emails

**You sell this to businesses.** They pay you monthly. You manage everything from a dashboard.

---

## The Tools (All Free, No Credit Card)

| Tool | What It Does |
|------|--------------|
| **GitHub** | Stores your project files + auto-deploys |
| **Cloudflare** | Runs the AI backend (Worker, never sleeps) + serves the widget/dashboard (Pages) |
| **Google AI Studio** | The AI brain — Gemini API for chat + embeddings (was a free Hugging Face computer until HF made Docker Spaces paid in July 2026) |
| **Turso** | Database — stores all data (vector search built in) |
| **Clerk** | Login for your admin dashboard |
| **Google Apps Script** | Sends emails from your Gmail (Phase 2) |

---

## How It Works (Simple)

```
Visitor asks "What are your hours?"
         │
         ▼
Chat widget on their website
         │
         ▼
Cloudflare Worker (chatbot-api) receives it
         │
         ▼
Worker searches the client's knowledge base (Turso vectors)
         │
         ▼
Gemini (Google AI) writes the answer, streamed back word-by-word
```

---

## 4-Week Plan (2 Hours/Week)

> The detailed step-by-step (with exact clicks, secrets, and curl commands)
> lives in **SETUP.md** (accounts), **DEPLOY.md** (deploy + first client), and
> the three PDF guides. This page is the plain-English version.

### WEEK 1: Set Up Accounts & Deploy
**Day 1** - Create the free accounts:
- GitHub.com · Cloudflare.com (API token + account ID) · aistudio.google.com (Gemini API key) · Turso.tech (database + schema) · Clerk.com (keys) · Script.google.com (email, Phase 2)

**Day 2** - Get the code:
- Click "Use this template" on GitHub
- Go to Settings → Secrets → add the secrets (exact list in SETUP.md)

**Day 3** - Deploy the brain:
- Push to `main` → GitHub Actions deploys the Cloudflare Worker automatically
- Check `https://chatbot-api.<your-subdomain>.workers.dev/health` → "healthy"
- No 10-minute model downloads, no "keep alive" pings — Workers don't sleep

**Day 4** - Set up the database:
- `turso db shell chatbot-db < worker/db/schema.sql` (one command, safe to re-run)

**Day 5** - Test:
- Health URL shows healthy; tables exist in Turso

---

### WEEK 2: Teach the Brain
**Day 1** - Test chat works (curl command in DEPLOY.md §7)

**Day 2** - Create your first client + upload their knowledge (two curl commands, DEPLOY.md §5):
```bash
curl -X POST "$API/admin/tenants" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Weblyft Design","slug":"weblyft-design"}'
curl -X POST "$API/admin/tenants/TENANT_ID/knowledge/text" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source_id":"faq-1","source_type":"txt","content":"We open at 9am..."}'
```

**Day 3** - Upload their FAQ PDF:
- Convert the PDF to text first (`pdftotext faq.pdf -`), upload the text as above
- (In Phase 3 the admin dashboard does this for you in the browser)

**Day 4** - Test questions:
- "What are your hours?" → Answers from their knowledge

---

### WEEK 3: Appointments & Widget
**Day 1** - Set up email (Phase 2 — Apps Script code is in `gas-email/`)
**Day 2** - Test booking (Phase 2 — availability/booking are being ported to the Worker)
**Day 3** - Build widget:
- Cloudflare Pages → Connect GitHub → Deploy
- Get URL: `https://chatbot-widget.YOUR-SUBDOMAIN.pages.dev/widget.js`
**Day 4** - Install on client site (add `data-api-url` so the widget finds the Worker):
```html
<script src="https://chatbot-widget.YOUR-SUBDOMAIN.pages.dev/widget.js"
        data-tenant="weblyft-design"
        data-api-url="https://chatbot-api.<your-subdomain>.workers.dev"></script>
```

---

### WEEK 4: Your Dashboard
**Day 1** - Deploy admin dashboard to Cloudflare Pages (works today; its full feature set arrives with Phase 3)
**Day 2** - Login with Clerk → see your client
**Day 3** - Add new clients (Phase 3: dashboard buttons; today: the curl commands above)
**Day 4** - Set up monitoring (free uptime checks on the `/health` URL)
**Day 5** - Done! 🎉

---

## Adding a New Client (5 Minutes)

Today (Phase 1): two curl commands from DEPLOY.md §5 (create tenant, upload knowledge text), then send the client the two-line embed snippet.
Phase 3: the same from the admin dashboard (name → slug → color → drag-drop PDF → copy embed code).

---

## Commands Cheat Sheet

```bash
# Set once
API="https://chatbot-api.<your-subdomain>.workers.dev"
TOKEN="<your admin token (see DEPLOY.md §5)>"

# Health
curl "$API/health"

# Create a client
curl -X POST "$API/admin/tenants" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Client Name","slug":"client-slug"}'

# Upload their knowledge (text)
curl -X POST "$API/admin/tenants/TENANT_ID/knowledge/text" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source_id":"faq-1","source_type":"txt","content":"..."}'

# One-time database setup (safe to re-run)
turso db shell chatbot-db < worker/db/schema.sql

# (The old python scripts/ are legacy — being ported to the API in Phase 4)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Widget not showing | Check the script tag spelling + `data-tenant` exactly |
| Wrong AI answer | Re-upload the knowledge text with clearer info |
| No AI answer, "usage limit" message | Gemini free-tier daily cap — retry later, or check the model's quota in AI Studio |
| 404 on chat | `data-api-url` must point at the Worker, not the widget Pages URL |
| Knowledge not found | Schema loaded? (`worker/db/schema.sql`); source uploaded? (list: `GET /admin/tenants/<id>/knowledge`) |
| No emails | Phase 2 feature — check Gmail sent folder; limit 100/day |
| Client wants changes | Re-upload their knowledge / update settings → auto-live |

---

## Costs: $0

| Service | Free Limit | You'll Use |
|---------|------------|------------|
| Cloudflare Worker | 100k requests/day | Tiny |
| Gemini API | Free daily quota (varies — check AI Studio) | Small |
| Turso | 9GB, 1B reads/mo | ~100MB |
| Cloudflare Pages | Unlimited | Tiny |
| Clerk | 10k logins/mo | Just you |
| Gmail | 100 emails/day | ~15/day |

---

## Your Weekly Time

- **Week 1**: 2-3 hours (accounts + deploy)
- **Week 2**: 1 hour (upload knowledge, test)
- **Week 3**: 2 hours (widget + install)
- **Week 4**: 1 hour (dashboard + launch)
- **Total**: ~6 hours over 4 weeks

---

## What You Need From Me

1. **GitHub template repository** (all code ready)
2. **Exact secret names/values** for GitHub (SETUP.md)
3. **Step-by-step commands** for each day (DEPLOY.md + the PDF guides)
4. **Support** if something breaks

---

## Migration Status (what changed and why)

- **Before (2024–mid 2026):** backend ran as a Docker Space on Hugging Face with a local Ollama model.
- **July 2026:** Hugging Face made Docker/Gradio Spaces paid — only Static Spaces are free.
- **Now:** backend = Cloudflare Worker (`worker/`) calling the Gemini API; Turso database unchanged; widget/dashboard on Cloudflare Pages; all deploys via GitHub Actions.
- **Phases:** 1 Chat+RAG ✅ live · 2 Appointments+email · 3 Full admin dashboard · 4 Cleanup (details in `hf-docker-exit-spec.md` + the PDF guide appendixes).

---

## Glossary

- **Tenant** = Your client (business using chatbot)
- **Widget** = Floating chat button on their site
- **Worker** = The free Cloudflare program that runs your backend API
- **RAG** = The robot searches your knowledge base, then answers from what it found
- **Embedding** = A "meaning fingerprint" — 768 numbers per piece of text (Gemini makes them)
- **Deploy** = Push code so it goes live (GitHub does this automatically)
- **API** = How computers talk to each other
- **Slug** = Short name in URL (like `bobs-plumbing`)
- **data-api-url** = Extra attribute that tells the widget where the Worker lives
