import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from '@clerk/clerk-react'
import { Tenants } from './pages/Tenants'
import { TenantDetail } from './pages/TenantDetail'
import { Analytics } from './pages/Analytics'
import { Settings } from './pages/Settings'
import { Layout } from './components/Layout'
import { setTokenGetter } from './api'

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
    <>
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
      <SignedOut>
        <SignIn />
      </SignedOut>
    </>
  )
}