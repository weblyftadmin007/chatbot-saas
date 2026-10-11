import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from '@clerk/clerk-react'
import { Tenants } from './pages/Tenants'
import { TenantDetail } from './pages/TenantDetail'
import { Analytics } from './pages/Analytics'
import { Settings } from './pages/Settings'
import { Layout } from './components/Layout'
import { setTokenGetter } from './api'

/** Simple boundary so a runtime render error shows a message instead of a blank white page. */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: unknown }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error" style={{ padding: 24, textAlign: 'left' }}>
          <h2>Something went wrong</h2>
          <details style={{ marginTop: 12 }}>
            <summary>Error details</summary>
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace' }}>
              {String(this.state.error)}
            </pre>
          </details>
          <p style={{ marginTop: 12 }}>
            Please try reloading the page. If it keeps happening, contact support and include the error above.
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