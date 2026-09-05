/**
 * Chatbot backend Worker — Phase 1 (widget chat + RAG + admin-lite ingest).
 *
 * Route surface mirrors the FastAPI backend (see backend/ for the reference
 * implementation and hf-docker-exit-spec.md for the migration plan):
 *
 *   GET  /health
 *   GET  /widget/config/:slug
 *   POST /widget/chat/:slug            (SSE stream)
 *   GET  /widget/history/:slug?conversation_id=
 *   GET  /admin/tenants                (Clerk + ADMIN_EMAILS allowlist)
 *   POST /admin/tenants                { name, slug, ... }
 *   GET  /admin/tenants/:id
 *   DELETE /admin/tenants/:id          (soft delete: plan='deleted')
 *   POST /admin/tenants/:id/knowledge/text  { source_id, source_type, content }
 *   GET  /admin/tenants/:id/knowledge
 *   DELETE /admin/tenants/:id/knowledge/:source_id
 *
 *   GET  /debug/db   (no auth) — reachability check for the Turso DB; returns
 *                     only { ok, reachable, db_url_hint, error } with no secrets
 *                     or customer data. Useful for diagnosing 1101/500 chat failures.
 */
import type { Env } from './config'
import { getDb, query, rowString } from './db'
import { tenantBySlug, buildWidgetConfig } from './tenants'
import { handleChat, json } from './chat'
import { classifyIntent, generateText } from './llm'
import {
  authorize,
  createTenant,
  deleteKnowledge,
  deleteTenant,
  getAnalytics,
  getKnowledge,
  getTenant,
  listTenants,
  updateTenant,
  uploadKnowledgeText,
} from './admin'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function withCors(res: Response): Response {
  const r = new Response(res.body, res)
  for (const [k, v] of Object.entries(CORS_HEADERS)) r.headers.set(k, v)
  return r
}

function notFound(): Response {
  return json({ detail: 'Not found' }, 404)
}

function methodNotAllowed(): Response {
  return json({ detail: 'Method not allowed' }, 405)
}

function matchRoute(pathname: string): { pattern: string; params: string[] } | null {
  // /widget/config/:slug etc.
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length === 0) return null // reject only the bare root path; /health is a valid 1-segment route
  const head = `/${segs[0]}`
  const tail = segs.slice(1).map(decodeURIComponent)
  switch (head) {
    case '/health':
      return segs.length === 1 ? { pattern: 'health', params: [] } : null
    case '/widget': {
      if (tail.length === 2 && tail[0] === 'config') return { pattern: 'widgetConfig', params: [tail[1]!] }
      if (tail.length === 2 && tail[0] === 'chat') return { pattern: 'widgetChat', params: [tail[1]!] }
      if (tail.length === 2 && tail[0] === 'history') return { pattern: 'widgetHistory', params: [tail[1]!] }
      return null
    }
    case '/admin': {
      if (tail.length === 1 && tail[0] === 'analytics') return { pattern: 'adminAnalytics', params: [] }
      if (tail.length === 1 && tail[0] === 'tenants') return { pattern: 'adminTenants', params: [] }
      if (tail.length === 2 && tail[0] === 'tenants') return { pattern: 'adminTenant', params: [tail[1]!] }
      if (tail.length === 3 && tail[0] === 'tenants' && tail[2] === 'knowledge')
        return { pattern: 'adminTenantKnowledge', params: [tail[1]!] }
      if (tail.length === 4 && tail[0] === 'tenants' && tail[2] === 'knowledge' && tail[3] === 'text')
        // POST /admin/tenants/:id/knowledge/text { source_id, source_type, content }
        return { pattern: 'adminTenantKnowledge', params: [tail[1]!] }
      if (tail.length === 4 && tail[0] === 'tenants' && tail[2] === 'knowledge')
        return { pattern: 'adminTenantKnowledgeSource', params: [tail[1]!, tail[3]!] }
      return null
    }
    case '/debug': {
      if (tail.length === 1 && tail[0] === 'db') return { pattern: 'debugDb', params: [] }
      if (tail.length === 1 && tail[0] === 'classify') return { pattern: 'debugClassify', params: [] }
      return null
    }
    default:
      return null
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const route = matchRoute(url.pathname)

    if (!route) return withCors(notFound())

    const db = getDb(env)

    switch (route.pattern) {
      case 'debugDb': {
        if (request.method !== 'GET') return withCors(methodNotAllowed())
        let reachable = 'unknown'
        let dbUrlHint = ''
        let error = ''
        try {
          dbUrlHint = env.TURSO_DATABASE_URL ? env.TURSO_DATABASE_URL.replace(/\/.*$/, '/…') : ''
          await db.execute({ sql: 'SELECT 1', args: [] })
          reachable = 'yes'
        } catch (e) {
          reachable = 'no'
          error = (e instanceof Error ? e.message : 'unknown error').slice(0, 400)
        }
        return withCors(
          json({
            ok: true,
            reachable,
            db_url_hint: dbUrlHint || null,
            error: error || null,
            timestamp: Math.floor(Date.now() / 1000),
            note: 'No secrets returned. Error trimmed to 400 chars.',
          }),
        )
      }

      case 'debugClassify': {
        if (request.method !== 'GET') return withCors(methodNotAllowed())
        const text = (new URL(request.url).searchParams.get('text') || 'Hello').slice(0, 500)
        let rawResponse = ''
        let resolvedIntent = ''
        try {
          resolvedIntent = await classifyIntent(env, text)
        } catch (e) {
          resolvedIntent = (e instanceof Error ? e.message : 'unknown error').slice(0, 400)
        }
        try {
          rawResponse = await generateText(env, {
            messages: [{ role: 'user', text: `Classify the user's intent into ONE category:\n- book_appointment: Wants to schedule a meeting\n- cancel_appointment: Wants to cancel or reschedule\n- check_availability: Asks about open slots\n- general_query: Information question\n- transfer_human: Explicitly asks for human\n- unclear: Ambiguous or off-topic\n\nExamples:\nUser: "Book a meeting for Tuesday 2pm" -> book_appointment\nUser: "Cancel my appointment" -> cancel_appointment\nUser: "What times are open Friday?" -> check_availability\nUser: "What's your refund policy?" -> general_query\nUser: "Talk to a person" -> transfer_human\nUser: "Hello" -> unclear\n\nUser: "${text}"\nIntent:` }],
            temperature: 0.1,
            maxTokens: 20,
          })
        } catch (e) {
          rawResponse = (e instanceof Error ? e.message : 'unknown error').slice(0, 400)
        }
        return withCors(
          json({
            ok: true,
            input: text,
            raw_response: rawResponse.slice(0, 300),
            resolved_intent: resolvedIntent,
            timestamp: Math.floor(Date.now() / 1000),
            note: 'No secrets, no customer data. Just the classifyIntent test.',
          }),
        )
      }

      case 'health': {
        if (request.method !== 'GET') return withCors(methodNotAllowed())
        return withCors(
          json({
            status: 'healthy',
            version: '1.0.0',
            timestamp: Math.floor(Date.now() / 1000),
          }),
        )
      }
      case 'widgetConfig': {
        if (request.method !== 'GET') return withCors(methodNotAllowed())
        const [slug] = route.params
        const row = await tenantBySlug(db, slug!)
        if (!row) return withCors(json({ detail: 'Tenant not found' }, 404))
        return withCors(json(buildWidgetConfig(row)))
      }
      case 'widgetChat': {
        if (request.method !== 'POST') return withCors(methodNotAllowed())
        const [slug] = route.params
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
        return withCors(
          await handleChat(db, env, slug!, {
            message: typeof body?.message === 'string' ? body.message : undefined,
            conversation_id:
              typeof body?.conversation_id === 'string' ? body.conversation_id : null,
            session_id: typeof body?.session_id === 'string' ? body.session_id : null,
          }),
        )
      }
      case 'widgetHistory': {
        if (request.method !== 'GET') return withCors(methodNotAllowed())
        const [slug] = route.params
        const conversationId = url.searchParams.get('conversation_id') || ''
        if (!conversationId) return withCors(json({ detail: 'conversation_id is required' }, 400))
        const conv = await query(
          db,
          `SELECT c.id FROM conversations c
           JOIN tenants t ON c.tenant_id = t.id
           WHERE c.id = ? AND t.slug = ? AND t.plan != 'deleted'`,
          [conversationId, slug!],
        )
        if (!conv.rows.length) return withCors(json({ detail: 'Conversation not found' }, 404))
        const msgs = await query(
          db,
          `SELECT id, role, content, intent, created_at
           FROM messages WHERE conversation_id = ? ORDER BY created_at`,
          [conversationId],
        )
        return withCors(
          json({
            conversation_id: conversationId,
            messages: msgs.rows.map((r) => ({
              id: rowString(r, 'id'),
              role: rowString(r, 'role'),
              content: rowString(r, 'content'),
              intent: (r['intent'] as string | null) || null,
              created_at: Number(r['created_at'] || 0),
            })),
          }),
        )
      }
      case 'adminAnalytics': {
        const denied = await authorize(request, env)
        if (denied) return withCors(denied)
        if (request.method === 'GET') return withCors(await getAnalytics(db))
        return withCors(methodNotAllowed())
      }
      case 'adminTenants': {
        const denied = await authorize(request, env)
        if (denied) return withCors(denied)
        if (request.method === 'GET') return withCors(await listTenants(db))
        if (request.method === 'POST')
          return withCors(await createTenant(db, await request.text()))
        return withCors(methodNotAllowed())
      }
      case 'adminTenant': {
        const denied = await authorize(request, env)
        if (denied) return withCors(denied)
        const [tenantId] = route.params
        if (request.method === 'GET') return withCors(await getTenant(db, tenantId!))
        if (request.method === 'DELETE') return withCors(await deleteTenant(db, tenantId!))
        if (request.method === 'PATCH')
          return withCors(await updateTenant(db, tenantId!, await request.text()))
        return withCors(methodNotAllowed())
      }
      case 'adminTenantKnowledge': {
        const denied = await authorize(request, env)
        if (denied) return withCors(denied)
        const [tenantId] = route.params
        if (request.method === 'POST')
          return withCors(await uploadKnowledgeText(db, env, tenantId!, await request.text()))
        if (request.method === 'GET')
          return withCors(await getKnowledge(db, tenantId!))
        return withCors(methodNotAllowed())
      }
      case 'adminTenantKnowledgeSource': {
        const denied = await authorize(request, env)
        if (denied) return withCors(denied)
        const [tenantId, sourceId] = route.params
        if (request.method === 'DELETE')
          return withCors(await deleteKnowledge(db, tenantId!, sourceId!))
        return withCors(methodNotAllowed())
      }
      default:
        return withCors(notFound())
    }
  },
}
// trigger deploy
