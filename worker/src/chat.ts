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
  cancelAppointment,
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
  let quotaExceeded = false
  const throttled = !chatAllowed(slug, env)
  if (!throttled) {
    try {
      intent = await classifyIntent(env, message)
    } catch (e) {
      quotaExceeded = e instanceof LLMError && e.status === 429
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
        if (throttled || quotaExceeded) {
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
            } catch (e) {
              console.error(
                `[synthesizeAnswer] failed slug:${slug} | ${e instanceof Error ? e.stack || e.message : String(e)}`,
              )
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
        } else if (intent === 'book_appointment') {
          await handleBook(db, row, conversationId, message, send, settings)
        } else if (intent === 'check_availability') {
          const tzName = rowString(row, 'timezone', 'UTC')
          const hint = resolveDateIso(message, tzName)
          let slots: Awaited<ReturnType<typeof getAvailability>> = []
          if (hint) {
            const horizon = bookingHorizon(row)
            const off = isoToDayOffset(hint, tzName)
            if (off !== null && off > horizon) {
              send({
                type: 'content',
                content: `That date is beyond our ${horizon}-day booking window. Please pick a date within the next ${horizon} days.`,
              })
            } else {
              slots = await getAvailability(db, row, { date: hint })
            }
          } else {
            slots = await getAvailability(db, row, { days: 7 })
          }
          if (slots.length) {
            send({ type: 'slots', slots })
            send({
              type: 'content',
              content:
                'Here are the available times. Click one to book, or tell me your preferred day and time.',
            })
          } else if (hint) {
            send({
              type: 'content',
              content:
                "I couldn't find any available times on that day — it may be a day the business is closed. Try another date or this week's slots.",
            })
          } else {
            send({
              type: 'content',
              content:
                "I couldn't find any available slots in the next week. Please check back soon or contact the team directly.",
            })
          }
        } else if (intent === 'cancel_appointment') {
          await handleCancel(db, row, message, send, settings)
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

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

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

/**
 * Resolve the YYYY-MM-DD (tenant-timezone) date a message refers to, or null.
 * Accepts YYYY-MM-DD, "July 15 (2026)", "15 July", "15/7", "7/15/2026",
 * weekday names (next occurrence), "tomorrow", "today".
 */
/**
 * Roll a parsed month/day forward to the next occurrence when no year was
 * given (handles "July 15" said in December). Explicit years are kept as-is
 * so past dates fail with a clear 'already passed' instead of silently
 * moving a year.
 */
function rollForward(y: number, m: number, d: number, tzName: string, explicitYear: boolean): string | null {
  const base = isoFromYMD(y, m, d)
  if (!base) return null
  if (explicitYear || base >= localIsoDate(0, tzName)) return base
  // No year given and the date is past — try next year (Feb 29 handled by
  // isoFromYMD's validity check).
  return isoFromYMD(y + 1, m, d) ?? base
}

function resolveDateIso(message: string, tzName: string): string | null {
  const iso = message.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return isoFromYMD(+iso[1]!, +iso[2]!, +iso[3]!)

  const monthFirst = message.match(/\b([a-zA-Z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i)
  if (monthFirst) {
    const mi = monthNum(monthFirst[1]!)
    if (mi) {
      const iso2 = rollForward(monthFirst[3] ? +monthFirst[3] : new Date().getFullYear(), mi, +monthFirst[2]!, tzName, Boolean(monthFirst[3]))
      if (iso2) return iso2
    }
  }
  const dayFirst = message.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-zA-Z]{3,9})\b(?:\s*,?\s*(\d{4}))?/i)
  if (dayFirst) {
    const mi = monthNum(dayFirst[2]!)
    if (mi) {
      const iso2 = rollForward(dayFirst[3] ? +dayFirst[3] : new Date().getFullYear(), mi, +dayFirst[1]!, tzName, Boolean(dayFirst[3]))
      if (iso2) return iso2
    }
  }
  const slash = message.match(/\b(\d{1,2})\s*[/.]\s*(\d{1,2})(?:\s*[/.]\s*(\d{2,4}))?\b/)
  if (slash) {
    const p1 = +slash[1]!
    const p2 = +slash[2]!
    const y = slash[3] ? +slash[3] : new Date().getFullYear()
    if (p1 > 12) return rollForward(y, p2, p1, tzName, Boolean(slash[3])) // day-first (dd/mm)
    if (p2 > 12) return rollForward(y, p1, p2, tzName, Boolean(slash[3])) // month-first (mm/dd)
    return rollForward(y, p1, p2, tzName, Boolean(slash[3])) // ambiguous -> month-first (matches widget format)
  }
  const wd = message.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i,
  )
  if (wd) {
    const want = weekdayNum(wd[1]!)
    const todayIso = localIsoDate(0, tzName)
    const todayEpoch = localMidnightEpoch(todayIso, tzName)
    const todayIdx = new Date(todayEpoch * 1000).getUTCDay()
    const diff = (((want - todayIdx) % 7) + 7) % 7 || 7
    const when = new Date((todayEpoch + diff * 86400) * 1000)
    return isoFromYMD(when.getUTCFullYear(), when.getUTCMonth() + 1, when.getUTCDate())
  }
  if (/\btomorrow\b/i.test(message)) {
    const todayEpoch = localMidnightEpoch(localIsoDate(0, tzName), tzName)
    const when = new Date((todayEpoch + 86400) * 1000)
    return isoFromYMD(when.getUTCFullYear(), when.getUTCMonth() + 1, when.getUTCDate())
  }
  if (/\btoday\b/i.test(message)) {
    return localIsoDate(0, tzName)
  }
  return null
}

function resolveTime(message: string): { hour: number; minute: number } | null {
  const at = message.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  const colon = at ? null : message.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?/i)
  const bare = at || colon ? null : message.match(/\b(\d{1,2})\s*(am|pm)\b/i)
  const m = at || colon || bare
  if (!m) return null
  let hour = parseInt(m[1] ?? '0', 10)
  const minute = m[2] ? parseInt(m[2], 10) : 0
  const ampm = (m[3] || '').toLowerCase()
  if (ampm === 'pm' && hour < 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

/**
 * Parse a booking message like "Book 11/5/2026 at 13:00 person@example.com",
 * "book friday 2pm a@b.com", or "book July 15 at 3pm for Alex". Durations
 * follow the tenant's slot_duration — not a hardcoded 30 minutes.
 */
function parseBooking(
  message: string,
  tzName: string,
  slotDurationMin: number,
): { start: number; end: number; email: string | null; name: string } | null {
  const emailMatch = message.match(EMAIL_RE)
  const email = emailMatch ? emailMatch[0] : null
  const nameMatch = message.match(/\b(?:for|name(?:d)?)\s+([A-Za-z][A-Za-z .'’-]{1,40})/i)
  const name = nameMatch ? nameMatch[1]!.replace(/\s+/g, ' ').trim() : ''
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
): Promise<void> {
  if (!tenant) return
  const tzName = rowString(tenant, 'timezone', 'UTC')
  const emailMatch = message.match(EMAIL_RE)
  const email = emailMatch ? emailMatch[0] : null
  const dateIso = resolveDateIso(message, tzName)
  if (!email) {
    send({
      type: 'content',
      content:
        'I can help you cancel — which email did you book with? (I\'ll cancel the next upcoming appointment on it.)',
    })
    return
  }
  const outcome = await cancelAppointment(db, tenant, settings, { email, dateIso })
  if (!outcome) {
    send({
      type: 'content',
      content:
        "I couldn't find an upcoming appointment for that email. Double-check the address, or contact the team directly.",
    })
    return
  }
  const when = formatSlot(outcome.appointment.start_time, tzName)
  const emailNote = outcome.notify.ok
    ? 'A cancellation confirmation is on its way.'
    : 'We were unable to email a cancellation confirmation — the team has been notified.'
  send({
    type: 'content',
    content: `Your ${when} appointment has been cancelled. ${emailNote}`,
  })
}

async function handleBook(
  db: Client,
  tenant: Awaited<ReturnType<typeof tenantBySlug>>,
  conversationId: string,
  message: string,
  send: (payload: Record<string, unknown>) => void,
  settings: Record<string, unknown>,
): Promise<void> {
  if (!tenant) {
    send({ type: 'content', content: "I couldn't find the business to book with." })
    return
  }
  const tzName = rowString(tenant, 'timezone', 'UTC')
  const parsed = parseBooking(message, tzName, slotDuration(tenant))
  const emailMatch = message.match(EMAIL_RE)
  const email = parsed?.email || (emailMatch ? emailMatch[0] : null)

  if (!parsed || !email) {
    if (!parsed) {
      send({
        type: 'content',
        content:
          'I can book that for you. Could you tell me which day and time you prefer (e.g. "book Friday 2pm")?',
      })
    } else {
      send({
        type: 'content',
        content: 'To send your confirmation, please share your email address (e.g. "book Friday 2pm, me@email.com").',
      })
    }
    return
  }

  // Chat times are free-form ("Friday 2pm") and may fall off the tenant's slot
  // grid or already be taken — check against real availability first and offer
  // the day's actual slots instead of attempting a booking that would fail.
  const dateIso = resolveDateIso(message, tzName)
  const daySlots = dateIso ? await getAvailability(db, tenant, { date: dateIso }) : []
  const exactMatch = daySlots.some((s) => s.start_time === parsed.start)
  if (!exactMatch) {
    if (daySlots.length) send({ type: 'slots', slots: daySlots })
    send({
      type: 'content',
      content: daySlots.length
        ? 'That exact time isn\'t open. Here\'s what\'s available that day — tap a time or tell me another.'
        : "I couldn't find any open times that day — it may be a day we're closed. Tell me another day and I'll check.",
    })
    return
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
    // Confirm in the BUSINESS's timezone so the customer sees the local time.
    const when = formatSlot(parsed.start, tzName)
    send({
      type: 'content',
      content:
        parsed.name
          ? `You're booked for ${when}, ${parsed.name}. A confirmation email is on its way to ${email}.`
          : `You're booked for ${when}. A confirmation email is on its way to ${email}.`,
    })
  } catch (e) {
    if (e instanceof ApptConflict) {
      const slots = dateIso
        ? await getAvailability(db, tenant, { date: dateIso })
        : await getAvailability(db, tenant, { days: 7 })
      if (slots.length) send({ type: 'slots', slots })
      send({
        type: 'content',
        content:
          'Sorry, that time was just taken. Pick an available slot below, or tell me another day/time.',
      })
    } else if (e instanceof ApptHorizon) {
      send({
        type: 'content',
        content: `I couldn't book that — it's outside the ${bookingHorizon(tenant)}-day booking window. Please choose a date within that range.`,
      })
    } else if (e instanceof ApptClosed) {
      send({
        type: 'content',
        content:
          "I couldn't book that time — the business is closed then. Pick an available slot or ask me for opening times.",
      })
    } else {
      console.error(`[book] ${e instanceof Error ? e.stack || e.message : String(e)}`)
      send({
        type: 'content',
        content: "I couldn't complete the booking. Please try again in a moment.",
      })
    }
  }
}
