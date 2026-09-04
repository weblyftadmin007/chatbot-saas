/**
 * POST /widget/chat/:slug — streaming chat (port of backend widget.py chat_widget).
 *
 * Wire protocol is identical to the old backend so the widget SDK is unchanged
 * in behavior: SSE `data:` frames of JSON {type: content|slots|done}.
 *
 * Phase 1 scope (see hf-docker-exit-spec.md §8): RAG answers from the tenant
 * knowledge base plus generic replies. Appointment booking / availability
 * intents reply with a friendly "coming soon" note — they land in Phase 2.
 */
import type { Client } from '@libsql/client/web'
import { query, rowString } from './db'
import { tenantBySlug, parseJson, type WidgetConfig } from './tenants'
import { search } from './rag'
import {
  classifyIntent,
  synthesizeAnswer,
  LLMError,
} from './llm'
import {
  BOOKING_PHASE_NOTE,
  KB_UNAVAILABLE_MESSAGE,
  LIMIT_MESSAGE,
  type Env,
} from './config'

const encoder = new TextEncoder()

export interface ChatRequestBody {
  message?: string
  conversation_id?: string | null
  session_id?: string | null
}

interface TenantCtx {
  id: string
  slug: string
  name: string
  settings: Record<string, unknown>
  config: WidgetConfig
}

async function loadTenant(db: Client, slug: string): Promise<TenantCtx | null> {
  const row = await tenantBySlug(db, slug)
  if (!row) return null
  return {
    id: rowString(row, 'id'),
    slug: rowString(row, 'slug'),
    name: rowString(row, 'name'),
    settings: parseJson(rowString(row, 'settings', '{}'), {}),
    config: undefined as unknown as WidgetConfig, // set below
  }
}

// Minimal per-tenant chat self-throttle (in-memory; replace with KV for
// durable daily caps — see spec §5.7).
const rpmWindows = new Map<string, { start: number; count: number }>()
function chatAllowed(tenantSlug: string, env: Env): boolean {
  const max = parseInt(env.LLM_CHAT_RPM || '10', 10)
  if (!max || max <= 0) return true
  const now = Date.now()
  const w = rpmWindows.get(tenantSlug)
  if (!w || now - w.start >= 60_000) {
    rpmWindows.set(tenantSlug, { start: now, count: 1 })
    return true
  }
  w.count += 1
  return w.count <= max
}

/** Main chat handler. Returns a streaming SSE Response. */
export async function handleChat(
  db: Client,
  env: Env,
  slug: string,
  body: ChatRequestBody,
): Promise<Response> {
  const message = (body.message || '').trim()
  if (!message) {
    return json({ detail: 'message is required' }, 400)
  }
  if (message.length > 4000) {
    return json({ detail: 'message too long (max 4000 chars)' }, 400)
  }

  const row = await tenantBySlug(db, slug)
  if (!row) {
    return json({ detail: 'Tenant not found' }, 404)
  }
  const tenantId = rowString(row, 'id')
  const settings = parseJson<Record<string, unknown>>(
    rowString(row, 'settings', '{}'),
    {},
  )
  const now = Math.floor(Date.now() / 1000)
  const conversationId = body.conversation_id || crypto.randomUUID()

  if (!body.conversation_id) {
    await query(
      db,
      `INSERT INTO conversations (id, tenant_id, status, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?)`,
      [conversationId, tenantId, now, now],
    )
  }

  await query(
    db,
    `INSERT INTO messages (id, conversation_id, role, content, created_at)
     VALUES (?, ?, 'user', ?, ?)`,
    [crypto.randomUUID(), conversationId, message, now],
  )

  // Intent classification is best-effort; any failure falls back to unclear.
  let intent = 'unclear'
  const throttled = !chatAllowed(slug, env)
  if (!throttled) {
    try {
      intent = await classifyIntent(env, message)
    } catch {
      intent = 'unclear'
    }
  }
  await query(
    db,
    `INSERT INTO usage_logs (id, tenant_id, event_type, metadata, created_at)
     VALUES (?, ?, 'message', ?, ?)`,
    [crypto.randomUUID(), tenantId, JSON.stringify({ intent }), now],
  )

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = ''
      const send = (payload: Record<string, unknown>) => {
        const frame = `data: ${JSON.stringify(payload)}\n\n`
        full += (payload['content'] as string) || ''
        controller.enqueue(encoder.encode(frame))
      }
      try {
        if (throttled) {
          send({ type: 'content', content: LIMIT_MESSAGE })
        } else if (intent === 'general_query') {
          let hits: Awaited<ReturnType<typeof search>>
          try {
            hits = await search(db, env, tenantId, message)
          } catch (e) {
            const limit = e instanceof LLMError && e.status === 429
            send({ type: 'content', content: limit ? LIMIT_MESSAGE : KB_UNAVAILABLE_MESSAGE })
            hits = []
          }
          if (hits.length) {
            const context = hits.map((h) => h.content)
            try {
              for await (const chunk of synthesizeAnswer(env, message, context)) {
                send({ type: 'content', content: chunk })
              }
            } catch {
              if (!full) {
                send({
                  type: 'content',
                  content:
                    "I'm having trouble answering right now — please try again in a moment.",
                })
              }
            }
          } else {
            send({
              type: 'content',
              content:
                "I don't have that information in my knowledge base. Would you like me to help you with something else?",
            })
          }
        } else if (
          intent === 'book_appointment' ||
          intent === 'check_availability' ||
          intent === 'cancel_appointment'
        ) {
          // Phase 2: appointment availability/booking + email notifications.
          send({ type: 'content', content: BOOKING_PHASE_NOTE })
        } else if (intent === 'transfer_human') {
          send({
            type: 'content',
            content:
              "I'll make sure someone from the team reaches out to you shortly. Is there anything else I can help with in the meantime?",
          })
        } else {
          // unclear
          send({
            type: 'content',
            content:
              "I'm not sure I understand. Could you rephrase that? I can help with answering questions about the business or booking appointments.",
          })
        }

        const assistantMsg = full.trim()
        if (assistantMsg) {
          await query(
            db,
            `INSERT INTO messages (id, conversation_id, role, content, intent, created_at)
             VALUES (?, ?, 'assistant', ?, ?, ?)`,
            [crypto.randomUUID(), conversationId, assistantMsg, intent, now],
          )
          await query(db, 'UPDATE conversations SET updated_at = ? WHERE id = ?', [
            now,
            conversationId,
          ])
        }
        send({
          type: 'done',
          conversation_id: conversationId,
          intent,
          session_id: body.session_id || null,
        })
      } catch (e) {
        console.error('chat stream error:', e)
        if (!full) {
          send({
            type: 'content',
            content:
              'Sorry, something went wrong. Please try again in a moment.',
          })
        }
        send({ type: 'done', conversation_id: conversationId, intent })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
