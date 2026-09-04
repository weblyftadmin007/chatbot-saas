# Multi-Tenant AI Chatbot SaaS

Zero-cost, no-credit-card multi-tenant AI chatbot with RAG knowledge base and embeddable widget.

> **Status — Phase 1 (Chat + RAG) implemented.** The backend now runs on a
> **Cloudflare Worker** (`worker/`) instead of a Hugging Face Docker Space
> (HF removed the Docker-SDK free tier in July 2026 — see `hf-docker-exit-spec.md`).
> The old FastAPI code in `backend/` is kept as the reference implementation
> for the remaining phases.

## What works right now (Phase 1)

- ✅ Widget embed chat with **RAG answers from a per-tenant knowledge base**
- ✅ Admin-lite API to create tenants and upload knowledge (text/markdown/FAQ)
- ✅ Conversation + message history persisted to Turso
- ✅ Auto-deploy via GitHub Actions (Worker + both static sites)

Roadmap (details in `DEPLOY.md` §0 and the PDF guides):

| Phase | Scope | Status |
|---|---|---|
| 1 | Widget chat + RAG on Cloudflare Worker (Gemini), Turso, admin-lite ingest | **This build** |
| 2 | Appointments: availability, booking, GAS email confirmations | Next |
| 3 | Full admin dashboard APIs (CRUD, analytics, PDF upload, usage) + Clerk-only auth | Later |
| 4 | Docs/guides/scripts ported fully to the new stack; old HF/Docker remnants removed | Later |

## Architecture

```
┌─────────────────────────┐      ┌──────────────────────────────────────────────┐
│  Client site            │      │  Cloudflare (one account, all free tiers)    │
│  <script src="...widget  │─────▶│                                              │
│   .js" data-tenant=...   │      │  ┌────────────────────────────────────────┐  │
│   data-api-url="...">    │      │  │ Worker chatbot-api (worker/, TS)       │  │
└─────────────────────────┘      │  │  /widget/config · /widget/chat (SSE)   │  │
                                 │  │  /widget/history · /admin/* (ingest)    │  │
                                 │  └───────────────────┬─────────────────────┘  │
                                 │  Cloudflare Pages:   │                        │
                                 │  widget/  → widget.js│                        │
                                 │  admin-dashboard/    │                        │
                                 └──────────────────────┼────────────────────────┘
                                        ▼                ▼             ▼        ▼
                                   Turso (libSQL)   Gemini API    Google Apps  Clerk
                                   (schema: worker/  (chat+embed)  Script email  (auth,
                                   db/schema.sql)                  (Phase 2)    JWKS)
```

## Quick Start

1. **Create free accounts** (no card): GitHub, Cloudflare, Google AI Studio (Gemini API key), Turso, Clerk, Google Apps Script.
   Follow `SETUP.md` for exact steps and where each value goes.
2. **Create the Turso database and load the schema** (the Worker needs the tables to exist):
   ```bash
   turso db create chatbot-db
   turso db shell chatbot-db < worker/db/schema.sql
   ```
3. **Add GitHub secrets** (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `GEMINI_API_KEY`,
   `CLERK_PUBLISHABLE_KEY`, `ADMIN_EMAILS`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   optional `ADMIN_BOOTSTRAP_TOKEN`) — full list in `SETUP.md`.
4. **Push to main** → GitHub Actions deploys the Worker (`chatbot-api`) and sets its secrets.
5. **Deploy the static sites** once via Cloudflare Pages → Connect repo (see `DEPLOY.md` §3–4):
   - Widget: build `cd widget && npm run build`, output `widget/dist` → `chatbot-widget`
   - Admin: build `cd admin-dashboard && npm run build`, output `admin-dashboard/dist` → `chatbot-admin`
   - Set the Pages build env var `VITE_CLERK_PUBLISHABLE_KEY` on the admin project.
6. **Onboard your first tenant + knowledge** (`DEPLOY.md` §5), then embed on any site:
   ```html
   <script src="https://chatbot-widget.YOUR-SUBDOMAIN.pages.dev/widget.js"
           data-tenant="my-slug"
           data-api-url="https://chatbot-api.<your-subdomain>.workers.dev"></script>
   ```

## Project Structure

```
chatbot-saas/
├── worker/                  # ★ New backend: Cloudflare Worker (TypeScript)
│   ├── src/                 # config, db (Turso), llm (Gemini), rag, chat (SSE), clerk, admin
│   └── db/schema.sql        # Turso schema (idempotent; 7 tables, embeddings as float32 BLOBs)
├── backend/                 # Old FastAPI backend — KEPT as reference for porting
│   └── app/                 #   (routes/services match worker/ 1:1)
├── widget/                  # Embeddable React widget (Cloudflare Pages)
├── admin-dashboard/         # Admin UI, Clerk auth (Cloudflare Pages)
├── scripts/                 # Legacy CLI onboarding (direct DB + Ollama) — port pending (Phase 4)
├── gas-email/               # Google Apps Script email sender (Phase 2)
├── guide-*.html|pdf         # PDF guides (see DEPLOY.md §0 for the migration roadmap)
├── hf-docker-exit-spec.md   # The migration decision spec (what changed + why)
└── .github/workflows/       # deploy-worker.yml (new), deploy-widget.yml, deploy-admin.yml
```

## Costs: $0

| Service | Free tier |
|---|---|
| Cloudflare Workers | 100k requests/day (CPU-limited — see spec §5.6) |
| Cloudflare Pages | Unlimited static bandwidth (widget + admin) |
| Google Gemini API | Free chat + embeddings quota (volatile — verify in AI Studio) |
| Turso | 9GB, 1B reads/mo (vectors ranked in the Worker) |
| Clerk | 10k MAU |
| Gmail (GAS) | 100 emails/day |

## Notes

- **Why not Hugging Face?** Docker/Gradio Spaces now require PRO (July 2026); only Static Spaces are free. The old Docker-based deployment (`Dockerfile`, `supervisord.conf`, `nginx.conf`, `deploy-hf.yml`, `keep-alive.yml`) has been removed.
- **Free-tier limits are handled gracefully** (429s → friendly messages, Groq/Workers-AI failover hooks) — see `hf-docker-exit-spec.md` §5.7 and `worker/src/`.
- To regenerate the PDF guides: `make_guide_pdfs.cjs` on a machine with Chrome + puppeteer + PyPDF2 (see header comment in the file).

## License

MIT
