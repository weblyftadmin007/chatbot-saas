/**
 * Turso database access. Uses the web build of @libsql/client, which talks
 * Hrana-over-HTTP — no native bindings, works on Cloudflare Workers.
 * sqlite-vec lives server-side in Turso, so vec SQL just works.
 */
import { createClient, type Client } from '@libsql/client/web'
import type { Env } from './config'

type SqlValue = string | number | bigint | Uint8Array | null | boolean
export type SqlRow = Record<string, SqlValue>

export interface SqlResult {
  columns: string[]
  rows: SqlRow[]
  rowsAffected: number
}

const dbKey = Symbol.for('chatbot.turso.client')

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
