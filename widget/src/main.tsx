import React from 'react'
import { createRoot } from 'react-dom/client'
import { ChatWidget } from './ChatWidget'
import styles from './styles.css?inline'

// Get configuration from script tag (with ?tenant= query param fallback)
// data-api-url is optional; when set, all /widget/* API calls are made
// against that origin (the Cloudflare Worker backend). When omitted the
// widget calls the same origin it is served from (same-origin proxy).
const scriptTag = document.currentScript as HTMLScriptElement | null
const tenantSlug =
  scriptTag?.dataset?.tenant ||
  new URLSearchParams(window.location.search).get('tenant') ||
  'demo'
const apiBase = scriptTag?.dataset?.apiUrl || ''

// Create shadow DOM host
const host = document.createElement('div')
host.id = 'chatbot-widget-host'
document.body.appendChild(host)

// Create shadow root
const shadowRoot = host.attachShadow({ mode: 'open' })

// Inject styles into shadow DOM — the bundled CSS cannot cross the shadow
// boundary on its own, so it must be inlined into the shadow root.
const styleSheet = document.createElement('style')
styleSheet.textContent = styles
shadowRoot.appendChild(styleSheet)

// Create mount point inside shadow DOM
const mountPoint = document.createElement('div')
mountPoint.id = 'chatbot-widget-root'
shadowRoot.appendChild(mountPoint)

// Render React app into shadow DOM
const root = createRoot(mountPoint)
root.render(<ChatWidget tenantSlug={tenantSlug} apiBase={apiBase} />)