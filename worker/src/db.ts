/**
 * Turso database access. Uses the web build of @libsql/client, which talks
 * Hrana-over-HTTP — no native bindings, works on Cloudflare Workers.
 * sqlite-vec lives server-side in Turso, so vec SQL just works.
 */
import { createClient, type Client } from '@libsql/client/web'
import type { Env } from './config'

type SqlValue = string | number | bigint | Uint8Array | null | boolean
export type { SqlValue }
export type SqlRow = Record<string, SqlValue>

export interface SqlResult {
  columns: string[]
  rows: SqlRow[]
  rowsAffected: number
}

const dbKey = Symbol.for('chatbot.turso.client')

let schemaMigrated = false

/**
 * Idempotent runtime migration: add the notification-state columns to the
 * `appointments` table on the live DB. Fresh databases created from
 * db/schema.sql already include them; existing DBs get a guarded ALTER so no
 * manual `turso db shell` step is required. Runs once per isolate.
 */
export async function ensureSchemaMigrations(db: Client): Promise<void> {
  if (schemaMigrated) return
  try {
    const res = await query(db, 'PRAGMA table_info(appointments)', [])
    const cols = new Set<string>(res.rows.map((r) => String(r['name'] ?? '')))
    if (!cols.has('notify_status')) {
      await db.execute({
        sql: `ALTER TABLE appointments ADD COLUMN notify_status TEXT NOT NULL DEFAULT 'pending'`,
        args: [],
      })
    }
    if (!cols.has('notify_error')) {
      await db.execute({
        sql: 'ALTER TABLE appointments ADD COLUMN notify_error TEXT',
        args: [],
      })
    }
    try {
      const endUserRes = await query(db, 'PRAGMA table_info(end_users)', [])
      if (!endUserRes.rows.length) {
        await db.execute({
          sql: `CREATE TABLE end_users (
            id TEXT PRIMARY KEY,
            tenant_id TEXT REFERENCES tenants(id),
            clerk_user_id TEXT UNIQUE,
            email TEXT,
            name TEXT,
            metadata TEXT DEFAULT '{}',
            created_at INTEGER DEFAULT (strftime('%s','now'))
          )`,
          args: [],
        })
        await db.execute({
          sql: 'CREATE INDEX IF NOT EXISTS idx_enduser_tenant ON end_users(tenant_id)',
          args: [],
        })
      }
    } catch (e) {
      console.error('[migration] end_users table failed:', e instanceof Error ? e.message : String(e))
    }
    schemaMigrated = true
  } catch (e) {
    // Keep a retryable state so a transient failure re-runs next request.
    schemaMigrated = false
    console.error('[migration] appointments columns failed:', e instanceof Error ? e.message : String(e))
  }
}

export function getDb(env: Env): Client {
  const g = globalThis as unknown as Record<symbol, Client | undefined>
  if (!g[dbKey]) {
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
      throw new Error('Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN secrets')
    }
    g[dbKey] = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    })
  }
  return g[dbKey] as Client
}

export async function query(
  db: Client,
  sql: string,
  args: SqlValue[] = [],
): Promise<SqlResult> {
  const rs = await db.execute({ sql, args })
  return {
    columns: rs.columns,
    rows: (rs.rows as unknown as SqlRow[]) ?? [],
    rowsAffected: rs.rowsAffected,
  }
}

export function rowValue(row: SqlRow, col: string): SqlValue {
  return row[col] ?? null
}

export function rowString(row: SqlRow, col: string, fallback = ''): string {
  const v = row[col]
  if (v === null || v === undefined) return fallback
  if (typeof v === 'bigint') return v.toString()
  return String(v)
}

export function rowNumber(row: SqlRow, col: string, fallback = 0): number {
  const v = row[col]
  if (v === null || v === undefined) return fallback
  return typeof v === 'bigint' ? Number(v) : Number(v)
}
