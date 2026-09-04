/**
 * Admin-lite API (Phase 1 subset of backend/app/api/admin.py).
 *
 * Clerk-protected: the Bearer session token must belong to an email in the
 * ADMIN_EMAILS allowlist (see clerk.ts). Enough to onboard a tenant and load
 * knowledge for the widget without the full admin dashboard (Phase 3).
 *
 * PDF upload is intentionally NOT routed here — text extraction happens in
 * the browser/CLI and the text is POSTed to /knowledge/text (spec §5.6).
 */
import type { Client } from '@libsql/client/web'
import { query, rowString, type SqlRow } from './db'
import { tenantById } from './tenants'
import { processFaq, processText, deleteChunks, listSources } from './knowledge'
import type { Env } from './config'
import { json } from './chat'

export async function authorize(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return json({ detail: 'Missing Authorization header' }, 401)
  // Optional bootstrap token — intended only for the first onboarding steps
  // before the Clerk-protected admin dashboard is available (Phase 3).
  if (env.ADMIN_BOOTSTRAP_TOKEN && token === env.ADMIN_BOOTSTRAP_TOKEN) {
    return null
  }
  try {
    const { isAdmin } = await import('./clerk')
    const ok = await isAdmin(env, token)
    if (!ok) return json({ detail: 'Not authorized' }, 403)
    return null
  } catch (e) {
    return json({ detail: `Auth failed: ${(e as Error).message}` }, 401)
  }
}

interface TenantBody {
  name?: string
  slug?: string
  primary_color?: string
  greeting?: string
  bot_name?: string
}

function tenantResponse(row: SqlRow) {
  return {
    id: rowString(row, 'id'),
    slug: rowString(row, 'slug'),
    name: rowString(row, 'name'),
    domain: (row['domain'] as string | null) || null,
    plan: rowString(row, 'plan', 'free'),
    settings: parseJson<Record<string, unknown>>(rowString(row, 'settings', '{}'), {}),
    business_hours: parseJson<Record<string, unknown> | null>(
      rowString(row, 'business_hours', ''),
      null,
    ),
    timezone: rowString(row, 'timezone', 'UTC'),
    slot_duration: Number(row['slot_duration'] ?? 30),
    buffer_minutes: Number(row['buffer_minutes'] ?? 15),
    created_at: Number(row['created_at'] || 0),
    updated_at: Number(row['updated_at'] || 0),
  }
}

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function listTenants(db: Client): Promise<Response> {
  const result = await query(db, 'SELECT * FROM tenants ORDER BY created_at DESC LIMIT 100')
  const tenants = result.rows.map((r) => tenantResponse(r))
  return json({ tenants, total: tenants.length, page: 1, page_size: 100 })
}

export async function createTenant(db: Client, raw: string | null): Promise<Response> {
  let body: TenantBody
  try {
    body = raw ? (JSON.parse(raw) as TenantBody) : {}
  } catch {
    return json({ detail: 'Invalid JSON body' }, 400)
  }
  const name = (body.name || '').trim()
  const slug = (body.slug || '').trim()
  if (!name || !slug) return json({ detail: 'name and slug are required' }, 400)
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return json({ detail: 'slug must match ^[a-z0-9-]+$' }, 400)
  }
  const existing = await query(db, 'SELECT id FROM tenants WHERE slug = ?', [slug])
  if (existing.rows.length) return json({ detail: 'slug already exists' }, 409)

  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const settings = {
    bot_name: (body.bot_name || 'Assistant').trim(),
    greeting: (body.greeting || 'Hi! How can I help you today?').trim(),
    primary_color: body.primary_color || '#3B82F6',
    secondary_color: '#1E40AF',
    show_branding: true,
  }
  await query(
    db,
    `INSERT INTO tenants (id, slug, name, plan, settings, timezone, created_at, updated_at)
     VALUES (?, ?, ?, 'free', ?, 'UTC', ?, ?)`,
    [id, slug, name, JSON.stringify(settings), now, now],
  )
  const row = await query(db, 'SELECT * FROM tenants WHERE id = ?', [id])
  return json(tenantResponse(row.rows[0]!), 201)
}

interface KnowledgeTextBody {
  source_id?: string
  source_type?: 'txt' | 'md' | 'faq' | string
  content?: string
}

export async function uploadKnowledgeText(
  db: Client,
  env: Env,
  tenantId: string,
  raw: string | null,
): Promise<Response> {
  const tenant = await tenantById(db, tenantId)
  if (!tenant) return json({ detail: 'Tenant not found' }, 404)

  let body: KnowledgeTextBody
  try {
    body = raw ? (JSON.parse(raw) as KnowledgeTextBody) : {}
  } catch {
    return json({ detail: 'Invalid JSON body' }, 400)
  }
  const sourceId = (body.source_id || '').trim()
  const sourceType = body.source_type || 'txt'
  const content = (body.content || '').trim()
  if (!sourceId || !content) {
    return json({ detail: 'source_id and content are required' }, 400)
  }

  // Idempotent re-upload: drop the source first so re-runs don't duplicate.
  await deleteChunks(db, tenantId, sourceId)

  try {
    let result: { source_id: string; chunks_created: number; total_chars?: number; total_items?: number }
    if (sourceType === 'faq') {
      let items: Array<{ question?: string; answer?: string }>
      try {
        items = JSON.parse(content) as Array<{ question?: string; answer?: string }>
      } catch {
        return json({ detail: 'content must be a JSON array of {question, answer}' }, 400)
      }
      result = await processFaq(db, env, tenantId, items, sourceId)
    } else {
      result = await processText(db, env, tenantId, content, sourceId, sourceType)
    }
    return json({
      source_id: result.source_id,
      chunks_created: result.chunks_created,
      content_preview: `Processed ${result.chunks_created} chunks`,
    })
  } catch (e) {
    const err = e as { status?: number }
    if (err.status === 429) {
      return json(
        {
          code: 'embed_quota',
          detail: "Upload hit today's AI limit — try again tomorrow.",
          retry_at: 'midnight PT',
        },
        429,
      )
    }
    console.error('knowledge upload failed:', e)
    return json({ detail: 'Failed to embed knowledge — check GEMINI_API_KEY and quotas' }, 502)
  }
}

export async function deleteKnowledge(
  db: Client,
  tenantId: string,
  sourceId: string,
): Promise<Response> {
  const tenant = await tenantById(db, tenantId)
  if (!tenant) return json({ detail: 'Tenant not found' }, 404)
  const deleted = await deleteChunks(db, tenantId, sourceId)
  return json({ deleted_chunks: deleted })
}

export async function getKnowledge(db: Client, tenantId: string): Promise<Response> {
  const tenant = await tenantById(db, tenantId)
  if (!tenant) return json({ detail: 'Tenant not found' }, 404)
  const sources = await listSources(db, tenantId)
  return json({ sources })
}

interface AnalyticsData {
  total_tenants: number
  active_tenants: number
  total_conversations: number
  total_appointments: number
  total_messages: number
  messages_last_7_days: number
  appointments_last_7_days: number
  top_tenants: Array<{ name: string; slug: string; conversations: number }>
}

/** Platform analytics for the admin dashboard (GET /admin/analytics). */
export async function getAnalytics(db: Client): Promise<Response> {
  const now = Math.floor(Date.now() / 1000)
  const day = 24 * 60 * 60

  const count = async (sql: string, args: (string | number)[] = []): Promise<number> => {
    const r = await query(db, sql, args)
    return Number(r.rows[0]?.['c'] ?? 0)
  }

  const total_tenants = await count("SELECT COUNT(*) AS c FROM tenants WHERE plan != 'deleted'")
  const active_tenants = await count(
    'SELECT COUNT(DISTINCT tenant_id) AS c FROM usage_logs WHERE created_at >= ?',
    [now - 30 * day],
  )
  const total_conversations = await count('SELECT COUNT(*) AS c FROM conversations')
  const total_appointments = await count('SELECT COUNT(*) AS c FROM appointments')
  const total_messages = await count('SELECT COUNT(*) AS c FROM messages')
  const messages_last_7_days = await count(
    'SELECT COUNT(*) AS c FROM messages WHERE created_at >= ?',
    [now - 7 * day],
  )
  const appointments_last_7_days = await count(
    'SELECT COUNT(*) AS c FROM appointments WHERE created_at >= ?',
    [now - 7 * day],
  )

  const top = await query(
    db,
    `SELECT t.name AS name, t.slug AS slug, COUNT(c.id) AS conversations
     FROM tenants t
     LEFT JOIN conversations c ON c.tenant_id = t.id
     WHERE t.plan != 'deleted'
     GROUP BY t.id, t.name, t.slug
     ORDER BY conversations DESC
     LIMIT 5`,
  )
  const top_tenants = top.rows.map((r) => ({
    name: rowString(r, 'name'),
    slug: rowString(r, 'slug'),
    conversations: Number(r['conversations'] ?? 0),
  }))

  const data: AnalyticsData = {
    total_tenants,
    active_tenants,
    total_conversations,
    total_appointments,
    total_messages,
    messages_last_7_days,
    appointments_last_7_days,
    top_tenants,
  }
  return json(data)
}
