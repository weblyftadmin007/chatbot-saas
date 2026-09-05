/**
 * Per-tenant booking notifications via the tenant's Google Apps Script web app
 * (gas-email/Code.gs `type:'booking'` handler). The script runs in the tenant's
 * Google account and is responsible for emailing the customer + business and
 * appending the appointment to the tenant's Google Sheet.
 *
 * Delivery is best-effort and non-blocking by REPLICATION, not by silence:
 * the caller records the outcome (`NotifyResult`) on the appointment row
 * (notify_status/notify_error) so failures are visible in the admin dashboard
 * and can be retried (idempotently — the script dedupes by appointment_id).
 */
export interface NotifyResult {
  ok: boolean
  /** Machine-readable reason: 'no gas_url configured' | 'gas fetch failed' | GAS error text. */
  error?: string
  /** Freeform trace (HTTP body / script result JSON) for notify_error. */
  detail?: string
}

export interface BookingNotification {
  type: 'booking'
  tenant_slug: string
  tenant_name: string
  customer_name: string
  customer_email: string
  start_time: number
  end_time: number
  title: string
  /** Unique appointment id — lets the GAS script dedupe emails + sheet rows on retry. */
  appointment_id: string
  /** Business notification address (tenant setting). */
  notification_email?: string
  /** Google Sheet ID (tenant setting) — used by the script to log the row. */
  spreadsheet_id?: string
}

/**
 * Post a booking to the tenant's GAS endpoint. Never throws (booking flow is
 * not rejected) — resolves a structured result the caller persists on the row.
 */
export async function notifyBooking(settings: Record<string, unknown>, payload: BookingNotification): Promise<NotifyResult> {
  const gasUrl = typeof settings['gas_url'] === 'string' ? settings['gas_url'].trim() : ''
  if (!gasUrl) {
    console.warn(
      `[notifyBooking] no gas_url for tenant "${payload.tenant_slug}" — booking saved but no email/sheet sent`,
    )
    return { ok: false, error: 'no gas_url configured' }
  }
  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const text = await res.text().catch(() => '')
    let data: Record<string, unknown> | null = null
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : null
    } catch {
      data = null
    }
    if (!res.ok) {
      const error = typeof data?.error === 'string' ? data.error : `GAS HTTP ${res.status}`
      console.error(`[notifyBooking] GAS HTTP ${res.status} for ${payload.tenant_slug}: ${text.slice(0, 300)}`)
      return { ok: false, error, detail: text.slice(0, 300) }
    }
    return { ok: true, detail: data && typeof data === 'object' ? JSON.stringify(data) : undefined }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[notifyBooking] GAS fetch error for ${payload.tenant_slug}: ${msg}`)
    return { ok: false, error: 'gas fetch failed', detail: msg }
  }
}

/** Format an epoch timestamp as a human-readable local datetime. */
export function formatSlot(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}
