import React, { useState } from 'react'

export function PublishSection({ tenant }: { tenant: { slug: string } }) {
  // Widget host and API origin are configurable at build time via
  // VITE_WIDGET_URL / VITE_API_URL. Both fall back to the known production
  // hosts so the link and snippet are never a dead placeholder.
  const widgetBase = (import.meta.env.VITE_WIDGET_URL || 'https://chatbot-widget-0of.pages.dev')
    .replace(/\/+$/, '')
  const apiBase = (import.meta.env.VITE_API_URL || 'https://chatbot-api.weblyftt.workers.dev')
    .replace(/\/+$/, '')
  const widgetUrl = `${widgetBase}/widget.js`
  // The widget is served from a different origin than the API, so the embed
  // code must pass data-api-url or the widget would call the wrong origin.
  const embedSnippet = `<script src="${widgetUrl}" data-tenant="${tenant.slug}" data-api-url="${apiBase}"></script>`

  const [copied, setCopied] = useState(false)

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (e.g. insecure context) — leave the code
      // visible so the user can select and copy it manually.
    }
  }

  return (
    <div className="publish-section">
      <div className="publish-section-row">
        <a
          className="embed-code-link"
          href={widgetUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1={6} y1={13} x2={12} y2={13} />
          </svg>
          Open live widget script
        </a>
        <span className="publishable-notice">
          Place this file on your live site: <code>{widgetUrl}</code>
        </span>
      </div>

      <p className="embed-code-label">
        Add this to the tenant's website (before <code>&lt;/body&gt;</code>):
      </p>
      <pre className="embed-code"><code>{embedSnippet}</code></pre>
      <div className="embed-actions">
        <button
          type="button"
          className="btn btn-sm btn-secondary embed-copy-btn"
          onClick={copySnippet}
        >
          {copied ? 'Copied!' : 'Copy embed code'}
        </button>

        <a
          className="btn btn-sm btn-primary embed-test-btn"
          href={
            `https://ai-chatbot-proposal.pages.dev/test?` +
            new URLSearchParams({
              tenant: tenant.slug,
            })
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          Test widget
        </a>
      </div>
    </div>
  )
}
