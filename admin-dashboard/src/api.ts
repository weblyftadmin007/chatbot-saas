// Thin fetch wrapper that injects the Clerk session token into API calls.
// App.tsx registers the token getter once the user is signed in.
//
// The API origin is configurable at build time via VITE_API_URL (the
// Cloudflare Worker backend). When unset, calls go to the same origin.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

function withBase(path: string): string {
  if (!API_BASE) return path
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE}${path}`
}

let tokenGetter: (() => Promise<string | null>) | null = null

export function setTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {})

  // Only set JSON content-type for string bodies (never for FormData, which
  // needs the browser-generated multipart boundary).
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (tokenGetter) {
    const token = await tokenGetter()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  // Time out instead of hanging silently (e.g. blocked request, dead CORS
  // preflight). Turns an invisible hang into a visible error.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    return await fetch(withBase(path), { ...options, headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}