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
  KB_UNAVAILABLE_MESSAGE,
  LIMIT_MESSAGE,
  type Env,
} from './config'
import {
  getAvailability,
  bookAndNotify,
  ensureEndUser,
  ApptConflict,
  ApptClosed,
  ApptHorizon,
  bookingHorizon,
  slotDuration,
  localMidnightEpoch,
  localIsoDate,
  isoToDayOffset,
} from './appointments'
import { cancelAppointment } from './cancel'
import { formatSlot } from './email'

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

// --- Interactive cards ---

export interface CardAction {
  label: string
  send_message?: string
  mailto?: string
  url?: string
  open_slots?: boolean
  input?: boolean
  placeholder?: string
  send_template?: string
}

export interface Card {
  id: string
  kind: 'quick_replies' | 'contact_card' | 'booking_prompt' | 'cancel_lookup' | 'booking_confirm' | 'cancel_confirm' | 'explore_services' | 'pricing_guide' | 'talk_to_human'
  title?: string
  subtitle?: string
  chips?: string[]
  actions?: CardAction[]
  when?: string
  email?: string
  service?: string
  cancelled_when?: string
  calendar_url?: string
  _persist?: boolean
}

function cardsEnabled(settings: Record<string, unknown>): boolean {
  return settings['cards_enabled'] !== false
}

function emitCard(
  send: (payload: Record<string, unknown>) => void,
  card: Card,
  settings: Record<string, unknown>,
  db: Client,
  tenantId: string,
): void {
  if (!cardsEnabled(settings)) return
  const { _persist, ...wire } = card
  void _persist
  send({ type: 'card', card: wire })
  void query(
    db,
    `INSERT INTO usage_logs (id, tenant_id, event_type, metadata, created_at)
     VALUES (?, ?, 'card_sent', ?, ?)`,
    [crypto.randomUUID(), tenantId, JSON.stringify({ kind: card.kind, card_id: card.id }), Math.floor(Date.now() / 1000)],
  ).catch(() => {})
}

// --- Card definitions ---

function bookingPromptCard(): Card {
  return {
    id: `card_${crypto.randomUUID()}`,
    kind: 'booking_prompt',
    title: 'Let\’s find a time',
    subtitle: 'Pick when works for you \— I\’ll show the open slots.',
    actions: [
      { label: 'Today', send_message: 'What times are available today?' },
      { label: 'Tomorrow', send_message: 'What times are available tomorrow?' },
      { label: 'This week', send_message: 'What times are you available this week?' },
    ],
  }
}

function cancelLookupCard(): Card {
  return {
    id: `card_${crypto.randomUUID()}`,
    kind: 'cancel_lookup',
    title: 'Find your booking',
    subtitle: 'Enter the email you booked with and I\’ll look it up.',
    actions: [
      {
        label: 'Cancel booking',
        input: true,
        placeholder: 'you@email.com',
        send_template: 'Cancel my appointment {value}',
      },
    ],
  }
}

function gcalUrl(startTs: number, endTs: number, title: string, tzName: string): string {
  const fmt = (ts: number) =>
    new Date(ts * 1000).toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}/, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${title} \— ${formatSlot(startTs, tzName)}`,
    dates: `${fmt(startTs)}/${fmt(endTs)}`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function bookingConfirmCard(
  startTs: number,
  endTs: number,
  title: string,
  email: string,
  name: string,
  tzName: string,
  tenantName: string,
): Card {
  return {
    id: `card_${crypto.randomUUID()}`,
    kind: 'booking_confirm',
    title: name ? `You\’re booked, ${name}` : 'You\’re booked',
    subtitle: `A confirmation email is on its way to ${email}.`,
    when: formatSlot(startTs, tzName),
    service: title,
    email,
    calendar_url: gcalUrl(startTs, endTs, title, tzName),
    actions: [
      { label: 'Add to Google Calendar', url: gcalUrl(startTs, endTs, title, tzName) },
      { label: 'Book another time', send_message: 'What times are you available this week?' },
    ],
  }
}

function cancelConfirmCard(when: string, tenantName: string): Card {
  return {
    id: `card_${crypto.randomUUID()}`,
    kind: 'cancel_confirm',
    title: 'Appointment cancelled',
    subtitle: `Your ${when} slot at ${tenantName} has been freed up.`,
    cancelled_when: when,
    actions: [
      { label: 'Book a new time', send_message: 'What times are you available this week?' },
    ],
  }
}

// New interesting cards

function exploreServicesCard(tenantName: string): Card {
  return {
    id: `card_${crypto.randomUUID()}`,
    kind: 'explore_services',
    title: 'What we can do for you',
    subtitle: `Whether you need a simple page or a full website, we build it custom. Here's a quick peek —`,
    chips: [
      'What\’s included in Starter?',
      'Tell me about Professional',
      'What\’s in Premium?',
      'Do you redesign sites?',
      'Can you build a landing page?',
    ],
    actions: [
      { label: '\\u201cWhat\’s your pricing?\\u201d', send_message: 'How much does a website cost?' },
      { label: 'Book a free chat', send_message: 'I want to talk about my project' },
    ],
    _persist: true,
  }
}

function pricingGuideCard(tenantName: string): Card {
  return {
    id: `card_${crypto.randomUUID()}`,
    kind: 'pricing_guide',
    title: 'Transparent pricing, no surprises',
    subtitle: `Three packages to fit where you\’re at. Every one is custom-designed — no templates.`,
    chips: [
      'What\’s the cheapest option?',
      'Which package is best for me?',
      'Do you offer payment plans?',
      'What\’s included in each?',
    ],
    actions: [
      { label: 'Compare all packages', send_message: 'Tell me about your packages' },
    ],
    _persist: true,
  }
}

function talkToHumanCard(tenantName: string, settings: Record<string, unknown>): Card {
  const actions: CardAction[] = []
  const email = typeof settings['notification_email'] === 'string' ? settings['notification_email'] : ''
  if (email) actions.push({ label: `Email ${tenantName}`, mailto: email })
  actions.push({ label: 'Book a call', send_message: 'I want to schedule a call' })
  return {
    id: `card_${crypto.randomUUID()}`,
    kind: 'talk_to_human',
    title: `Let\’s talk it through`,
    subtitle: `If you\’d rather discuss your project directly — we\’re here. No pressure, just a friendly chat about what you need.`,
    actions,
    _persist: true,
  }
}

// --- Chip rotation ---

const GENERIC_CHIPS = [
  'What are your opening hours?',
  'What services do you offer?',
  'How much does it cost?',
  'Where are you located?',
  'How do I get in touch?',
  'Can you redesign my site?',
  'What\’s your process like?',
  'Do you work with international clients?',
  'How long does a project take?',
  'Do you include SEO?',
]

function normChip(s: string): string {
  return s.trim().toLowerCase().replace(/\\s+/g, ' ').replace(/[?!.]+$/, '')
}

function chipPool(settings: Record<string, unknown>): string[] {
  const configured = Array.isArray(settings['quick_replies'])
    ? (settings['quick_replies'] as unknown[]).filter(
        (q): q is string => typeof q === 'string' && q.trim().length > 0 && !/book/i.test(q),
      )
    : []
  const seen = new Set<string>()
  const pool: string[] = []
  for (const chip of [...configured, ...GENERIC_CHIPS]) {
    const key = normChip(chip)
    if (key && !seen.has(key)) {
      seen.add(key)
      pool.push(chip)
    }
  }
  return pool
}

async function chipUsage(
  db: Client,
  conversationId: string,
): Promise<{ clicked: Set<string>; shown: Set<string> }> {
  const clicked = new Set<string>()
  const shown = new Set<string>()
  try {
    const users = await query(
      db,
      `SELECT content FROM messages WHERE conversation_id = ? AND role = 'user'`,
      [conversationId],
    )
    for (const r of users.rows) {
      const content = rowString(r, 'content')
      if (content) clicked.add(normChip(content))
    }
    const cardRows = await query(
      db,
      `SELECT tool_calls FROM messages
       WHERE conversation_id = ? AND role = 'assistant' AND tool_calls IS NOT NULL
       ORDER BY created_at DESC LIMIT 10`,
      [conversationId],
    )
    for (const r of cardRows.rows) {
      const raw = rowString(r, 'tool_calls')
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as { card?: Card }
        for (const chip of parsed.card?.chips ?? []) shown.add(normChip(chip))
      } catch {}
    }
  } catch {}
  return { clicked, shown }
}

function pickChips(pool: string[], clicked: Set<string>, shown: Set<string>, count: number): string[] {
  const fresh = pool.filter((c) => !clicked.has(normChip(c)) && !shown.has(normChip(c)))
  const ranked = fresh.length >= count ? fresh : [...fresh, ...pool.filter((c) => !clicked.has(normChip(c)))]
  const out: string[] = []
  for (const chip of ranked) {
    if (out.length >= count) break
    if (!out.some((o) => normChip(o) === normChip(chip))) out.push(chip)
  }
  return out
}

// --- Intent-based card builders ---

const unclearStreaks = new Map<string, number>()

async function buildCardForIntent(
  db: Client,
  intent: string,
  settings: Record<string, unknown>,
  tenantName: string,
  conversationId: string,
): Promise<Card | null> {
  if (!cardsEnabled(settings)) return null
  if (intent === 'unclear') {
    const streak = unclearStreaks.get(conversationId) ?? 0
    if (streak >= 3) {
      return talkToHumanCard(tenantName, settings)
    }
    const { clicked, shown } = await chipUsage(db, conversationId)
    const chips = pickChips(chipPool(settings), clicked, shown, 3)
    return {
      id: `card_${crypto.randomUUID()}`,
      kind: 'quick_replies',
      title: 'Pick a topic',
      subtitle: 'Or just type your question',
      chips,
      actions: [{ label: 'Book an appointment', open_slots: true }],
      _persist: true,
    }
  }
  if (intent === 'transfer_human') {
    return talkToHumanCard(tenantName, settings)
  }
  return null
}

// --- Enhanced follow-up card with smart sequencing ---

async function followUpCard(
  db: Client,
  conversationId: string,
  settings: Record<string, unknown>,
  lastIntent: string,
): Promise<Card> {
  const { clicked, shown } = await chipUsage(db, conversationId)
  
  // Smart sequencing: different cards based on what we just talked about
  if (lastIntent === 'general_query' || lastIntent === 'unclear') {
    const chips = pickChips(chipPool(settings), clicked, shown, 3)
    return {
      id: `card_${crypto.randomUUID()}`,
      kind: 'quick_replies',
      title: 'Want to know more?',
      subtitle: 'Here are some things you can explore next —',
      chips,
      actions: [
        { label: 'See what we can do', send_message: 'What services do you offer?' },
        { label: 'Talk to a person', send_message: 'I want to talk to someone' },
      ],
      _persist: true,
    }
  }
  
  const chips = pickChips(chipPool(settings), clicked, shown, 2)
  return {
    id: `card_${crypto.randomUUID()}`,
    kind: 'quick_replies',
    title: 'Anything else?',
    chips,
    actions: [{ label: 'Book an appointment', open_slots: true }],
    _persist: true,
  }
}

function contactActions(tenantName: string, settings: Record<string, unknown>): CardAction[] {
  const actions: CardAction[] = []
  const email = typeof settings['notification_email'] === 'string' ? settings['notification_email'] : ''
  if (email) actions.push({ label: `Email ${tenantName}`, mailto: email })
  actions.push({ label: 'Book an appointment', send_message: 'Book an appointment' })
  return actions
}

async function loadTenant(db: Client, slug: string): Promise<TenantCtx | null> {
  const row = await tenantBySlug(db, slug)
  if (!row) return null
  return {
    id: rowString(row, 'id'),
    slug: rowString(row, 'slug'),
    name: rowString(row, 'name'),
    settings: parseJson(rowString(row, 'settings', '{}'), {}),
    config: undefined as unknown as WidgetConfig,
  }
}

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

export async function handleChat(
  db: Client,
  env: Env,
  slug: string,
  body: ChatRequestBody,
): Promise<Response> {
  const message = (body.message || '').trim()
  if (!message) return json({ detail: 'message is required' }, 400)
  if (message.length > 4000) return json({ detail: 'message too long (max 4000 chars)' }, 400)

  const row = await tenantBySlug(db, slug)
  if (!row) return json({ detail: 'Tenant not found' }, 404)
  
  const tenantId = rowString(row, 'id')
  const settings = parseJson<Record<string, unknown>>(rowString(row, 'settings', '{}'), {})
  const now = Math.floor(Date.now() / 1000)
  let conversationId = body.conversation_id || ''

  if (conversationId) {
    const exists = await query(db, 'SELECT 1 FROM conversations WHERE id = ? LIMIT 1', [conversationId])
    if (!exists.rows.length) conversationId = ''
  }

  if (!conversationId) {
    conversationId = crypto.randomUUID()
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

  const configuredChips = Array.isArray(settings['quick_replies'])
    ? (settings['quick_replies'] as unknown[]).filter(
        (q): q is string => typeof q === 'string' && q.trim().length > 0,
      )
    : []
  const matchedChip = configuredChips.find((c) => normChip(c) === normChip(message))
  let intent = 'unclear'
  let quotaExceeded = false
  const throttled = !chatAllowed(slug, env)
  if (!throttled) {
    if (matchedChip) {
      intent = /book|appointment|schedule|slot/i.test(matchedChip)
        ? 'book_appointment'
        : 'general_query'
    } else {
      try {
        intent = await classifyIntent(env, message)
      } catch (e) {
        quotaExceeded = e instanceof LLMError && e.status === 429
        intent = 'unclear'
      }
    }
  }
  
  await query(
    db,
    `INSERT INTO usage_logs (id, tenant_id, event_type, metadata, created_at)
     VALUES (?, ?, 'message', ?, ?)`,
    [crypto.randomUUID(), tenantId, JSON.stringify({ intent }), now],
  )

  if (!throttled && intent !== 'unclear') {
    unclearStreaks.delete(conversationId)
  }

  const prevMessages: { role: 'user' | 'assistant'; text: string }[] = []
  if (conversationId) {
    try {
      const hist = await query(
        db,
        `SELECT role, content FROM messages
         WHERE conversation_id = ? AND role IN ('user', 'assistant')
         ORDER BY created_at ASC`,
        [conversationId],
      )
      for (const r of hist.rows) {
        const role = rowString(r, 'role')
        const content = rowString(r, 'content')
        if (role && content && role !== 'system') {
          prevMessages.push({ role: role as 'user' | 'assistant', text: content })
        }
      }
      if (prevMessages.length > 20) {
        prevMessages.splice(0, prevMessages.length - 20)
      }
    } catch {}
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = ''
      let card: Card | null = null
      const send = (payload: Record<string, unknown>) => {
        const frame = `data: ${JSON.stringify(payload)}\
\
`
        full += (payload['content'] as string) || ''
        controller.enqueue(encoder.encode(frame))
      }
      const sendCard = (c: Card) => {
        emitCard(send, c, settings, db, tenantId)
      }
      
      try {
        if (throttled || quotaExceeded) {
          send({ type: 'content', content: LIMIT_MESSAGE })
        } else if (intent === 'general_query') {
          let hits: Awaited<ReturnType<typeof search>> = []
          try {
            hits = await search(db, env, tenantId, message)
          } catch (e) {
            console.error(`[general_query] search failed: ${e instanceof Error ? e.message : String(e)}`)
          }

          if (hits.length > 0) {
            const context = hits.map((h) => h.content)
            try {
              for await (const chunk of synthesizeAnswer(env, message, context, prevMessages)) {
                send({ type: 'content', content: chunk })
              }
            } catch (e) {
              console.error(`[synthesizeAnswer] failed: ${e instanceof Error ? e.message : String(e)}`)
              if (!full) {
                send({ type: 'content', content: "I'm having trouble pulling that up — want to try asking differently?" })
              }
            }
          } else {
            try {
              for await (const chunk of synthesizeAnswer(env, message, [], prevMessages)) {
                send({ type: 'content', content: chunk })
              }
            } catch (e) {
              console.error(`[chat] failed: ${e instanceof Error ? e.message : String(e)}`)
              if (!full) {
                send({ type: 'content', content: "Hmm, I'm not sure what to say about that. Want to talk about something else?" })
              }
            }
          }

          if (!card) {
            card = await followUpCard(db, conversationId, settings, intent)
            sendCard(card)
          }
        } else if (intent === 'book_appointment') {
          card = await handleBook(db, row, conversationId, message, send, settings)
          if (card) sendCard(card)
        } else if (intent === 'check_availability') {
          const tzName = rowString(row, 'timezone', 'UTC')
          const hint = resolveDateIso(message, tzName)
          let slots: Awaited<ReturnType<typeof getAvailability>> = []
          if (hint) {
            const horizon = bookingHorizon(row)
            const off = isoToDayOffset(hint, tzName)
            if (off !== null && off > horizon) {
              send({ type: 'content', content: `That date is beyond our ${horizon}-day booking window. Please pick a date within the next ${horizon} days.` })
            } else {
              slots = await getAvailability(db, row, { date: hint })
            }
          } else {
            slots = await getAvailability(db, row, { days: 7 })
          }
          if (slots.length) {
            send({ type: 'slots', slots })
            send({ type: 'content', content: 'Here are the available times. Click one to book, or tell me your preferred day and time.' })
          } else if (hint) {
            send({ type: 'content', content: "I couldn't find any available times on that day — it may be a day the business is closed. Try another date or this week's slots." })
          } else {
            send({ type: 'content', content: "I couldn't find any available slots in the next week. Please check back soon or contact the team directly." })
          }
          if (!slots.length) {
            card = await followUpCard(db, conversationId, settings, intent)
            sendCard(card)
          }
        } else if (intent === 'cancel_appointment') {
          card = await handleCancel(db, row, message, send, settings)
          if (card) sendCard(card)
        } else if (intent === 'transfer_human') {
          send({ type: 'content', content: "I'll make sure someone from the team reaches out to you shortly. Is there anything else I can help with in the meantime?" })
          card = await buildCardForIntent(db, intent, settings, rowString(row, 'name'), conversationId)
          if (card) sendCard(card)
        } else if (intent === 'greeting') {
          send({ type: 'content', content: "Hey there! 👋 Great to meet you! I'm here to chat and help out. Whether you've got questions about websites, want to bounce ideas around, or just feel like chatting — I'm game. What's on your mind?" })
          const welcomeCard = exploreServicesCard(rowString(row, 'name'))
          sendCard(welcomeCard)
          card = welcomeCard
        } else if (intent === 'general_query') {
          let hits: Awaited<ReturnType<typeof search>> = []
          try {
            hits = await search(db, env, tenantId, message)
          } catch (e) {
            console.error(`[general_query] search failed: ${e instanceof Error ? e.message : String(e)}`)
          }

          if (hits.length > 0) {
            const context = hits.map((h) => h.content)
            try {
              for await (const chunk of synthesizeAnswer(env, message, context, prevMessages)) {
                send({ type: 'content', content: chunk })
              }
            } catch (e) {
              console.error(`[synthesizeAnswer] failed: ${e instanceof Error ? e.message : String(e)}`)
              if (!full) {
                send({ type: 'content', content: "I'm having trouble pulling that up — want to try asking differently?" })
              }
            }
          } else {
            try {
              for await (const chunk of synthesizeAnswer(env, message, [], prevMessages)) {
                send({ type: 'content', content: chunk })
              }
            } catch (e) {
              console.error(`[chat] failed: ${e instanceof Error ? e.message : String(e)}`)
              if (!full) {
                send({ type: 'content', content: "Hmm, I'm not sure what to say about that. Want to talk about something else?" })
              }
            }
          }

          if (!card) {
            card = await followUpCard(db, conversationId, settings, intent)
            sendCard(card)
          }
        } else {
          let hits: Awaited<ReturnType<typeof search>> = []
          try {
            hits = await search(db, env, tenantId, message)
          } catch (e) {
            console.error(`[unclear] search failed: ${e instanceof Error ? e.message : String(e)}`)
            hits = []
          }
          if (hits.length) {
            try {
              for await (const chunk of synthesizeAnswer(env, message, hits.map((h) => h.content), prevMessages)) {
                send({ type: 'content', content: chunk })
              }
              intent = 'general_query'
            } catch (e) {
              console.error(`[synthesizeAnswer] failed: ${e instanceof Error ? e.message : String(e)}`)
              if (!full) {
                send({ type: 'content', content: "I'm having trouble pulling that up — want to try asking differently?" })
              }
            }
            card = await followUpCard(db, conversationId, settings, intent)
            sendCard(card)
          } else {
            try {
              for await (const chunk of synthesizeAnswer(env, message, [], prevMessages)) {
                send({ type: 'content', content: chunk })
              }
            } catch (e) {
              console.error(`[chat-unclear] failed: ${e instanceof Error ? e.message : String(e)}`)
              if (!full) {
                send({ type: 'content', content: "Hmm, not sure about that one. Want to chat about something else?" })
              }
            }
          }
        }

        const assistantMsg = full.trim()
        if (assistantMsg) {
          const toolCalls = card && card._persist ? JSON.stringify({ card }) : null
          await query(
            db,
            `INSERT INTO messages (id, conversation_id, role, content, intent, tool_calls, created_at)
             VALUES (?, ?, 'assistant', ?, ?, ?, ?)`,
            [crypto.randomUUID(), conversationId, assistantMsg, intent, toolCalls, now],
          )
          await query(db, 'UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId])
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
          send({ type: 'content', content: 'Sorry, something went wrong. Please try again in a moment.' })
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

const TELEMETRY_EVENTS = new Set(['card_clicked', 'picker_opened', 'slot_chosen'])

export async function handleTelemetry(
  db: Client,
  slug: string,
  body: Record<string, unknown> | null,
): Promise<Response> {
  const tenant = await tenantBySlug(db, slug)
  if (!tenant) return json({ detail: 'Tenant not found' }, 404)
  const tenantId = rowString(tenant, 'id')
  const event = typeof body?.['event'] === 'string' ? body['event'] : ''
  if (!TELEMETRY_EVENTS.has(event)) {
    return json({ detail: 'unknown event' }, 400)
  }
  const kind = typeof body?.['kind'] === 'string' ? (body['kind'] as string).slice(0, 60) : null
  const label = typeof body?.['label'] === 'string' ? (body['label'] as string).slice(0, 120) : null
  const source = typeof body?.['source'] === 'string' ? (body['source'] as string).slice(0, 40) : null
  const meta: Record<string, unknown> = { event }
  if (kind) meta['kind'] = kind
  if (label) meta['label'] = label
  if (source) meta['source'] = source
  try {
    await query(
      db,
      `INSERT INTO usage_logs (id, tenant_id, event_type, metadata, created_at)
       VALUES (?, ?, 'widget_event', ?, ?)`,
      [crypto.randomUUID(), tenantId, JSON.stringify(meta), Math.floor(Date.now() / 1000)],
    )
  } catch (e) {
    console.error('[telemetry] insert failed:', e instanceof Error ? e.message : String(e))
  }
  return new Response(null, { status: 204 })
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isoFromYMD(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  if (y >= 0 && y < 100) y += 2000
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${pad2(y)}-${pad2(m)}-${pad2(d)}`
}

function monthNum(word: string): number | null {
  const names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const i = names.indexOf(word.toLowerCase().slice(0, 3))
  return i >= 0 ? i + 1 : null
}

function weekdayNum(word: string): number {
  const map: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
  }
  const k = word.toLowerCase()
  return k in map ? map[k]! : -1
}

function rollForward(y: number, m: number, d: number, tzName: string, explicitYear: boolean): string | null {
  const base = isoFromYMD(y, m, d)
  if (!base) return null
  if (explicitYear || base >= localIsoDate(0, tzName)) return base
  return isoFromYMD(y + 1, m, d) ?? base
}

function resolveDateIso(message: string, tzName: string): string | null {
  const iso = message.match(/\\b(\\d{4})-(\\d{2})-(\\d{2})\\b/)
  if (iso) return isoFromYMD(+iso[1]!, +iso[2]!, +iso[3]!)

  const monthFirst = message.match(/\\b([a-zA-Z]{3,9})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b/i)
  if (monthFirst) {
    const mi = monthNum(monthFirst[1]!)
    if (mi) {
      const iso2 = rollForward(monthFirst[3] ? +monthFirst[3] : new Date().getFullYear(), mi, +monthFirst[2]!, tzName, Boolean(monthFirst[3]))
      if (iso2) return iso2
    }
  }
  const dayFirst = message.match(/\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?([a-zA-Z]{3,9})\\b(?:\\s*,?\\s*(\\d{4}))?/i)
  if (dayFirst) {
    const mi = monthNum(dayFirst[2]!)
    if (mi) {
      const iso2 = rollForward(dayFirst[3] ? +dayFirst[3] : new Date().getFullYear(), mi, +dayFirst[1]!, tzName, Boolean(dayFirst[3]))
      if (iso2) return iso2
    }
  }
  const slash = message.match(/\\b(\\d{1,2})\\s*[/.]\\s*(\\d{1,2})(?:\\s*[/.]\\s*(\\d{2,4}))?\\b/)
  if (slash) {
    const p1 = +slash[1]!
    const p2 = +slash[2]!
    const y = slash[3] ? +slash[3] : new Date().getFullYear()
    if (p1 > 12) return rollForward(y, p2, p1, tzName, Boolean(slash[3]))
    if (p2 > 12) return rollForward(y, p1, p2, tzName, Boolean(slash[3]))
    return rollForward(y, p1, p2, tzName, Boolean(slash[3]))
  }
  const wd = message.match(/\\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\\b/i)
  if (wd) {
    const want = weekdayNum(wd[1]!)
    const todayIso = localIsoDate(0, tzName)
    const todayEpoch = localMidnightEpoch(todayIso, tzName)
    const todayIdx = new Date(todayEpoch * 1000).getUTCDay()
    const diff = (((want - todayIdx) % 7) + 7) % 7 || 7
    const when = new Date((todayEpoch + diff * 86400) * 1000)
    return isoFromYMD(when.getUTCFullYear(), when.getUTCMonth() + 1, when.getUTCDate())
  }
  if (/\\btomorrow\\b/i.test(message)) {
    const todayEpoch = localMidnightEpoch(localIsoDate(0, tzName), tzName)
    const when = new Date((todayEpoch + 86400) * 1000)
    return isoFromYMD(when.getUTCFullYear(), when.getUTCMonth() + 1, when.getUTCDate())
  }
  if (/\\btoday\\b/i.test(message)) {
    return localIsoDate(0, tzName)
  }
  return null
}

function resolveTime(message: string): { hour: number; minute: number } | null {
  const at = message.match(/\\bat\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?/i)
  const colon = at ? null : message.match(/\\b(\\d{1,2}):(\\d{2})\\s*(am|pm)?/i)
  const bare = at || colon ? null : message.match(/\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b/i)
  const m = at || colon || bare
  if (!m) return null
  let hour = parseInt(m[1] ?? '0', 10)
  const minuteRaw = m[2] && /^\\d{1,2}$/.test(m[2]) ? m[2] : null
  const minute = minuteRaw ? parseInt(minuteRaw, 10) : 0
  const ampm = (m[3] || '').toLowerCase()
  if (ampm === 'pm' && hour < 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

function parseBooking(
  message: string,
  tzName: string,
  slotDurationMin: number,
): { start: number; end: number; email: string | null; name: string } | null {
  const emailMatch = message.match(EMAIL_RE)
  const email = emailMatch ? emailMatch[0] : null
  const nameMatch = message.match(/\\b(?:for|name(?:d)?)\\s+([A-Za-z][A-Za-z .'’-]{1,40})/i)
  const name = nameMatch ? nameMatch[1]!.replace(/\\s+/g, ' ').trim() : ''
  const iso = resolveDateIso(message, tzName)
  const time = resolveTime(message)
  if (!iso || !time) return null
  const start = localMidnightEpoch(iso, tzName) + time.hour * 3600 + time.minute * 60
  const end = start + slotDurationMin * 60
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { start, end, email, name }
}

async function handleCancel(
  db: Client,
  tenant: Awaited<ReturnType<typeof tenantBySlug>>,
  message: string,
  send: (payload: Record<string, unknown>) => void,
  settings: Record<string, unknown>,
): Promise<Card | null> {
  if (!tenant) return null
  const tzName = rowString(tenant, 'timezone', 'UTC')
  const emailMatch = message.match(EMAIL_RE)
  const email = emailMatch ? emailMatch[0] : null
  const dateIso = resolveDateIso(message, tzName)
  if (!email) {
    send({ type: 'content', content: 'I can help you cancel — which email did you book with? (I\'ll cancel the next upcoming appointment on it.)' })
    const lookup = cancelLookupCard()
    emitCard(send, lookup, settings, db, rowString(tenant, 'id'))
    return lookup
  }
  const outcome = await cancelAppointment(db, tenant, settings, { email: email || '', dateIso: dateIso ?? undefined })
  if (!outcome) {
    send({ type: 'content', content: "I couldn't find an upcoming appointment for that email. Double-check the address, or contact the team directly." })
    return null
  }
  const when = formatSlot(outcome.appointment.start_time, tzName)
  const emailNote = outcome.notify.ok
    ? 'A cancellation confirmation is on its way.'
    : 'We were unable to email a cancellation confirmation — the team has been notified.'
  send({ type: 'content', content: `Your ${when} appointment has been cancelled. ${emailNote}` })
  return cancelConfirmCard(when, rowString(tenant, 'name'))
}

async function handleBook(
  db: Client,
  tenant: Awaited<ReturnType<typeof tenantBySlug>>,
  conversationId: string,
  message: string,
  send: (payload: Record<string, unknown>) => void,
  settings: Record<string, unknown>,
): Promise<Card | null> {
  if (!tenant) {
    send({ type: 'content', content: "I couldn't find the business to book with." })
    return null
  }
  const tzName = rowString(tenant, 'timezone', 'UTC')
  const parsed = parseBooking(message, tzName, slotDuration(tenant))
  const emailMatch = message.match(EMAIL_RE)
  const email = parsed?.email || (emailMatch ? emailMatch[0] : null)

  if (!parsed || !email) {
    if (!parsed) {
      send({ type: 'content', content: 'I can book that for you. Could you tell me which day and time you prefer (e.g. "book Friday 2pm")?' })
      const prompt = bookingPromptCard()
      emitCard(send, prompt, settings, db, rowString(tenant, 'id'))
      return prompt
    } else {
      send({ type: 'content', content: 'To send your confirmation, please share your email address (e.g. "book Friday 2pm, me@email.com").' })
    }
    return null
  }

  const dateIso = resolveDateIso(message, tzName)
  const daySlots = dateIso ? await getAvailability(db, tenant, { date: dateIso }) : []
  const exactMatch = daySlots.some((s) => s.start_time === parsed.start)
  if (!exactMatch) {
    if (daySlots.length) send({ type: 'slots', slots: daySlots })
    send({
      type: 'content',
      content: daySlots.length
        ? "That exact time isn't open. Here's what's available that day — tap a time or tell me another."
        : "I couldn't find any open times that day — it may be a day we're closed. Tell me another day and I'll check.",
    })
    return null
  }

  const endUserId = await ensureEndUser(db, tenant, email, parsed.name || undefined)
  try {
    const appt = await bookAndNotify(db, tenant, settings, {
      conversationId,
      endUserId,
      startTime: parsed.start,
      endTime: parsed.end,
      title: 'Appointment',
      customerEmail: email,
      customerName: parsed.name || '',
    })
    const when = formatSlot(parsed.start, tzName)
    send({
      type: 'content',
      content:
        parsed.name
          ? `You're booked for ${when}, ${parsed.name}. A confirmation email is on its way to ${email}.`
          : `You're booked for ${when}. A confirmation email is on its way to ${email}.`,
    })
    return bookingConfirmCard(parsed.start, parsed.end, 'Appointment', email, parsed.name, tzName, rowString(tenant, 'name'))
  } catch (e) {
    if (e instanceof ApptConflict) {
      const slots = dateIso ? await getAvailability(db, tenant, { date: dateIso }) : await getAvailability(db, tenant, { days: 7 })
      if (slots.length) send({ type: 'slots', slots })
      send({ type: 'content', content: 'Sorry, that time was just taken. Pick an available slot below, or tell me another day/time.' })
    } else if (e instanceof ApptHorizon) {
      send({ type: 'content', content: `I couldn't book that — it's outside the ${bookingHorizon(tenant)}-day booking window. Please choose a date within that range.` })
    } else if (e instanceof ApptClosed) {
      send({ type: 'content', content: "I couldn't book that time — the business is closed then. Pick an available slot or ask me for opening times." })
    } else {
      console.error(`[book] ${e instanceof Error ? e.stack || e.message : String(e)}`)
      send({ type: 'content', content: "I couldn't complete the booking. Please try again in a moment." })
    }
    return null
  }
}
