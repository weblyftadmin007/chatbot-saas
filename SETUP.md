# Account Setup Checklist

Create these free accounts (no credit card required) and collect one secret
from each. Expected total: **$0/month**.

> Last updated for the Cloudflare Worker backend (Phase 1). The old Hugging
> Face Space steps are gone — Docker Spaces are no longer free (July 2026).

## 1. GitHub
- Sign up, then create a repo from this template ("Use this template").

## 2. Cloudflare (backend + both static sites)
- https://dash.cloudflare.com → My Profile → API Tokens → Create Token
- Template **"Edit Cloudflare Workers"**; add **Account → Cloudflare Pages:Edit**.
- Copy the token → GitHub secret `CLOUDFLARE_API_TOKEN`.
- Note your **Account ID** (dashboard right sidebar) → GitHub secret `CLOUDFLARE_ACCOUNT_ID`.

## 3. Google AI Studio — Gemini API key (the LLM brain)
- https://aistudio.google.com/apikey → "Create API key"
- Copy it → GitHub secret `GEMINI_API_KEY`.
- Note: free-tier limits vary by model and change over time. Pick the
  flash-class chat model with the best free Requests-Per-Day in AI Studio and
  set it as the `CHAT_MODEL` var in `worker/wrangler.toml` (default
  `gemini-2.5-flash`). Embeddings use `gemini-embedding-001` @ 768 dims — do
  **not** change its dimensions; the vector table is `FLOAT[768]`.

## 4. Turso (database, vector search built in)
- https://turso.tech → Create database → name `chatbot-db`, region near you.
- `turso db shell chatbot-db < worker/db/schema.sql` (creates all tables).
- Copy **Database URL** (`libsql://...`) → GitHub secret `TURSO_DATABASE_URL`.
- Copy the **database auth token** → GitHub secret `TURSO_AUTH_TOKEN`.

## 5. Clerk (auth for the admin dashboard + /admin API)
- https://clerk.com → Create application → "Chatbot Admin"
- API Keys: **Publishable Key** (`pk_test_...`) → GitHub secret `CLERK_PUBLISHABLE_KEY`
  and Pages env var `VITE_CLERK_PUBLISHABLE_KEY` on the `chatbot-admin` project.
- (Optional for now) **Secret Key** → GitHub secret `CLERK_SECRET_KEY`.
- User & Authentication → enable Email sign-in.
- Allowed Redirect URLs: add your Pages domains (`https://*.pages.dev`).
- Add your email to the **Allowlist**.

## 6. Google Apps Script (email sender — used in Phase 2, set up now)
- https://script.google.com → New project → paste `gas-email/Code.gs`
- Deploy → Web App → Execute as: Me → Who has access: Anyone
- Copy the URL (ends `/exec`) → GitHub secret `GAS_WEBAPP_URL`.
- Run `testEmail()` once in the editor to authorize.

## 7. Remaining GitHub secrets

| Secret | Value |
|---|---|
| `TURSO_DATABASE_URL` | From Turso (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | From Turso |
| `GEMINI_API_KEY` | From Google AI Studio |
| `CLERK_PUBLISHABLE_KEY` | From Clerk (`pk_test_...`) |
| `ADMIN_EMAILS` | Your email(s), comma-separated — must match the Clerk allowlist |
| `ADMIN_BOOTSTRAP_TOKEN` | *Optional* long random string — used to create the first tenant/knowledge before the admin dashboard is wired (delete later, see DEPLOY.md §5) |
| `GAS_WEBAPP_URL` | From Apps Script (needed in Phase 2) |
| `CLOUDFLARE_API_TOKEN` | From Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | From Cloudflare dashboard |

**Removed vs. the old setup:** `HF_TOKEN`, `HF_USERNAME`, `HF_SPACE_NAME`
(no more Hugging Face).

## 8. Deploy order (after secrets are set)

1. Push to `main` → Worker deploys (`chatbot-api`) with secrets.
2. Cloudflare Pages → connect repo → `chatbot-widget` and `chatbot-admin`
   (build steps in `DEPLOY.md` §4; set `VITE_CLERK_PUBLISHABLE_KEY` on admin).
3. Follow `DEPLOY.md` §5 to create your first tenant + knowledge, then embed.

## 9. Local .dev.vars example (worker/)

```bash
TURSO_DATABASE_URL=libsql://chatbot-db-<org>.turso.io
TURSO_AUTH_TOKEN=eyJ...
GEMINI_API_KEY=AIza...
CLERK_PUBLISHABLE_KEY=pk_test_...
ADMIN_EMAILS=you@example.com
ADMIN_BOOTSTRAP_TOKEN=<random>   # optional
```
