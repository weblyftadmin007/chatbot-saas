/**
 * Tenant helpers: lookup by slug/id and widget-config building
 * (port of backend/app/api/widget.py get_widget_config).
 */
import type { Client } from '@libsql/client/web'
import { query, rowString, type SqlRow } from './db'

export function parseJson<T = Record<string, unknown>>(
  raw: string | null | undefined,
  fallback: T,
): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function tenantBySlug(
  db: Client,
  slug: string,
): Promise<SqlRow | null> {
  const r = await query(db, "SELECT * FROM tenants WHERE slug = ? AND plan != 'deleted'", [slug])
  return r.rows[0] ?? null
}

export async function tenantById(db: Client, id: string): Promise<SqlRow | null> {
  const r = await query(db, 'SELECT * FROM tenants WHERE id = ?', [id])
  return r.rows[0] ?? null
}

export interface WidgetConfig {
  tenant_slug: string
  tenant_name: string
  bot_name: string
  greeting: string
  primary_color: string
  secondary_color: string
  logo_url?: string | null
  show_branding: boolean
  business_hours?: Record<string, unknown> | null
  quick_replies?: string[]
}

/** Build the /widget/config payload exactly as the FastAPI backend did. */
export function buildWidgetConfig(row: SqlRow): WidgetConfig {
  const settings = parseJson<Record<string, unknown>>(
    rowString(row, 'settings', '{}'),
    {},
  )
  const businessHoursRaw = rowString(row, 'business_hours', '')
  const businessHours = businessHoursRaw
    ? parseJson<Record<string, unknown> | null>(businessHoursRaw, null)
    : null

  return {
    tenant_slug: rowString(row, 'slug'),
    tenant_name: rowString(row, 'name'),
    bot_name: (settings['bot_name'] as string) || 'Assistant',
    greeting: (settings['greeting'] as string) || 'Hi! How can I help you today?',
    primary_color: (settings['primary_color'] as string) || '#3B82F6',
    secondary_color: (settings['secondary_color'] as string) || '#1E40AF',
    logo_url: (settings['logo_url'] as string) || null,
    show_branding: settings['show_branding'] !== false,
    quick_replies: Array.isArray(settings['quick_replies'])
      ? (settings['quick_replies'] as string[]).filter((q) => typeof q === 'string' && q.trim())
      : undefined,
    business_hours: businessHours,
  }
}
