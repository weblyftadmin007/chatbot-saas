/**
 * Per-tenant booking notifications via the tenant's Google Apps Script web app
 * (gas-email/Code.gs `type:'booking'` / `type:'cancellation'` handlers). The
 * script runs in the tenant's Google account and is responsible for emailing
 * the customer + business and updating the tenant's Google Sheet.
 *
 * Delivery is best-effort and non-blocking by REPLICATION, not by silence:
 * the caller records the outcome (`NotifyResult`) on the appointment row
 * (notify_status/notify_error) so failures are visible in the admin dashboard
 * and retried by the cron sweep (plus the dashboard Retry fallback) — both
 * idempotent, since the script dedupes by appointment_id.
 *
 * Auth: if the tenant sets `gas_secret` in settings, it is included in the
 * payload (`secret` field) — Apps Script's doPost does NOT receive HTTP
 * headers, so the GAS script verifies it from the parsed body instead. Never
 * log or echo the secret itself.
 */
export interface NotifyResult {
  ok: boolean
  /** Machine-readable reason: 'no gas_url configured' | 'gas fetch failed' | GAS error text. */
  error?: string
  /** Freeform trace (HTTP body / script result JSON) for notify_error. */
  detail?: string
}

export interface BookingNotification {
  type: 'booking' | 'cancellation' | 'reminder'
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
  /** IANA timezone of the tenant — GAS formats timestamps with it. */
  timezone?: string
  /** Shared-secret echo for GAS verification (tenant setting gas_secret). */
  secret?: string
}

function gasUrl(settings: Record<string, unknown>): string {
  return typeof settings['gas_url'] === 'string' ? settings['gas_url'].trim() : ''
}

function gasSecret(settings: Record<string, unknown>): string {
  return typeof settings['gas_secret'] === 'string' ? settings['gas_secret'].trim() : ''
}

/** Attach the shared secret to the payload for GAS-side verification. */
function withSecret(settings: Record<string, unknown>, payload: BookingNotification): BookingNotification {
  const secret = gasSecret(settings)
  return secret ? { ...payload, secret } : payload
}

/**
 * GAS returns HTTP 200 with a JSON body for both success and script-level
 * errors, and `replySuccess` may report partial failures (e.g. the sheet
 * update errored, or MailApp quota was exhausted). Require BOTH actions to
 * have succeeded for ok=true so retries kick in when the customer email
 * didn't actually go out.
 */
function parseGasResult(data: Record<string, unknown> | null): { ok: boolean; error?: string } {
  if (!data) return { ok: true }
  if (typeof data['error'] === 'string' && data['error']) {
    return { ok: false, error: data['error'] }
  }
  if (data['success'] === false) return { ok: false, error: 'GAS reported failure' }
  const emails = data['emails_sent']
  if (Array.isArray(emails)) {
    if (emails.length === 0) return { ok: false, error: 'GAS sent no emails (quota?)' }
    const sheetErr = typeof data['sheet'] === 'string' && data['sheet'].startsWith('error:')
      ? 'sheet update failed'
      : null
    return sheetErr ? { ok: false, error: sheetErr } : { ok: true }
  }
  return { ok: true }
}

/**
 * Post a booking/cancellation to the tenant's GAS endpoint. Never throws (the
 * booking flow is not rejected) — resolves a structured result the caller
 * persists on the row.
 */
export async function notifyBooking(settings: Record<string, unknown>, payload: BookingNotification): Promise<NotifyResult> {
  const gasUrlStr = gasUrl(settings)
  if (!gasUrlStr) {
    console.warn(
      `[notifyBooking] no gas_url for tenant "${payload.tenant_slug}" — booking saved but no email/sheet sent`,
    )
    return { ok: false, error: 'no gas_url configured' }
  }
  try {
    const res = await fetch(gasUrlStr, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withSecret(settings, payload)),
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
    const parsed = parseGasResult(data)
    if (!parsed.ok) {
      console.error(`[notifyBooking] GAS partial failure for ${payload.tenant_slug}: ${parsed.error}`)
      return { ok: false, error: parsed.error, detail: text.slice(0, 300) }
    }
    return { ok: true, detail: data && typeof data === 'object' ? JSON.stringify(data) : undefined }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[notifyBooking] GAS fetch error for ${payload.tenant_slug}: ${msg}`)
    return { ok: false, error: 'gas fetch failed', detail: msg }
  }
}

/**
 * Send a cancellation notice (customer + business email; the sheet row keeps
 * its original booking entry). Never throws.
 */
export async function notifyCancellation(settings: Record<string, unknown>, payload: BookingNotification): Promise<NotifyResult> {
  const gasUrlStr = gasUrl(settings)
  if (!gasUrlStr) {
    return { ok: false, error: 'no gas_url configured' }
  }
  if (payload.type !== 'cancellation' && payload.type !== 'reminder') {
    return { ok: false, error: 'invalid notification type' }
  }
  try {
    const res = await fetch(gasUrlStr, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withSecret(settings, payload)),
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
      return { ok: false, error, detail: text.slice(0, 300) }
    }
    const parsed = parseGasResult(data)
    if (!parsed.ok) return { ok: false, error: parsed.error, detail: text.slice(0, 300) }
    return { ok: true, detail: data && typeof data === 'object' ? JSON.stringify(data) : undefined }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[notifyCancellation] GAS fetch error for ${payload.tenant_slug}: ${msg}`)
    return { ok: false, error: 'gas fetch failed', detail: msg }
  }
}

/**
 * Send a reminder for an upcoming appointment (customer + business email;
 * no Sheet write). Non-blocking — callers persist notify_status like other
 * notifications.
 */
export async function notifyReminder(settings: Record<string, unknown>, payload: BookingNotification): Promise<NotifyResult> {
  const gasUrlStr = gasUrl(settings)
  if (!gasUrlStr) {
    return { ok: false, error: 'no gas_url configured' }
  }
  try {
    const res = await fetch(gasUrlStr, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withSecret(settings, payload)),
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
      return { ok: false, error, detail: text.slice(0, 300) }
    }
    const parsed = parseGasResult(data)
    if (!parsed.ok) return { ok: false, error: parsed.error, detail: text.slice(0, 300) }
    return { ok: true, detail: data && typeof data === 'object' ? JSON.stringify(data) : undefined }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[notifyReminder] GAS fetch error for ${payload.tenant_slug}: ${msg}`)
    return { ok: false, error: 'gas fetch failed', detail: msg }
  }
}

/**
 * Format an epoch timestamp as a human-readable local datetime.
 * `tzName` (IANA) wins when provided so confirmations match the business's
 * clock, not the server's.
 */
export function formatSlot(ts: number, tzName?: string): string {
  try {
    if (tzName) {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: tzName,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(ts * 1000))
    }
  } catch {
    // fall through to default formatting
  }
  return new Date(ts * 1000).toLocaleString()
}
