import React, { useState, useEffect } from 'react'
import { apiFetch } from '../api'

interface AnalyticsData {
  total_tenants: number
  active_tenants: number
  total_conversations: number
  total_appointments: number
  total_messages: number
  messages_last_7_days: number
  appointments_last_7_days: number
  top_tenants: Array<{ name: string; slug: string; conversations: number }>
  cards?: {
    total_sent: number
    sent_last_7_days: number
    by_kind: Array<{ kind: string; count: number; clicks: number; conversion: number }>
  }
  picker_opens?: number
  slot_picks?: number
}

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await apiFetch('/admin/analytics')
        const text = await response.text().catch(() => '')
        if (!response.ok) {
          if (!cancelled) setError(text || `Request failed (${response.status})`)
          return
        }
        let json: Record<string, unknown>
        try {
          json = JSON.parse(text)
        } catch {
          if (!cancelled) setError('The server returned an unreadable response.')
          return
        }
        const top = Array.isArray(json.top_tenants) ? json.top_tenants : []
        const rawCards =
          json.cards && typeof json.cards === 'object'
            ? (json.cards as {
                total_sent?: unknown
                sent_last_7_days?: unknown
                by_kind?: unknown
              })
            : null
        const pickerOpens = toNum(json.picker_opens)
        const slotPicks = toNum(json.slot_picks)
        if (!cancelled) {
          setData({
            total_tenants: toNum(json.total_tenants),
            active_tenants: toNum(json.active_tenants),
            total_conversations: toNum(json.total_conversations),
            total_appointments: toNum(json.total_appointments),
            total_messages: toNum(json.total_messages),
            messages_last_7_days: toNum(json.messages_last_7_days),
            appointments_last_7_days: toNum(json.appointments_last_7_days),
            top_tenants: top.map((t) => ({
              name: String((t as { name?: unknown }).name ?? ''),
              slug: String((t as { slug?: unknown }).slug ?? ''),
              conversations: toNum((t as { conversations?: unknown }).conversations),
            })),
            cards: rawCards
              ? {
                  total_sent: toNum(rawCards.total_sent),
                  sent_last_7_days: toNum(rawCards.sent_last_7_days),
                  by_kind: Array.isArray(rawCards.by_kind)
                    ? (rawCards.by_kind as Array<{
                        kind?: unknown
                        count?: unknown
                        clicks?: unknown
                        conversion?: unknown
                      }>).map((k) => ({
                        kind: String(k.kind ?? 'unknown'),
                        count: toNum(k.count),
                        clicks: toNum(k.clicks),
                        conversion: toNum(k.conversion),
                      }))
                    : [],
                }
              : undefined,
            picker_opens: pickerOpens,
            slot_picks: slotPicks,
          })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <div className="loading">Loading analytics...</div>
  if (error) {
    return (
      <div className="page">
        <h1>Analytics</h1>
        <div className="error-banner">Could not load analytics: {error}</div>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="page">
        <h1>Analytics</h1>
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h2>No analytics available</h2>
          <p>Analytics will appear once your tenants start chatting.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p className="page-subtitle">Usage across all your client workspaces.</p>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard title="Total Tenants" value={data.total_tenants} />
        <StatCard title="Active Tenants (30d)" value={data.active_tenants} />
        <StatCard title="Total Conversations" value={data.total_conversations} />
        <StatCard title="Total Appointments" value={data.total_appointments} />
        <StatCard title="Messages (7d)" value={data.messages_last_7_days} />
        <StatCard title="Appointments (7d)" value={data.appointments_last_7_days} />
      </div>

      {data.cards && (
        <div className="card">
          <h2>Interactive Cards</h2>
          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <StatCard title="Cards Sent (total)" value={data.cards.total_sent} />
            <StatCard title="Cards Sent (7d)" value={data.cards.sent_last_7_days} />
            <StatCard title="Slot Picker Opens (30d)" value={data.picker_opens ?? 0} />
            <StatCard title="Slots Chosen (30d)" value={data.slot_picks ?? 0} />
          </div>
          {data.cards.by_kind.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Card kind</th>
                    <th>Sent</th>
                    <th>Clicks</th>
                    <th>Click-through</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cards.by_kind.map((k) => {
                    const total = data.cards!.by_kind.reduce((s, x) => s + x.count, 0) || 1
                    const pct = Math.round((k.count / total) * 100)
                    return (
                      <tr key={k.kind}>
                        <td><code>{k.kind}</code></td>
                        <td>{k.count.toLocaleString()}</td>
                        <td>{k.clicks.toLocaleString()}</td>
                        <td>{k.conversion > 0 ? `${k.conversion}%` : '\u2014'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 120,
                                height: 6,
                                borderRadius: 3,
                                background: '#E2E8F0',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: '#3B82F6',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 12, color: '#64748B' }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No cards sent yet — they appear once a tenant's widget shows quick replies or prompts.</p>
          )
          }
        </div>
      )}

      <div className="card">
        <h2>Top Tenants by Conversations</h2>
        {data.top_tenants.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tenant</th>
                  <th>Slug</th>
                  <th>Conversations</th>
                </tr>
              </thead>
              <tbody>
                {data.top_tenants.map((tenant, i) => (
                  <tr key={tenant.slug || i}>
                    <td>{i + 1}</td>
                    <td>{tenant.name}</td>
                    <td>
                      <code>{tenant.slug}</code>
                    </td>
                    <td>{tenant.conversations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No data yet — start a conversation from a widget to see it here.</p>
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="stat-card">
      <h3>{title}</h3>
      <p className="stat-value">{value.toLocaleString()}</p>
    </div>
  )
}
