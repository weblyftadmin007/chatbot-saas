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
import { chatModel, embedModel, similarityThreshold, topK } from './config'
import { getDb, query, rowString, ensureSchemaMigrations } from './db'
import { tenantBySlug, tenantById, buildWidgetConfig, parseJson } from './tenants'
import {
  ensureEndUser,
  bookAndNotify,
  getAvailability,
  bookingHorizon,
  ApptConflict,
  ApptClosed,
  ApptHorizon,
  type AvailabilityOptions,
} from './appointments'
import { handleChat, json } from './chat'
import { classifyIntent, embedSingle, generateText, synthesizeAnswer } from './llm'
import { blobToVector, cosineSimilarity } from './vec'
import {
  authorize,
  createTenant,
  deleteKnowledge,
  deleteTenant,
  getAnalytics,
  getKnowledge,
  getTenant,
  listTenantAppointments,
  listTenantConversations,
  listTenants,
  retryAppointmentNotify,
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

const EMAIL_REVALIDATE = (v: string): boolean =>
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v)

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
      if (tail.length === 2 && tail[0] === 'appointments') return { pattern: 'widgetAppointments', params: [tail[1]!] }
      if (tail.length === 3 && tail[0] === 'appointments' && tail[2] === 'availability')
        return { pattern: 'widgetAvailability', params: [tail[1]!] }
      return null
    }
    case '/admin': {
      if (tail.length === 1 && tail[0] === 'analytics') return { pattern: 'adminAnalytics', params: [] }
      if (tail.length === 1 && tail[0] === 'tenants') return { pattern: 'adminTenants', params: [] }
      if (tail.length === 2 && tail[0] === 'tenants') return { pattern: 'adminTenant', params: [tail[1]!] }
      if (tail.length === 3 && tail[0] === 'tenants' && tail[2] === 'knowledge')
        return { pattern: 'adminTenantKnowledge', params: [tail[1]!] }
      if (tail.length === 3 && tail[0] === 'tenants' && tail[2] === 'conversations')
        return { pattern: 'adminTenantConversations', params: [tail[1]!] }
      if (tail.length === 3 && tail[0] === 'tenants' && tail[2] === 'appointments')
        return { pattern: 'adminTenantAppointments', params: [tail[1]!] }
      if (tail.length === 5 && tail[0] === 'tenants' && tail[2] === 'appointments' && tail[4] === 'notify')
        // POST /admin/tenants/:id/appointments/:apptId/notify
        return { pattern: 'adminAppointmentNotify', params: [tail[1]!, tail[3]!] }
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
      if (tail.length === 1 && tail[0] === 'answer') return { pattern: 'debugAnswer', params: [] }
      if (tail.length === 1 && tail[0] === 'search') return { pattern: 'debugSearch', params: [] }
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
    // Idempotent runtime migration (adds notify_status/notify_error if absent).
    await ensureSchemaMigrations(db)

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

      case 'debugAnswer': {
        if (request.method !== 'GET') return withCors(methodNotAllowed())
        const text = (new URL(request.url).searchParams.get('text') || 'Hello').slice(0, 500)
        const chunks: string[] = []
        let error: string | null = null
        try {
          const gen = synthesizeAnswer(env, text, [
            'Sample context chunk about Weblyft Design, a web agency in New Delhi, India.',
          ])
          for await (const c of gen) chunks.push(c)
        } catch (e) {
          error = (e instanceof Error ? e.stack || e.message : String(e)).slice(0, 800)
        }
        return withCors(
          json({
            ok: error === null,
            input: text,
            chunks,
            error,
            timestamp: Math.floor(Date.now() / 1000),
            note: 'Runs synthesizeAnswer stream; surfaces the raw error for debugging.',
          }),
        )
      }

      case 'debugSearch': {
        if (request.method !== 'GET') return withCors(methodNotAllowed())
        const url = new URL(request.url)
        const text = (url.searchParams.get('text') || 'Hello').slice(0, 500)
        const slug = (url.searchParams.get('slug') || 'weblyft-design').slice(0, 100)
        const tenant = await tenantBySlug(db, slug)
        if (!tenant) return withCors(json({ ok: false, error: 'Tenant not found' }, 404))
        const tenantId = rowString(tenant, 'id')

        let queryEmbedding: number[] = []
        let embedError: string | null = null
        try {
          queryEmbedding = await embedSingle(env, text)
        } catch (e) {
          embedError = (e instanceof Error ? e.message : String(e)).slice(0, 400)
        }

        const result = await query(
          db,
          `SELECT id, source_id, content, embedding
           FROM knowledge_chunks WHERE tenant_id = ? AND embedding IS NOT NULL`,
          [tenantId],
        )
        const scored: Array<{
          id: string
          source_id: string
          similarity: number
          dims: number
          content: string
        }> = []
        let emptyBlobs = 0
        const dimsSeen = new Set<number>()
        for (const r of result.rows) {
          const vec = blobToVector(r['embedding'])
          if (!vec || !vec.length) {
            emptyBlobs++
            continue
          }
          dimsSeen.add(vec.length)
          scored.push({
            id: rowString(r, 'id'),
            source_id: rowString(r, 'source_id'),
            content: rowString(r, 'content').slice(0, 100),
            similarity: queryEmbedding.length ? cosineSimilarity(queryEmbedding, vec) : 0,
            dims: vec.length,
          })
        }
        scored.sort((a, b) => b.similarity - a.similarity)

        return withCors(
          json({
            ok: true,
            slug,
            tenant_id: tenantId,
            text,
            query_embedding: {
              ok: embedError === null,
              error: embedError,
              dims: queryEmbedding.length,
            },
            scanned: {
              total_rows: result.rows.length,
              empty_blobs: emptyBlobs,
              dims_seen: [...dimsSeen],
            },
            top_hits: scored.slice(0, 5),
            config: {
              chat_model: chatModel(env),
              embed_model: embedModel(env),
              top_k: topK(env),
              similarity_threshold: similarityThreshold(env),
            },
            timestamp: Math.floor(Date.now() / 1000),
            note: 'Dev diagnostic: raw cosine scores vs the chat pipeline threshold.',
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
      case 'widgetAvailability': {
        if (request.method !== 'GET') return withCors(methodNotAllowed())
        const [slug] = route.params
        const tenant = await tenantBySlug(db, slug!)
        if (!tenant) return withCors(json({ detail: 'Tenant not found' }, 404))
        const qp = url.searchParams
        const date = (qp.get('date') || '').slice(0, 10)
        const dayN = parseInt(qp.get('days') || '', 10)
        const opts: AvailabilityOptions = {}
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) opts.date = date
        else if (Number.isFinite(dayN) && dayN > 0) opts.days = dayN
        else opts.days = 7
        const slots = await getAvailability(db, tenant, opts)
        return withCors(
          json({
            date: opts.date ?? null,
            timezone: rowString(tenant, 'timezone', 'UTC'),
            slot_duration: Number(tenant['slot_duration'] ?? 30),
            buffer_minutes: Number(tenant['buffer_minutes'] ?? 15),
            horizon_days: bookingHorizon(tenant),
            slots,
          }),
        )
      }
      case 'widgetAppointments': {
        if (request.method !== 'POST') return withCors(methodNotAllowed())
        const [slug] = route.params
        const tenant = await tenantBySlug(db, slug!)
        if (!tenant) return withCors(json({ detail: 'Tenant not found' }, 404))
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
        const email =
          typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
        const name = typeof body?.name === 'string' ? body.name.trim() : ''
        const startTime = Number(body?.start_time)
        const endTime = Number(body?.end_time)
        const title = typeof body?.title === 'string' ? body.title : 'Appointment'
        if (!email || !EMAIL_REVALIDATE(email)) {
          return withCors(json({ detail: 'A valid email is required' }, 400))
        }
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) {
          return withCors(json({ detail: 'start_time and end_time are required' }, 400))
        }
        const settings = parseJson<Record<string, unknown>>(rowString(tenant, 'settings', '{}'), {})
        const conversationId = crypto.randomUUID()
        const now = Math.floor(Date.now() / 1000)
        await query(
          db,
          `INSERT INTO conversations (id, tenant_id, status, created_at, updated_at)
           VALUES (?, ?, 'active', ?, ?)`,
          [conversationId, rowString(tenant, 'id'), now, now],
        )
        const endUserId = await ensureEndUser(db, tenant, email, name || undefined)
        try {
          const appt = await bookAndNotify(db, tenant, settings, {
            conversationId,
            endUserId,
            startTime,
            endTime,
            title,
            customerEmail: email,
            customerName: name || '',
          })
          return withCors(
            json({
              appointment_id: appt.id,
              status: appt.status,
              start_time: appt.start_time,
              end_time: appt.end_time,
              notify_status: appt.notify.ok ? 'sent' : 'failed',
              notify_error: appt.notify.error || null,
              confirmation_message: 'Appointment booked successfully!',
            }),
          )
        } catch (e) {
          if (e instanceof ApptConflict) {
            return withCors(json({ detail: 'Time slot no longer available' }, 409))
          }
          if (e instanceof ApptClosed || e instanceof ApptHorizon) {
            return withCors(json({ detail: (e as Error).message }, 400))
          }
          throw e
        }
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
      case 'adminTenantConversations': {
        const denied = await authorize(request, env)
        if (denied) return withCors(denied)
        const [tenantId] = route.params
        if (request.method === 'GET')
          return withCors(await listTenantConversations(db, tenantId!))
        return withCors(methodNotAllowed())
      }
      case 'adminTenantAppointments': {
        const denied = await authorize(request, env)
        if (denied) return withCors(denied)
        const [tenantId] = route.params
        if (request.method === 'GET')
          return withCors(await listTenantAppointments(db, tenantId!))
        return withCors(methodNotAllowed())
      }
      case 'adminAppointmentNotify': {
        const denied = await authorize(request, env)
        if (denied) return withCors(denied)
        const [tenantId, apptId] = route.params
        if (request.method !== 'POST') return withCors(methodNotAllowed())
        const tenant = await tenantById(db, tenantId!)
        if (!tenant) return withCors(json({ detail: 'Tenant not found' }, 404))
        const outcome = await retryAppointmentNotify(db, tenant, apptId!)
        if (!outcome) return withCors(json({ detail: 'Appointment not found' }, 404))
        return withCors(
          json({
            appointment_id: outcome.id,
            status: outcome.status,
            notify_status: outcome.notify.ok ? 'sent' : 'failed',
            notify_error: outcome.notify.error || null,
          }),
        )
      }
      default:
        return withCors(notFound())
    }
  },
}
// trigger deploy
