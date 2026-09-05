import type { Client } from '@libsql/client/web'
import { query, rowString, type SqlRow } from './db'
import { parseJson } from './tenants'
import { notifyCancellation, formatSlot } from './email'
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
import { ensureEndUser, ApptConflict, ApptClosed, ApptHorizon } from './appointments'

export interface CancelRequest {
  email: string
  dateIso?: string
}

export interface CancelOutcome {
  appointment: {
    id: string
    status: string
    start_time: number
    end_time: number
  }
  notify: { ok: boolean; error?: string; detail?: string | null }
}

export async function cancelAppointment(
  db: Client,
  tenant: SqlRow,
  settings: Record<string, unknown>,
  req: CancelRequest,
): Promise<CancelOutcome | null> {
  const email = (req.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return null

  const endUserRes = await query(
    db,
    'SELECT id FROM end_users WHERE tenant_id = ? AND lower(email) = ? LIMIT 1',
    [rowString(tenant, 'id'), email],
  )
  if (!endUserRes.rows.length) return null
  const endUserId = rowString(endUserRes.rows[0]!, 'id')

  const now = Math.floor(Date.now() / 1000)
  const tzName = rowString(tenant, 'timezone', 'UTC')

  let dateFilter = 'AND 1=1'
  if (req.dateIso) {
    const off = isoToDayOffset(req.dateIso, tzName)
    if (off !== null && off >= 0) {
      const startOfDay = localMidnightEpoch(req.dateIso, tzName)
      const endOfDay = startOfDay + 86400
      dateFilter = `AND a.start_time >= ${startOfDay} AND a.start_time < ${endOfDay}`
    }
  }

  const apptRes = await query(
    db,
    `SELECT * FROM appointments a
     WHERE a.tenant_id = ? AND a.end_user_id = ?
       AND a.status IN ('pending', 'confirmed')
       ${dateFilter}
     ORDER BY a.start_time ASC
     LIMIT 1`,
    [rowString(tenant, 'id'), endUserId],
  )

  if (!apptRes.rows.length) return null
  const appt = apptRes.rows[0]!

  const id = rowString(appt, 'id')
  const start_time = Number(appt['start_time'] || 0)
  const end_time = Number(appt['end_time'] || 0)

  // Free the slot.
  await query(
    db,
    `UPDATE appointments SET status = 'cancelled', notify_status = 'pending',
     notify_error = NULL, updated_at = ? WHERE id = ?`,
    [now, id],
  )

  const emailsSent = []
  if (rowString(appt, 'customer_email')) {
    emailsSent.push(rowString(appt, 'customer_email'))
  }
  const notificationEmail =
    typeof settings['notification_email'] === 'string'
      ? settings['notification_email']
      : undefined

  const notify = await notifyCancellation(settings, {
    type: 'cancellation',
    tenant_slug: rowString(tenant, 'slug'),
    tenant_name: rowString(tenant, 'name'),
    customer_name: rowString(appt, 'customer_name'),
    customer_email: rowString(appt, 'customer_email'),
    start_time,
    end_time,
    title: rowString(appt, 'title', 'Appointment'),
    appointment_id: id,
    notification_email: notificationEmail,
    spreadsheet_id:
      typeof settings['spreadsheet_id'] === 'string'
        ? settings['spreadsheet_id']
        : undefined,
    timezone: tzName,
  })

  return {
    appointment: { id, status: 'cancelled', start_time, end_time },
    notify,
  }
}

function isoToDayOffset(iso: string, tzName: string): number | null {
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

function localIsoDate(offsetDays: number, tzName: string): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  try {
    return d.toLocaleDateString('en-CA', { timeZone: tzName })
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

function localMidnightEpoch(iso: string, tzName: string): number {
  const utcMidnight = Date.parse(`${iso}T00:00:00Z`) / 1000
  const offsetMin = tzOffsetMinutes(Date.parse(`${iso}T12:00:00Z`), tzName)
  return Math.floor(utcMidnight) - offsetMin * 60
}

function tzOffsetMinutes(utcMs: number, tzName: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      timeZoneName: 'shortOffset',
    })
    const val = dtf.formatToParts(new Date(utcMs)).find(
      (p) => p.type === 'timeZoneName',
    )?.value || ''
    const m = val.match(/GMT?([+-])(\d{1,2}):?(\d{2})/)
    if (!m) return 0
    const sign = m[1] === '-' ? -1 : 1
    return sign * (parseInt(m[2] ?? '0', 10) * 60 + parseInt(m[3] ?? '0', 10))
  } catch {
    return 0
  }
}
