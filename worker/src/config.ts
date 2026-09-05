/**
 * Environment (wrangler vars + secrets). Secrets are set with
 * `wrangler secret put <NAME>`; non-secrets come from wrangler.toml [vars].
 */
export interface Env {
  // Secrets
  TURSO_DATABASE_URL: string
  TURSO_AUTH_TOKEN: string
  GEMINI_API_KEY: string
  CLERK_PUBLISHABLE_KEY?: string
  CLERK_JWKS_URL?: string
  /** Comma-separated email allowlist for /admin/* endpoints. */
  ADMIN_EMAILS?: string
  /**
   * Optional bootstrap token accepted for /admin/* during initial onboarding
   * (before the admin dashboard is wired up in Phase 3). Delete it once the
   * Clerk flow is in use — see DEPLOY.md §5.
   */
  ADMIN_BOOTSTRAP_TOKEN?: string
  // Vars
  ENVIRONMENT?: string
  CHAT_MODEL?: string
  EMBED_MODEL?: string
  EMBED_DIMENSIONS?: string
  TOP_K?: string
  SIMILARITY_THRESHOLD?: string
  CHUNK_SIZE?: string
  CHUNK_OVERLAP?: string
  LLM_CHAT_RPM?: string
}

export function chatModel(env: Env): string {
  return env.CHAT_MODEL || 'gemini-3.5-flash-lite'
}

export function embedModel(env: Env): string {
  return env.EMBED_MODEL || 'gemini-embedding-001'
}

export function embedDimensions(env: Env): number {
  return parseInt(env.EMBED_DIMENSIONS || '768', 10)
}

export function topK(env: Env): number {
  return parseInt(env.TOP_K || '5', 10)
}

export function similarityThreshold(env: Env): number {
  return parseFloat(env.SIMILARITY_THRESHOLD || '0.7')
}

export function chunkSize(env: Env): number {
  return parseInt(env.CHUNK_SIZE || '500', 10)
}

export function chunkOverlap(env: Env): number {
  return parseInt(env.CHUNK_OVERLAP || '50', 10)
}

export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Friendly message shown when a chat provider daily/quota cap is hit. */
export const LIMIT_MESSAGE =
  "I'm at my usage limit right now — please try again in a little while."

export const KB_UNAVAILABLE_MESSAGE =
  "I can't search the knowledge base right now — try again shortly."

/** Phase-1 stand-in replies for intents that belong to later phases. */
export const BOOKING_PHASE_NOTE =
  'Appointment booking is coming soon — right now I can answer questions about the knowledge base. Ask me anything about the business!'
