/**
 * Appointment availability + booking (port of backend/app/services/appointments.py).
 *
 * Slots are generated from the tenant's business_hours / timezone / slot_duration
 * / buffer_minutes and exclude already-booked (pending/confirmed) rows. Booking
 * conflict-checks first so two requests can't take the same slot.
 */
import type { Client } from '@libsql/client/web'
import { query, rowString, type SqlRow } from './db'
import { parseJson } from './tenants'
import { notifyBooking, type BookingNotification, type NotifyResult } from './email'

export interface Slot {
  start_time: number
  end_time: number
  available: boolean
}

export interface BookedAppointment {
  id: string
  status: string
  start_time: number
  end_time: number
}

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [h, m] = timeStr.split(':')
  return { hour: parseInt(h ?? '0', 10) || 0, minute: parseInt(m ?? '0', 10) || 0 }
}

/** Return the normalized record shape for business_hours from the tenant row. */
export function businessHours(tenant: SqlRow): Record<string, { open: string | null; close: string | null }> {
  let hours: Record<string, { open: string | null; close: string | null }> = {}
  try {
    const raw = rowString(tenant, 'business_hours', '')
    if (raw) hours = JSON.parse(raw)
  } catch {
    hours = {}
  }
  if (!hours || typeof hours !== 'object') return {}
  return hours
}

const DEFAULT_HOURS: Record<string, { open: string; close: string }> = {
  monday: { open: '09:00', close: '17:00' },
  tuesday: { open: '09:00', close: '17:00' },
  wednesday: { open: '09:00', close: '17:00' },
  thursday: { open: '09:00', close: '17:00' },
  friday: { open: '09:00', close: '17:00' },
  saturday: { open: '', close: '' },
  sunday: { open: '', close: '' },
}

/**
 * Booking window cap (in days) for this tenant. Slots/books outside this are
 * rejected. Tenant setting `booking_horizon_days`, default 60, capped at 365.
 */
export function bookingHorizon(tenant: SqlRow): number {
  const settings = parseJson<Record<string, unknown>>(rowString(tenant, 'settings', '{}'), {})
  const raw = Number(settings['booking_horizon_days'])
  if (Number.isFinite(raw) && raw > 0) return Math.min(Math.floor(raw), 365)
  return 60
}

/** Calendar date (YYYY-MM-DD) of "now + offsetDays" in the given timezone. */
export function localIsoDate(offsetDays: number, tzName: string): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  try {
    return d.toLocaleDateString('en-CA', { timeZone: tzName })
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** Offset (in days from today) whose tz-local calendar date equals `iso`. */
export function isoToDayOffset(iso: string, tzName: string): number | null {
  const targetUtc = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(targetUtc)) return null
  const todayIso = localIsoDate(0, tzName)
  const todayUtc = Date.parse(`${todayIso}T00:00:00Z`)
  const dayMs = 86400000
  const offset = Math.round((targetUtc - todayUtc) / dayMs)
  if (localIsoDate(offset, tzName) === iso) return offset
  for (const alt of [offset - 1, offset + 1]) {
    if (localIsoDate(alt, tzName) === iso) return alt
  }
  return null
}

/** UTC offset in minutes for a timezone at a given instant. */
export function tzOffsetMinutes(utcMs: number, tzName: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      timeZoneName: 'shortOffset',
    })
    const val = dtf.formatToParts(new Date(utcMs)).find((p) => p.type === 'timeZoneName')?.value || ''
    const m = val.match(/GMT?([+-])(\d{2}):?(\d{2})/)
    if (!m) return 0
    const sign = m[1] === '-' ? -1 : 1
    return sign * (parseInt(m[2] ?? '0', 10) * 60 + parseInt(m[3] ?? '0', 10))
  } catch {
    return 0
  }
}

/** Epoch (seconds) of tenant-local midnight for a calendar date. */
export function localMidnightEpoch(iso: string, tzName: string): number {
  const utcMidnight = Date.parse(`${iso}T00:00:00Z`) / 1000
  const offsetMin = tzOffsetMinutes(Date.parse(`${iso}T12:00:00Z`), tzName)
  return Math.floor(utcMidnight) - offsetMin * 60
}

/** {start, end} bounds of an epoch slot, as tenant-local minutes-in-day. */
function localSlotMinutes(
  ts: number,
  tzName: string,
): { dayIso: string; minutes: number } | null {
  try {
    const d = new Date(ts * 1000)
    const dayIso = d.toLocaleDateString('en-CA', { timeZone: tzName })
    const t = d.toLocaleTimeString('en-US', {
      timeZone: tzName,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const [h, mi] = t.split(':')
    return { dayIso, minutes: (parseInt(h ?? '0', 10) % 24) * 60 + parseInt(mi ?? '0', 10) }
  } catch {
    return null
  }
}

export interface AvailabilityOptions {
  /** Rolling window in days from today (default 7, capped at the horizon). */
  days?: number
  /** A specific YYYY-MM-DD to return slots for instead of a window. */
  date?: string
}

/**
 * Get available slots across the next `days` calendar days (from today), or
 * for one specific date, in the tenant's timezone. Window and specific dates
 * are capped at bookingHorizon(tenant).
 */
export async function getAvailability(
  db: Client,
  tenant: SqlRow,
  opts: AvailabilityOptions = {},
): Promise<Slot[]> {
  const tenantId = rowString(tenant, 'id')
  const tzName = rowString(tenant, 'timezone', 'UTC')
  const hours = businessHours(tenant)
  const slotDuration = Number(tenant['slot_duration'] ?? 30) || 30
  const bufferMinutes = Number(tenant['buffer_minutes'] ?? 15) || 0
  const horizon = bookingHorizon(tenant)

  let offsets: number[]
  if (opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)) {
    const off = isoToDayOffset(opts.date, tzName)
    if (off === null || off < 0 || off > horizon) return []
    offsets = [off]
  } else {
    const days = Math.min(Math.max(Math.floor(opts.days ?? 7), 1), horizon)
    offsets = Array.from({ length: days }, (_, i) => i)
  }
  const maxOff = Math.max(...offsets)

  const startTs = Math.floor(Date.now() / 1000)
  const endTs = startTs + (maxOff + 1) * 86400

  const apptRes = await query(
    db,
    `SELECT start_time, end_time FROM appointments
     WHERE tenant_id = ? AND status IN ('pending', 'confirmed')
     AND start_time >= ? AND start_time < ?`,
    [tenantId, startTs, endTs],
  )
  const busy: Array<{ start: number; end: number }> = apptRes.rows.map((r) => ({
    start: Number(r['start_time'] || 0),
    end: Number(r['end_time'] || 0),
  }))

  const slots: Slot[] = []
  for (const offset of offsets) {
    const iso = localIsoDate(offset, tzName) // YYYY-MM-DD in tenant tz
    const dt = new Date(`${iso}T00:00:00`)
    const dayName = DAY_NAMES[dt.getDay()] ?? 'sunday'
    const dayHours = hours[dayName] || (Object.keys(hours).length ? undefined : (DEFAULT_HOURS as any)[dayName])
    const open = dayHours && (dayHours as any).open
    const close = dayHours && (dayHours as any).close
    if (!dayHours || !open || !close) continue

    const { hour: oh, minute: om } = parseTime(String(open))
    const { hour: ch, minute: cm } = parseTime(String(close))

    const midnight = localMidnightEpoch(iso, tzName)
    let slotStart = midnight + oh * 3600 + om * 60
    const dayEnd = midnight + ch * 3600 + cm * 60
    while (slotStart + slotDuration * 60 <= dayEnd) {
      const slotEnd = slotStart + slotDuration * 60
      const conflict = busy.some(
        (b) =>
          slotStart < b.end + bufferMinutes * 60 &&
          slotEnd > b.start - bufferMinutes * 60,
      )
      // Skip slots already in the past.
      if (!conflict && slotEnd > startTs) {
        slots.push({ start_time: slotStart, end_time: slotEnd, available: true })
      }
      slotStart = slotEnd + bufferMinutes * 60
    }
  }

  return slots
}

/**
 * Book an appointment. Throws ApptConflict if the slot is already taken.
 */
export async function bookAppointment(
  db: Client,
  tenant: SqlRow,
  opts: {
    conversationId: string
    endUserId: string | null
    startTime: number
    endTime: number
    title?: string
    notes?: string
  },
): Promise<BookedAppointment> {
  const tenantId = rowString(tenant, 'id')
  const now = Math.floor(Date.now() / 1000)

  const conflictRes = await query(
    db,
    `SELECT id FROM appointments
     WHERE tenant_id = ? AND status IN ('pending', 'confirmed')
     AND start_time < ? AND end_time > ?`,
    [tenantId, opts.endTime, opts.startTime],
  )
  if (conflictRes.rows.length) {
    throw new ApptConflict('Time slot no longer available')
  }
  assertBookable(tenant, opts.startTime, opts.endTime)

  const id = crypto.randomUUID()
  await query(
    db,
    `INSERT INTO appointments
       (id, tenant_id, conversation_id, end_user_id, start_time, end_time,
        status, title, notes, notify_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, 'pending', ?, ?)`,
    [
      id,
      tenantId,
      opts.conversationId,
      opts.endUserId,
      opts.startTime,
      opts.endTime,
      opts.title || 'Appointment',
      opts.notes || null,
      now,
      now,
    ],
  )

  return { id, status: 'confirmed', start_time: opts.startTime, end_time: opts.endTime }
}

export class ApptConflict extends Error {}
export class ApptClosed extends Error {}
export class ApptHorizon extends Error {}

/**
 * Reject a slot that is in the past, beyond the tenant's booking horizon, or
 * falls outside the tenant's business hours. Throws ApptClosed / ApptHorizon.
 */
function assertBookable(tenant: SqlRow, start: number, end: number): void {
  const now = Math.floor(Date.now() / 1000)
  const horizon = bookingHorizon(tenant)
  if (start < now) throw new ApptClosed('That time has already passed')
  if (start > now + horizon * 86400) {
    throw new ApptHorizon(`That's beyond the ${horizon}-day booking window`)
  }
  const tzName = rowString(tenant, 'timezone', 'UTC')
  const startInfo = localSlotMinutes(start, tzName)
  const endInfo = localSlotMinutes(end, tzName)
  if (!startInfo || !endInfo) throw new ApptClosed('Unable to verify business hours')
  if (endInfo.minutes < startInfo.minutes) throw new ApptClosed('That time is not valid')

  const hours = businessHours(tenant)
  const dayName = DAY_NAMES[new Date(`${startInfo.dayIso}T00:00:00`).getDay()] ?? 'sunday'
  const day = hours[dayName] || (Object.keys(hours).length ? undefined : (DEFAULT_HOURS as any)[dayName])
  const open = day ? (day as any).open : undefined
  const close = day ? (day as any).close : undefined
  if (!day || !open || !close) throw new ApptClosed('The business is closed at that time')
  const { hour: oh, minute: om } = parseTime(String(open))
  const { hour: ch, minute: cm } = parseTime(String(close))
  const openMin = oh * 60 + om
  const closeMin = ch * 60 + cm
  if (startInfo.minutes < openMin || endInfo.minutes > closeMin) {
    throw new ApptClosed('The business is closed at that time')
  }
}

/**
 * Attempts to notify an existing appointment (emails + sheet via the tenant's
 * GAS web app), persisting the outcome to notify_status/notify_error.
 *
 * Retry policy: up to MAX_NOTIFY_ATTEMPTS inline attempts with short backoff,
 * so transient GAS blips self-heal. Anything still failing is surfaced in the
 * dashboard for a manual Retry (which is safe thanks to GAS idempotency).
 */
const MAX_NOTIFY_ATTEMPTS = 3

export interface NotifyCtx {
  appointmentId: string
  email: string
  name?: string
  startTime: number
  endTime: number
  title: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function notifyAppointment(
  db: Client,
  tenant: SqlRow,
  settings: Record<string, unknown>,
  ctx: NotifyCtx,
): Promise<NotifyResult> {
  const payload: BookingNotification = {
    type: 'booking',
    tenant_slug: rowString(tenant, 'slug'),
    tenant_name: rowString(tenant, 'name'),
    customer_name: ctx.name || '',
    customer_email: ctx.email,
    start_time: ctx.startTime,
    end_time: ctx.endTime,
    title: ctx.title,
    appointment_id: ctx.appointmentId,
    notification_email:
      typeof settings['notification_email'] === 'string' ? settings['notification_email'] : undefined,
    spreadsheet_id:
      typeof settings['spreadsheet_id'] === 'string' ? settings['spreadsheet_id'] : undefined,
  }

  let last: NotifyResult = { ok: false, error: 'notify failed' }
  for (let attempt = 0; attempt < MAX_NOTIFY_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(600 * attempt)
    last = await notifyBooking(settings, payload)
    if (last.ok) break
  }

  const now = Math.floor(Date.now() / 1000)
  const errorCol = last.ok
    ? null
    : JSON.stringify({ error: last.error || 'notify failed', detail: last.detail || null })
  await query(
    db,
    `UPDATE appointments SET notify_status = ?, notify_error = ?, updated_at = ? WHERE id = ?`,
    [last.ok ? 'sent' : 'failed', errorCol, now, ctx.appointmentId],
  )
  return last
}

export interface BookOutcome extends BookedAppointment {
  notify: NotifyResult
}

/**
 * Atomic book + notify used by every booking path (chat + REST) so the
 * notification state is recorded consistently everywhere.
 */
export async function bookAndNotify(
  db: Client,
  tenant: SqlRow,
  settings: Record<string, unknown>,
  opts: {
    conversationId: string
    endUserId: string | null
    startTime: number
    endTime: number
    title?: string
    notes?: string
    customerEmail: string
    customerName?: string
  },
): Promise<BookOutcome> {
  const appt = await bookAppointment(db, tenant, opts)
  const notify = await notifyAppointment(db, tenant, settings, {
    appointmentId: appt.id,
    email: opts.customerEmail,
    name: opts.customerName,
    startTime: appt.start_time,
    endTime: appt.end_time,
    title: opts.title || 'Appointment',
  })
  return { ...appt, notify }
}

export interface RetryOutcome extends BookedAppointment {
  notify: NotifyResult
}

/**
 * Re-run the notify pipeline for an existing appointment (admin Retry button).
 * Safe to call repeatedly: the GAS script dedupes by appointment_id.
 * Resolves null if the appointment is not found for this tenant.
 */
export async function retryAppointmentNotify(
  db: Client,
  tenant: SqlRow,
  apptId: string,
): Promise<RetryOutcome | null> {
  const tenantId = rowString(tenant, 'id')
  const apptRes = await query(
    db,
    'SELECT * FROM appointments WHERE id = ? AND tenant_id = ?',
    [apptId, tenantId],
  )
  if (!apptRes.rows.length) return null
  const appt = apptRes.rows[0]!

  let email = ''
  let name = ''
  const endUserId = rowString(appt, 'end_user_id')
  if (endUserId) {
    const euRes = await query(db, 'SELECT email, name FROM end_users WHERE id = ?', [endUserId])
    if (euRes.rows.length) {
      email = rowString(euRes.rows[0]!, 'email')
      name = rowString(euRes.rows[0]!, 'name')
    }
  }

  const now = Math.floor(Date.now() / 1000)
  if (!email) {
    const err = JSON.stringify({ error: 'no customer email on record' })
    await query(
      db,
      `UPDATE appointments SET notify_status = 'failed', notify_error = ?, updated_at = ? WHERE id = ?`,
      [err, now, apptId],
    )
    return {
      id: apptId,
      status: rowString(appt, 'status', 'pending'),
      start_time: Number(appt['start_time'] || 0),
      end_time: Number(appt['end_time'] || 0),
      notify: { ok: false, error: 'no customer email on record' },
    }
  }

  const settings = parseJson<Record<string, unknown>>(rowString(tenant, 'settings', '{}'), {})
  const notify = await notifyAppointment(db, tenant, settings, {
    appointmentId: apptId,
    email,
    name,
    startTime: Number(appt['start_time'] || 0),
    endTime: Number(appt['end_time'] || 0),
    title: rowString(appt, 'title', 'Appointment'),
  })
  return {
    id: apptId,
    status: rowString(appt, 'status', 'pending'),
    start_time: Number(appt['start_time'] || 0),
    end_time: Number(appt['end_time'] || 0),
    notify,
  }
}

/**
 * Find or create the end_user for an email within a tenant (dedupe by
 * email + tenant, mirroring the FastAPI behavior).
 */
export async function ensureEndUser(
  db: Client,
  tenant: SqlRow,
  email: string,
  name?: string,
): Promise<string> {
  const tenantId = rowString(tenant, 'id')
  const now = Math.floor(Date.now() / 1000)
  const existing = await query(
    db,
    'SELECT id, name FROM end_users WHERE tenant_id = ? AND email = ? LIMIT 1',
    [tenantId, email],
  )
  if (existing.rows.length) {
    const row = existing.rows[0]!
    if (name && !rowString(row, 'name')) {
      await query(db, 'UPDATE end_users SET name = ? WHERE id = ?', [name, rowString(row, 'id')])
    }
    return rowString(row, 'id')
  }
  const id = crypto.randomUUID()
  await query(
    db,
    `INSERT INTO end_users (id, tenant_id, email, name, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, tenantId, email, name || '', now],
  )
  return id
}
