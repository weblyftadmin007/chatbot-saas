# Spec: Exit Hugging Face Docker Hosting → $0 Cloudflare Stack

**Status:** Draft — decision document, no code changes yet
**Date:** 2026-09-04
**Author:** Interview with project owner (via Codebuff)
**Scope:** Decide + plan how to deploy `chatbot-saas` (multi-tenant AI chatbot SaaS) entirely at **$0/month** now that Hugging Face Docker Spaces are paid-only.

---

## 1. Problem statement (in the owner's words)

> "The SDK as Docker in HF is paid and only static is free now — what to do?"

- The project's docs (README / DEPLOY / SETUP) were written when a **Hugging Face Docker Space** hosted the backend (FastAPI + Ollama) for free.
- Hugging Face changed the policy: Docker (and Gradio) Spaces on CPU-basic now require a **PRO subscription**; only **Static Spaces** remain free.
- **Nothing has been deployed yet** — the owner was blocked before/during first deployment.
- Hard constraint: **monthly cost must be $0** (no recurring fees; ideally no credit card anywhere).

---

## 2. Research findings (verified July–Sept 2026)

### 2.1 Hugging Face Spaces policy change
- ~July 8, 2026: HF started marking **Docker SDK Spaces as "Paid"**; CLI deploy returns: *"Static Spaces are free for everyone, but hosting Gradio and Docker Spaces on free cpu-basic requires a PRO subscription."*
- Existing Docker Spaces: restarts/redeploys/file edits now prompt for PRO or a billing method; behavior is inconsistent (some accounts grandfathered briefly, then blocked).
- Free accounts are effectively limited to **Static Spaces** (some received limited ZeroGPU Gradio slots, but ZeroGPU is not available for Docker SDK).
- **Implication for this repo:** the documented deploy path (backend Docker Space on `hf.space`) is dead at $0. Sources:
  - https://discuss.huggingface.co/t/docker-sdk-now-marked-as-paid-when-creating-a-new-space/177580
  - https://discuss.huggingface.co/t/spaces-changed-to-paid/177835
  - https://discuss.huggingface.co/t/official-community-complaint-revert-free-cpu-basic-spaces-and-remove-anti-developer-sdk-restrictions/177703

### 2.2 Free LLM API landscape (chat + embeddings)
| Provider | Free tier (approx., 2026) | Card? | Embeddings? |
|---|---|---|---|
| **Google Gemini (AI Studio)** | ~500 req/day (Flash), free text embeddings tier | No | Yes |
| **Groq** | Very high daily request limits on open models (thousands/day) | No | **No** |
| **OpenRouter `:free`** | ~20 RPM, 50–1000 req/day across many models | No | No |
| Cloudflare Workers AI | 10k neurons/day (chat + embeddings) | No | Yes |

Sources: OpenRouter blog comparison, edenai rate-limit roundup, ai-compass (see §2.3 for links).

### 2.3 Free hosting reality for a Python/FastAPI backend
- Cloudflare Workers (free 100k req/day) does **not** run Python/FastAPI natively.
- Other free container hosts (Render, Railway, Fly.io, Oracle Always Free, Koyeb, Modal, Google Cloud Run) were **not selected** by the owner and generally require a credit card, sleep on inactivity, or carry reliability risk — the same class of risk that just materialized with HF.

---

## 3. Interview decisions (all confirmed)

| # | Question | Answer |
|---|---|---|
| 1 | What is on the HF Docker Space? | **Nothing — not deployed yet** (owner blocked before starting) |
| 2 | Symptom / status | **Didn't start** — docs' $0 path no longer possible |
| 3 | Budget | **Must stay $0/month** |
| 4 | AI brain (local Ollama vs hosted free API) | **No preference → recommend** |
| 5 | Code-change appetite | **You decide →** plan the rewrite (see §4) |
| 6 | Providers willing to sign up | **Cloudflare, Groq, Google AI Studio** (only these) |
| 7 | Scale expectation | **Not sure yet** — wants headroom to grow without re-architecting |
| 8 | Feature parity required | **Everything as documented**: widget chat + RAG, bookings + email confirmations, admin dashboard (Clerk), CLI onboarding scripts |
| 9 | Endpoint/embed compatibility | **Anything can change** (no deployed clients) |
| 10 | DB/auth/email services | **You recommend →** keep Turso + Clerk + GAS (see §5.4) |
| 11 | Urgency | **ASAP / this week** |
| 12 | Architecture direction | **(a) Rewrite backend to Cloudflare Workers (TypeScript)** |
| 13 | Default LLM | **You recommend →** Gemini primary (§5.3) |
| 14 | Deploy mechanism | **GitHub Actions auto-deploy** (repo's current CI pattern) |
| 15 | Definition of "live this week" | **Chat + RAG working on a widget embed**; bookings/email + admin port later |

---

## 4. Recommended target architecture (primary plan)

```
┌─────────────────────────┐    ┌──────────────────────────────────────────────┐
│  Client site            │    │  Cloudflare (one account, all free tiers)    │
│  <script src="...widget  │───▶│                                              │
│   .js" data-tenant=...>  │    │  ┌────────────────────────────────────────┐  │
└─────────────────────────┘    │  │  Cloudflare Worker (new, TypeScript)    │  │
                               │  │  = ported backend (same routes):        │  │
                               │  │   /widget/config, /widget/chat (SSE),   │  │
                               │  │   /widget/availability, /appointments,  │  │
                               │  │   /widget/history, /health              │  │
                               │  │   /admin/*, /api/* (tenant auth)        │  │
                               │  │  Rate limiting, CORS, Clerk JWKS check  │  │
                               │  └────────────────────┬─────────────────────┘  │
                               │                       │ (fetch/HTTPS)          │
                               │  ┌────────────────────▼─────────────────────┐  │
                               │  │ Cloudflare Pages (already static):       │  │
                               │  │  widget/ (dist) + admin-dashboard (dist) │  │
                               │  └──────────────────────────────────────────┘  │
                               └──────────────────────────────────────────────┘
        ▼                        ▼                        ▼                    ▼
   Turso (libSQL HTTP)     Gemini API (chat+embed)   Google Apps Script    Clerk (JWKS)
   — unchanged schema      — primary LLM, no card    — email unchanged     — unchanged
```

### 4.1 Component responsibilities (unchanged vs new)
| Component | Today | After |
|---|---|---|
| Widget SDK (static JS) | Cloudflare Pages | **Unchanged** (Pages) — embed snippet re-pointed at new API origin |
| Admin dashboard (static React) | Cloudflare Pages | **Unchanged** (Pages) |
| Backend API | HF Docker Space (FastAPI + Ollama + nginx, supervisord) | **New Cloudflare Worker (TypeScript port)** |
| LLM (chat) | Ollama (phi3:mini, local) | **Gemini API free tier** (Groq as optional fallback) |
| Embeddings (RAG) | Ollama (nomic-embed-text) | **Gemini embeddings** (free tier) |
| Database | Turso (libSQL) | **Unchanged** — accessed over HTTP from Worker |
| Auth (admin/tenant API) | Clerk | **Unchanged** — verify JWTs via Clerk JWKS fetched in Worker |
| Email (bookings) | Google Apps Script web app | **Unchanged** — called via `fetch` from Worker |
| Deploy automation | GitHub Actions (Pages ×2, HF Docker push, keep-alive cron) | **Drop HF workflow + keep-alive**; add Worker deploy (`cloudflare/wrangler-action`); Pages workflows stay |
| Docs | README/DEPLOY/SETUP/guides assume HF Docker | **Rewrite to the new stack** (Phase 4) |

### 4.2 Why not the alternatives (documented for the record)
| Option | Cost/effort | Why rejected as primary |
|---|---|---|
| Pay HF PRO $9/mo, keep everything | $9/mo | Violates the $0 constraint |
| Keep FastAPI + Ollama, host elsewhere (Oracle/Render/Fly/Koyeb…) | $0-ish | Owner didn't select these; card/sleep/disappearance risk (HF just demonstrated it) |
| Local Ollama on HF → keep Ollama at all costs | n/a | No free always-on VM in owner's provider set |
| All-Cloudflare data stack (D1 + custom auth) | $0 | Much larger rewrite (migrations, auth) with no benefit at this scale — **rejected**; keep Turso/Clerk/GAS |
| Host widget SDK on HF **Static Space** | $0 | Possible but redundant: widget is already built static and Cloudflare Pages is already the home for it |

---

## 5. Key design decisions

### 5.1 Backend port map (FastAPI → Worker)
Port the route surface 1:1 so the widget, admin dashboard, and CLI scripts keep their contracts:

- **Widget (public):** `GET /widget/config/{tenant_slug}`, `POST /widget/chat/{tenant_slug}` (SSE stream), `GET /widget/availability/{tenant_slug}`, `POST /widget/appointments/{tenant_slug}`, `GET /widget/history/{tenant_slug}`, plus health.
- **Tenant API (`/api` or `/tenant`):** `/me` CRUD, `/me/knowledge` (+ text + pdf), `/me/conversations`, `/me/appointments`, `/me/analytics`.
- **Admin (`/admin`, Clerk-protected):** tenants CRUD + impersonate, analytics, conversations, appointments, knowledge upload (PDF/text), usage.
- **Services to port:** RAG search + retrieval (Turso vector-ish text search as implemented), intent classification, booking-detail extraction, business-hours parsing, email dispatch via GAS, conversation history persistence, rate limiting (Workers: in-memory + KV for durability), CORS.
- **Behavioral notes:**
  - SSE streaming is fully supported by Workers (`ReadableStream` + `text/event-stream`); the widget's existing SSE parser is unchanged.
  - PDF knowledge upload today extracts text server-side (PyMuPDF → `process_pdf(bytes)`), and CLI scripts parse PDFs locally with the same lib. See §5.6 for the chosen PDF-extraction approach (browser-side default, `unpdf` optional in-Worker path).
  - CLI onboarding scripts (`scripts/`) call the backend HTTP API — they keep working against the new origin; local Python helpers that shell out to Ollama must be replaced by API calls to the Worker.

### 5.2 Embed/endpoint contract (new)
- Nothing is deployed, so we are free to choose the contract:
  - **Default recommendation:** widget fetches API from an **absolute base URL** provided via a new `data-api-url` attribute (or build-time env) instead of same-origin relative paths; embed snippet becomes e.g. `<script src="https://widget.example.pages.dev/widget.js" data-tenant="..." data-api-url="https://api.example.workers.dev"></script>`.
  - Keep same-origin relative fetch as a fallback when the SDK is served by a host that also proxies `/widget/*` (no change to `useConfig`/`useChat` logic beyond reading the base URL).
- **Open item for Phase 1:** confirm the widget's current base-URL mechanism by reading `widget/src/hooks/*` and `vite.config.ts` during implementation; decide final snippet shape then.

### 5.3 LLM strategy (recommended: Gemini primary)
- **Chat:** Gemini Flash-class model via REST (`.../models/<CHAT_MODEL>:streamGenerateContent`) with a thin OpenAI-compatible-style wrapper in the Worker. Default model is env-configurable (`CHAT_MODEL`; the flash family has moved on — as of Sept 2026 “Gemini 3.8 Flash is now available” alongside 2.5 Flash/Flash-Lite — pick the flash-tier model with the best free RPD in AI Studio at implementation time). **Free tier is volatile:** official docs say limits are *not guaranteed* and defer to AI Studio; community reports for flash-class free RPD fluctuated roughly 20–1,500 across 2025–26. Therefore nothing may assume a fixed RPD: the Worker self-throttles, enforces configurable daily caps, and degrades gracefully (see §5.7).
- **Chat failover chain:** `LLM_CHAT_PROVIDERS` env, default `["gemini"]`, optional `"groq"` (key via `GROQ_API_KEY`) and/or `"workers-ai"` (no extra account) — automatic per-request failover on 429/5xx/timeout, plus Groq's `x-ratelimit-remaining-requests` header lets the Worker skip to degraded mode *before* a 429.
- **Embeddings (concrete):** use **`gemini-embedding-001` with `outputDimensionality: 768`** (free tier, no card). This exactly matches the current `nomic-embed-text` → 768-dim layout, so the vec0 DDL (`embedding FLOAT[768]`), the float32 BLOB encoding in `knowledge_chunks`, and the `[0.0]*768` failure fallback in `llm.py` all carry over unchanged. **Do not use `text-embedding-004` — Google is deprecating it in favor of `gemini-embedding-001`.** Because nothing is deployed, the DB is fresh: pick the model once at ingest and **no re-embed is needed at all**. See §5.6 for the re-embed procedure (only needed if a Turso DB already holds nomic vectors). Free embedding quota was ≈1,500 req/day at GA — **verify in AI Studio** and treat as config.
  - **Provider-mixing rule:** never embed new chunks with a different model/provider while stored vectors in the same table come from another — cross-model cosine distances are meaningless. Embeddings “failover” therefore means either a full re-embed job (§5.6) or graceful ingest/query degradation (§5.7), never a silent provider switch on live data.
- **Config shape:** replicate `backend/app/config.py` env knobs as Worker vars: model names, temperature, max tokens, provider keys (`GEMINI_API_KEY`, optional `GROQ_API_KEY`), rate-limit numbers.
- **Why Workers AI is fallback, not primary:** free allocation is **10,000 neurons/day** (resets 00:00 UTC) shared by *all* models incl. embeddings. Neuron math for a typical RAG message (~2.5k input + ~300 output tokens) on `llama-3.1-8b-instruct-fp8-fast` (4,119 neurons/M input + 34,868/M output): ≈ 10 + 10 ≈ **~21 neurons → ~400–500 messages/day**; smaller models (1–4B) stretch it further at lower quality; several frontier models (glm-5.x, kimi-k2.x, deepseek-v4) additionally **require a paid billing method** even on free allocation. Chat fallback only. (Embeddings note: `@cf/baai/bge-base-en-v1.5` is 768-dim and would be schema-compatible, but the §5.3 provider-mixing rule forbids mixing it with Gemini vectors — only viable after a full re-embed.)

### 5.4 Keep Turso + Clerk + GAS (recommended, accepted)
- **Turso:** use the HTTP (`@libsql/client` web) client from the Worker — no schema/migration changes; Turso free tier (9GB / 1B reads) unchanged. (Chosen over D1: zero data migration, existing alembic schema intact.)
  - **Vector search confirmed viable:** sqlite-vec/vec0 is built into Turso server-side (no `load_extension` needed over HTTP; supports up to 65,536 dims). The Worker can run the exact SQL the backend uses today (`vec_distance_cosine` over float32 blobs + the `knowledge_vec` virtual table) via the HTTP client — the `load_extension('vec0')` dance in `database.py` is only relevant to local/embedded runs and must be dropped in the Worker.
- **Clerk:** verify Bearer JWTs in the Worker by fetching the Clerk JWKS URL (derived from the publishable key, per `backend/app/config.py`) and verifying with WebCrypto; keep `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`/`ADMIN_EMAIL`.
- **GAS email:** unchanged `fetch` to `GAS_WEBAPP_URL`; booking-confirmation behavior preserved.

### 5.5 Free-tier budget & headroom (owner scale unknown)
| Resource | Free allowance | Headroom note |
|---|---|---|
| Cloudflare Workers requests | 100,000/day | Health + keep-alive pings are cheap; ~chat calls dominate |
| Cloudflare Pages | Unlimited static bandwidth (fair use) | Widget + admin unchanged |
| Gemini API — chat (primary) | Free tier flash-class: community-reported ~20–500 RPD across 2025–26 — **volatile; exact per-model RPM/TPM/RPD only in AI Studio** | Self-throttle + daily KV caps; failover to Groq; graceful "limit reached" streaming message (§5.7) |
| Gemini API — embeddings `gemini-embedding-001` @768 | Free tier, no card; ≈1,500 req/day at GA — verify in AI Studio | Ingest-only, batched ≤75% of RPM; 429 → backoff; quota error surfaces in admin (§5.7) |
| Workers AI (fallback only) | 10,000 neurons/day (reset 00:00 UTC) ≈ 400–500 RAG msgs/day on 8B llama; frontier models need paid billing | Chat failover only; embeddings limited by provider-mixing rule (§5.3) |
| Turso | 9GB / 1B reads/mo | Unchanged |
| Clerk | 10k MAU | Unchanged |
| Gmail via GAS | 100 emails/day | Unchanged |

Growth path without re-architecture: raise/scale the same Worker (Workers paid tier), add billing to Gemini/Groq, or point env vars at paid keys — no code change required.

### 5.6 PDF ingestion & embedding re-embed (investigation results)

**How PDFs flow today:** `POST /admin|/tenant/.../knowledge` (multipart) → `knowledge_service.process_pdf(bytes)` → PyMuPDF (`fitz`) page-text extraction → word-level chunking (500 words / 50 overlap) → LLM embed per chunk → rows into `knowledge_chunks` + `knowledge_vec`. CLI scripts (`scripts/upload_knowledge.py`, `extract_business_hours.py`) parse PDFs **locally** with `fitz` and talk directly to the DB/services. The Worker port has no PyMuPDF, and Workers **Free plan caps CPU at 10 ms/request** (128 MB memory, 50 subrequests) — too tight for reliable server-side PDF parsing of real documents.

**Decision — where PDF text extraction happens (default: not in the Worker):**
1. **Admin dashboard (primary):** extract in the browser with `pdfjs-dist` (native PDF.js; runs client-side, zero Worker CPU cost), then POST the extracted text to the existing `/knowledge/text` endpoint. Upload UX is unchanged for admins.
2. **CLI scripts:** keep a PyMuPDF-only local extractor (no backend imports — no DB/Ollama coupling) and POST text to the Worker's `/knowledge/text`; mirrors today's flow minus server parsing.
3. **Optional in-Worker path (`unpdf`):** `unpdf` is a pdf.js wrapper built for edge/serverless and is the library in Cloudflare's own R2 PDF-summarization tutorial, so it runs on Workers. Use only as a flag-gated convenience for small PDFs: validate CPU envelope on a sample first (watch for error 1102), and fall back to the client path on failure.
4. **Last resort:** Gemini PDF transcription (send the PDF inline as base64 with a "return all text" prompt) — costs chat-tokens and rate limit; only for tiny docs; not the default.

**Embedding re-embed procedure (only if a Turso DB already holds nomic-embed-text vectors — currently none, but keep for safety):**
1. Pick the target model: `gemini-embedding-001`, `outputDimensionality: 768` → **schema-compatible** (vec0 `FLOAT[768]`, float32 BLOB, zero-vector fallback all unchanged). If a non-768 model is ever chosen, `DROP` + recreate `knowledge_vec` with the new `FLOAT[N]` first.
2. Read all `knowledge_chunks.content` for a tenant; embed in batches with retry/backoff on 429; write vectors as **little-endian float32 blobs** — byte-identical to `sqlite_vec.serialize_float32` so `vec_distance_cosine` keeps working.
3. `UPDATE knowledge_chunks SET embedding = ?`; then **delete + re-insert** `knowledge_vec` rows (vec0 has no unique key on `chunk_id`, so `INSERT OR REPLACE` alone can duplicate).
4. Verify: run 3–5 known-good queries per tenant and confirm sensible top-5 hits + similarity ≥ 0.7 threshold.

**Free-tier sizing:** a 500-word chunk ≈ one embedding request; e.g., a 30-page PDF ≈ 100–300 chunks → well inside the ≈1,500 req/day embedding quota; embed at ingest (rare, admin-initiated) rather than at query time.

### 5.7 Free-tier limit handling & graceful degradation (UX spec)

**Design goal:** end users never see raw errors, provider names, or keys; quotas are protected; the system self-recovers when limits reset.

**Sources of truth (verified Sept 2026):**
- **Gemini:** free-tier per-model RPM/TPM/RPD exist but are explicitly “not guaranteed” and only shown in AI Studio (Project settings → Rate limits); RPD resets midnight Pacific. Community reports (2025–26) show flash-class free RPD fluctuating (~20–1,500) — treat as **configuration, never a code constant**.
- **Groq:** per-model RPM/RPD/TPM/TPD (org-level). Current docs list e.g. `openai/gpt-oss-20b|120b`, `qwen/qwen3.x-27b` at **30 RPM / 1K RPD / 8K TPM / 200K TPD**; `groq/compound-mini` at 250 RPD / 70K TPM. 429 responses carry **`retry-after` + `x-ratelimit-*` headers** (the Worker can read remaining quota). Groq has no embeddings.
- **Workers AI:** 10,000 neurons/day for all models incl. embeddings; reset 00:00 UTC; over-limit calls fail (log + failover). Some frontier models need a paid billing method.

**Behavior by path:**
1. **Chat (widget, user-facing):**
   - Self-throttle: per-tenant rolling RPM bucket (env `LLM_CHAT_RPM`, e.g. 10) plus a daily KV counter gated at a configurable fraction of the expected RPD (`LLM_CHAT_DAILY_CAP_PCT`, e.g. 80%).
   - At/over cap → skip provider entirely and stream the friendly message (below); log `usage_logs` event `llm_limit_preempt`.
   - Otherwise call provider: on 429/5xx/timeout retry once with backoff (honor `retry-after` when present), then fail over per `LLM_CHAT_PROVIDERS` chain; if Groq headers report remaining ≈ 0, jump straight to degraded mode.
   - Degraded copy streams as a normal chat message (never an error popup): *“I'm at my usage limit right now — please try again in a little while.”* Wording lives in widget `config.limitMessages` so owners can edit; stays client-safe (no provider names).
2. **Embeddings ingest (admin UI + CLI uploads):**
   - Batch with bounded concurrency, throttled to ≤75% of the provider RPM; per-request retry with exponential backoff + jitter, honoring `retry-after`; on persistent failure abort the batch.
   - Daily-cap exhaustion → HTTP 429 `{code: "embed_quota", detail: <friendly>, retry_at: <reset time>}`; admin shows a toast: *“Upload hit today's AI limit — try again tomorrow.”* Re-upload is idempotent (delete source, re-add).
   - Provider-mixing rule (§5.3) applies: degrade rather than silently switch embedding models. If the embedder is down at query time, respond *“I can't search the knowledge base right now — try again shortly.”* instead of returning garbage-ranked vectors.
3. **Emails (GAS quota, 100/day):** on GAS failure, appointment is saved with status `email_pending`; admin dashboard lists pending emails with a retry action. End users still get their in-chat confirmation — no visible breakage.
4. **Monitoring:** date-keyed KV counters for chat calls, embedding batches, 429s, failovers, email failures; surfaced in admin via the existing `/usage` view plus a “remaining vs. cap” summary; operator alert (dashboard banner) when within 20% of any cap.

---

## 6. Repo & workflow changes (implementation phase)

- Add Worker source (e.g., `worker/` or fold into new `api-worker/` dir with `wrangler.toml`), TypeScript + `@libsql/client` etc.
- GitHub Actions:
  - **Remove:** `deploy-hf.yml`, `keep-alive.yml` (HF gone; keep-alive no longer needed if needed at all).
  - **Update/add:** worker deploy via `cloudflare/wrangler-action@v3` on push to `main` (paths: worker sources); keep `deploy-widget.yml` / `deploy-admin.yml` for Pages.
  - Secrets change: drop `HF_USERNAME/HF_TOKEN/HF_SPACE_NAME`; add `CLOUDFLARE_API_TOKEN` (already exists), `CLOUDFLARE_ACCOUNT_ID` (exists), Worker name, `GEMINI_API_KEY` (+ optional `GROQ_API_KEY`), keep Turso/Clerk/GAS/ADMIN_EMAIL.
- `docker-compose.yml`, `Dockerfile`, `supervisord.conf`, `nginx.conf`, HF-oriented scripts/onboarding: mark obsolete or repurpose (nginx no longer needed; compose may stay for local dev only if useful).

---

## 7. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Full parity port in one week is unrealistic | High | Phase it (below); "live this week" = Chat + RAG only |
| PDF text extraction without PyMuPDF | Medium | **Default: extract outside the Worker** — admin dashboard uses client-side `pdfjs-dist` and POSTs text to `/knowledge/text`; CLI keeps a PyMuPDF-only local extractor. Optional in-Worker `unpdf` (Cloudflare-endorsed) is capped by the Free plan's 10 ms CPU/request — test envelope, catch error 1102, fall back. Gemini PDF transcription is last resort. See §5.6 |
| Embedding model swap invalidates vectors | Low | Fresh DB → no migration: pick `gemini-embedding-001 @768` at ingest (§5.3). If a Turso DB already holds nomic vectors: run the idempotent re-embed in §5.6 (LE-float32 blobs, rebuild `knowledge_vec` via delete+insert), re-verify top-5 hits on sample queries |
| sqlite-vec SQL through Turso HTTP from Worker | Low | Built into Turso (verified): `vec_distance_cosine`/`vec0` run server-side; no `load_extension` in the Worker; keep float32 blob byte-format identical to `sqlite_vec.serialize_float32` |
| Gemini free-tier cap hit or RPD cut (volatile limits) | Medium | Self-throttle + daily KV cap pre-check (§5.7); failover chain `LLM_CHAT_PROVIDERS` (Groq/Workers AI); friendly streaming message, never an error popup |
| 429 storms during knowledge ingest | Low | Batch concurrency ≤75% RPM, backoff honoring `retry-after`; abort batch + idempotent re-upload on daily-cap exhaustion (§5.7) |
| Embedding provider outage (query-time) | Low | Provider-mixing rule forbids silent switch; degrade with friendly "can't search knowledge" message; full re-embed job (§5.6) is the recovery path |
| SSE behavior differences (Workers vs uvicorn) | Medium | Verify streaming chunk format against widget parser in Phase 1 acceptance |
| Widget base-URL refactor breaks embed | Medium | Nothing deployed; locked decision §5.2; test snippet in acceptance |
| Rate limiting semantics differ (in-memory vs nginx) | Low | Port per-key limits; use KV for durable counters |
| Clerk JWKS fetch latency on cold start | Low | Cache JWKS in KV with TTL |

---

## 8. Phased implementation plan

- **Phase 1 — Chat + RAG live (this week):**
  1. Scaffold Worker; wire Turso (HTTP), Clerk verification, CORS.
  2. Port RAG pipeline: knowledge ingest via existing Turso rows → Gemini `gemini-embedding-001` (@768) embeddings; retrieval (`vec_distance_cosine`); `synthesize_answer` prompt; intent classifier for greetings.
  3. Port `GET /widget/config/{slug}` + `POST /widget/chat/{slug}` SSE.
  4. Widget: add `data-api-url` base-URL support; build; deploy Pages.
  5. GitHub Actions worker deploy + Pages deploys; secrets update.
  6. Acceptance: fresh tenant, upload one knowledge text, embed on test page, chat answers from knowledge (curl + browser); sanity-check retrieval on 3 sample queries.
- **Phase 2 — Bookings + email:** port availability/appointments/history + GAS email dispatch + business-hours extraction.
- **Phase 3 — Admin & tenant APIs:** full `/admin/*` + `/api/*` CRUD, analytics, conversations, usage, impersonate; PDF upload via browser-side `pdfjs-dist` extraction → `/knowledge/text` (optional `unpdf` in-Worker path per §5.6).
- **Phase 4 — Docs & cleanup:** rewrite README/SETUP/DEPLOY/onboarding + generated HTML guides to the $0 Cloudflare stack; delete HF workflows/Docker remnants; update CLI scripts to call the Worker.

---

## 9. Acceptance criteria (overall)

- End-to-end deploy from a fresh GitHub repo costs **$0/month, no credit card**.
- Widget embed chat with RAG works on a client test page within one week (Phase 1).
- Bookings, email confirmations, and admin dashboard work identically to the README (after Phases 2–3).
- All deploys happen via GitHub Actions on push to `main`.
- No component depends on Hugging Face (except optional static-hosted docs).

---

## 10. Deferred / open questions (for implementation phase)

1. Exact widget base-URL mechanism (confirm against current code, §5.2).
2. Re-verify Gemini model lineup + free-tier limits in AI Studio at implementation time (model lineup shifts; §5.3 assumes `gemini-embedding-001` @768; chat model via `CHAT_MODEL` env).
3. Failover chain defaults: enable Groq (`GROQ_API_KEY`) and/or Workers AI by default, or ship Gemini-only and switch on later?
4. Whether to keep `docker-compose.yml` for local dev or delete.
5. Custom domain for Worker/Pages or default `*.workers.dev` / `*.pages.dev`.
6. Scope/size of generated PDF guide updates in Phase 4.
7. Optional `embedding_model`/`embedding_dim` columns on `knowledge_chunks` (migration 002) to future-proof provider switches, vs. keeping the schema untouched.
8. Admin-dashboard PDF upload: client-side parse (default) vs. flag-gated `unpdf` Worker endpoint (§5.6).
9. Email-quota UX (§5.7.3): build `email_pending` + admin retry now (Phase 2) or defer to Phase 4 polish?

---

## 11. Sources

- HF forum — Docker SDK marked Paid: https://discuss.huggingface.co/t/docker-sdk-now-marked-as-paid-when-creating-a-new-space/177580
- HF forum — Spaces changed to paid: https://discuss.huggingface.co/t/spaces-changed-to-paid/177835
- HF community complaint / alternatives thread: https://discuss.huggingface.co/t/official-community-complaint-revert-free-cpu-basic-spaces-and-remove-anti-developer-sdk-restrictions/177703
- HF Spaces Docker docs: https://huggingface.co/docs/hub/en/spaces-sdks-docker
- Free LLM API comparisons (2026): https://openrouter.ai/blog/tutorials/free-llm-apis-compared/ · https://www.edenai.co/post/top-free-llm-tools-apis-and-open-source-models
- Cloudflare R2 tutorial using `unpdf` in a Worker: https://developers.cloudflare.com/r2/tutorials/summarize-pdf/
- `unpdf` package: https://www.npmjs.com/package/unpdf
- Cloudflare Workers limits (Free: 100k req/day, 10 ms CPU, 128 MB, 50 subrequests): https://developers.cloudflare.com/workers/platform/limits/
- Turso vector search / AI & embeddings: https://turso.tech/vector · https://docs.turso.tech/features/ai-and-embeddings
- Gemini embeddings API docs: https://ai.google.dev/gemini-api/docs/embeddings
- gemini-embedding-001 GA announcement (free tier, output dims incl. 768): https://developers.googleblog.com/gemini-embedding-available-gemini-api/
- text-embedding-004 deprecation reports: https://community.n8n.io/t/google-deprecating-text-embedding-004-but-gemini-embedding-001-doesnt-work/262008
- Gemini API rate limits (official; per-model free values only in AI Studio): https://ai.google.dev/gemini-api/docs/rate-limits
- Groq rate limits (official; per-model RPM/RPD/TPM/TPD + `retry-after`/`x-ratelimit-*` headers): https://console.groq.com/docs/rate-limits
- Workers AI pricing / 10k neurons/day free allocation (official): https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cloudflare Workers plan limits (Free: 100k req/day): https://developers.cloudflare.com/workers/platform/limits/
