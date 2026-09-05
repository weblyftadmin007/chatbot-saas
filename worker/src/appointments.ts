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
 * Get available slots across the next `days` calendar days (from today),
 * in the tenant's timezone.
 */
export async function getAvailability(
  db: Client,
  tenant: SqlRow,
  days = 7,
): Promise<Slot[]> {
  const tenantId = rowString(tenant, 'id')
  const tzName = rowString(tenant, 'timezone', 'UTC')
  const hours = businessHours(tenant)
  const slotDuration = Number(tenant['slot_duration'] ?? 30) || 30
  const bufferMinutes = Number(tenant['buffer_minutes'] ?? 15) || 0

  const startTs = Math.floor(Date.now() / 1000)
  const endTs = startTs + days * 86400

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
  // Walk day by day from local midnight so day-name resolution is correct per tz.
  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const now = new Date()
    const local = new Date(now.getTime() + dayOffset * 86400000)
    let iso: string
    try {
      iso = local.toLocaleDateString('en-CA', { timeZone: tzName }) // YYYY-MM-DD
    } catch {
      iso = local.toISOString().slice(0, 10)
    }
    const dt = new Date(`${iso}T00:00:00`)
    const dayName = DAY_NAMES[dt.getDay()] ?? 'sunday'
    const dayHours = hours[dayName] || (Object.keys(hours).length ? undefined : (DEFAULT_HOURS as any)[dayName])
    const open = dayHours && (dayHours as any).open
    const close = dayHours && (dayHours as any).close
    if (!dayHours || !open || !close) continue

    const { hour: oh, minute: om } = parseTime(String(open))
    const { hour: ch, minute: cm } = parseTime(String(close))

    let slotStart = dt.getTime() / 1000 + oh * 3600 + om * 60
    const dayEnd = dt.getTime() / 1000 + ch * 3600 + cm * 60
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
    'SELECT id FROM end_users WHERE tenant_id = ? AND email = ? LIMIT 1',
    [tenantId, email],
  )
  if (existing.rows.length) return rowString(existing.rows[0]!, 'id')
  const id = crypto.randomUUID()
  await query(
    db,
    `INSERT INTO end_users (id, tenant_id, email, name, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, tenantId, email, name || '', now],
  )
  return id
}
