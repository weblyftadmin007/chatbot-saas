import React from 'react'

export function PublishSection({ tenant }: { tenant: { slug: string } }) {
  const widgetUrl = 'https://chatbot-widget.example.com/widget.js'
  const embedSnippet = `<script src="${widgetUrl}" data-tenant="${tenant.slug}"></script>`

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
          Place this file on your live site: <code>chatbot-widget.example.com/widget.js</code>
        </span>
      </div>
      <pre className="embed-code"><code>{embedSnippet}</code></pre>
    </div>
  )
}
