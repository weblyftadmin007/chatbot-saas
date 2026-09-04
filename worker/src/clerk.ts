/**
 * Clerk JWT verification for /admin/* endpoints.
 *
 * Verifies RS256 signatures against the Clerk JWKS endpoint (derived from the
 * publishable key, or set explicitly via CLERK_JWKS_URL), checks `exp`, and
 * returns the token claims. Admin authorization is an email allowlist check
 * against env.ADMIN_EMAILS (mirrors backend/app/config.py ADMIN_EMAIL).
 */
import type { Env } from './config'

const enc = new TextEncoder()

function b64urlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded)
  return new TextDecoder().decode(
    Uint8Array.from(bin, (c) => c.charCodeAt(0)),
  )
}

/** Derive the Clerk frontend host from a pk_live_/pk_test_ publishable key. */
function deriveFrontendApi(publishableKey: string): string {
  const parts = publishableKey.split('_')
  const payload = parts[parts.length - 1] || ''
  const decoded = b64urlDecode(payload) // e.g. "clerk.example.accounts.dev$"
  // Clerk terminates the encoded host with a literal '$' — strip it and
  // anything after it before using the value as a hostname.
  const host = decoded.split('$')[0] || ''
  if (!host.includes('.')) {
    throw new Error(`Could not derive Clerk frontend API from key ${publishableKey.slice(0, 12)}...`)
  }
  return host
}

let jwksCache: { keys: JsonWebKey[]; expiresAt: number } | null = null

async function getJwks(env: Env): Promise<JsonWebKey[]> {
  const now = Date.now()
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys
  const host =
    env.CLERK_JWKS_URL ||
    `https://${deriveFrontendApi(env.CLERK_PUBLISHABLE_KEY || '')}/.well-known/jwks.json`
  const res = await fetch(host)
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`)
  const data = (await res.json()) as { keys?: JsonWebKey[] }
  const keys = data.keys || []
  if (!keys.length) throw new Error('JWKS returned no keys')
  jwksCache = { keys, expiresAt: now + 10 * 60 * 1000 } // 10 min TTL
  return keys
}

export interface ClerkClaims {
  sub?: string
  email?: string
  exp?: number
  iat?: number
  iss?: string
  [k: string]: unknown
}

/** Verify a Clerk session token; returns claims or throws. */
export async function verifyToken(
  env: Env,
  token: string,
): Promise<ClerkClaims> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed JWT')
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string]
  const header = JSON.parse(b64urlDecode(headerB64)) as { kid?: string; alg?: string }
  if (header.alg !== 'RS256') throw new Error(`Unsupported JWT alg: ${header.alg}`)

  const keys = await getJwks(env)
  const key = header.kid
    ? keys.find((k) => (k as { kid?: string }).kid === header.kid)
    : keys[0]
  if (!key) throw new Error('No matching JWK')

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const data = `${headerB64}.${payloadB64}`
  const sig = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  )
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    sig as unknown as BufferSource,
    enc.encode(data),
  )
  if (!valid) throw new Error('JWT signature invalid')

  const claims = JSON.parse(b64urlDecode(payloadB64)) as ClerkClaims
  const exp = claims.exp || 0
  // Allow small clock skew (5 min) like typical JWT verifiers.
  if (exp * 1000 < Date.now() - 5 * 60 * 1000) {
    throw new Error('JWT expired')
  }
  return claims
}

/** True when the token's email is in the ADMIN_EMAILS allowlist. */
export async function isAdmin(env: Env, token: string): Promise<boolean> {
  const allowed = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (!allowed.length) return false
  const claims = await verifyToken(env, token)
  const email = (claims.email || '').toLowerCase()
  return allowed.includes(email)
}
