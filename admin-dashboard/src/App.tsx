import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from '@clerk/clerk-react'
import { Tenants } from './pages/Tenants'
import { TenantDetail } from './pages/TenantDetail'
import { Analytics } from './pages/Analytics'
import { Settings } from './pages/Settings'
import { Layout } from './components/Layout'
import { setTokenGetter } from './api'

/** Error boundary that shows whatever we know on screen so the cause is visible, not blank. */
function safeText(value: unknown): string {
  try {
    if (value === null || value === undefined) return String(value)
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (typeof value === 'function') {
      try {
        const name = value.name
        if (typeof name === 'string' && name) return `function ${name}()`
      } catch {}
      try {
        return value.toString()
      } catch {
        return '[function]'
      }
    }
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      try {
        return String(value)
      } catch {
        return '[unable to display]'
      }
    }
  } catch {
    return '[unable to read error]'
  }
}

function makeErrorReport() {
  const timestamp = new Date().toISOString()
  const page = typeof window !== 'undefined' && window.location
    ? `window.location: ${String(window.location.href || window.location.pathname || '')}`
    : 'window.location: unavailable'
  const report: Array<string> = [
    `Time: ${timestamp}`,
    page,
    `Error: ${safeText(typeof Error !== 'undefined' && this instanceof Error ? (this as any).message ?? this : this.state.error)}`,
  ]
  try {
    report.push('stack:', safeText((this as any).stack))
  } catch {}
  return report.join('\n')
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: unknown; report: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, report: '' }
  }

  static getDerivedStateFromError(error: unknown) {
    let report = [
      `Time: ${new Date().toISOString()}`,
      typeof window !== 'undefined' && window.location
        ? `Page: ${String(window.location.href || window.location.pathname || '')}`
        : 'Page: unavailable',
      `Error: ${safeText(error)}`,
    ].join('\n')
    try {
      report += '\n\nstack:\n' + safeText((error as any)?.stack ?? error)
    } catch {}
    return { hasError: true, error, report }
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    try {
      const extra = [
        `componentStack:`,
        safeText(info.componentStack ?? '(no component stack)'),
      ].join('\n')
      const full = [this.state.report, '\n\n--- component stack ---\n', extra].join('\n')
      this.setState({ report: full })
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error" style={{ padding: 24, textAlign: 'left', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
          <h2 style={{ margin: '0 0 8px' }}>Something went wrong</h2>
          <p style={{ margin: '0 0 16px', color: '#475569' }}>
            The app hit an error and could not continue. The details below should help identify why.
          </p>

          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#64748B', fontWeight: 600 }}>Page:</span>
              <span style={{ marginLeft: 8 }}>{this.state.report.split('\n')[1] || 'unknown'}</span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#64748B', fontWeight: 600 }}>Occurred:</span>
              <span style={{ marginLeft: 8 }}>{this.state.report.split('\n')[0] || 'unknown'}</span>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #E2E8F0' }}>
              <span style={{ color: '#64748B', fontWeight: 600 }}>Error:</span>
              <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: '#0F172A', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 4, padding: 8 }}>
                {safeText(this.state.error)}
              </pre>
            </div>
          </div>

          <div style={{ marginTop: 4, marginBottom: 16 }}>
            <button
              type="button"
              className="btn"
              style={{ marginRight: 8 }}
              onClick={() => {
                try {
                  const copyTarget = this.state.report
                  if (navigator && typeof navigator.clipboard === 'object' && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(copyTarget).then(
                      () => alert('Error report copied to clipboard.'),
                      () => alert('Could not copy automatically. Please select the report below manually.')
                    )
                  } else {
                    alert('Please select the error report below and copy it manually.')
                  }
                } catch {
                  alert('Please select the error report below and copy it manually.')
                }
              }}
            >
              Copy error report
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => window.location.href = window.location.href}
            >
              Reload page
            </button>
          </div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', color: '#0F172A' }}>Full error report</summary>
            <pre
              style={{
                marginTop: 12,
                whiteSpace: 'pre-wrap',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                color: '#0F172A',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                padding: 12,
                maxHeight: '50vh',
                overflow: 'auto',
              }}
            >
              {this.state.report}
            </pre>
          </details>

          <p style={{ marginTop: 16, color: '#475569', fontSize: 13 }}>
            If this keeps happening, contact support and paste the error report above.
          </p>
        </div>
      )
    }

    return <>{this.props.children}</>
  }
}

function AuthenticatedApp() {
  const { isLoaded, isSignedIn, getToken } = useAuth()

  // Register the token getter during render — NOT in an effect. Effects fire
  // child-first, so if this ran in an effect, child pages (Tenants, etc.)
  // would fire their first fetch before the token was available and get a
  // 401 that never retried (looking like "no tenants" until you re-navigate).
  if (isSignedIn) {
    setTokenGetter(() => getToken())
  }

  if (!isLoaded) {
    return <div className="loading">Loading...</div>
  }

  if (!isSignedIn) {
    return <SignIn />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/tenants" replace />} />
        <Route path="/tenants" element={<Tenants />} />
        <Route path="/tenants/:tenantId" element={<TenantDetail />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
      <SignedOut>
        <SignIn />
      </SignedOut>
    </ErrorBoundary>
  )
}