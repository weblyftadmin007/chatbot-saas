/**
 * Per-tenant booking notifications via the tenant's Google Apps Script web app
 * (gas-email/Code.gs `type:'booking'` handler). The script runs in the tenant's
 * Google account and is responsible for emailing the customer + business and
 * appending the appointment to the tenant's Google Sheet.
 *
 * Delivery is best-effort and non-blocking: a booking still succeeds even if
 * the GAS endpoint is down or misconfigured — failures are logged server-side.
 */
export interface BookingNotification {
  type: 'booking'
  tenant_slug: string
  tenant_name: string
  customer_name: string
  customer_email: string
  start_time: number
  end_time: number
  title: string
  /** Business notification address (tenant setting). */
  notification_email?: string
  /** Google Sheet ID (tenant setting) — used by the script to log the row. */
  spreadsheet_id?: string
}

/**
 * Post a booking to the tenant's GAS endpoint. Resolves false when the tenant
 * has no gas_url configured; throws/returns false on delivery errors after
 * logging (never rejects the booking flow).
 */
export async function notifyBooking(settings: Record<string, unknown>, payload: BookingNotification): Promise<boolean> {
  const gasUrl = typeof settings['gas_url'] === 'string' ? settings['gas_url'].trim() : ''
  if (!gasUrl) {
    console.warn(
      `[notifyBooking] no gas_url for tenant "${payload.tenant_slug}" — booking saved but no email/sheet sent`,
    )
    return false
  }
  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[notifyBooking] GAS HTTP ${res.status} for ${payload.tenant_slug}: ${body.slice(0, 300)}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[notifyBooking] GAS fetch error for ${payload.tenant_slug}: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

/** Format an epoch timestamp as a human-readable local datetime. */
export function formatSlot(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}
