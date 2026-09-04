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
