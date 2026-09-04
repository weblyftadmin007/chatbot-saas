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

export function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/admin/analytics')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Loading analytics...</div>
  if (!data) return <div className="error">Failed to load analytics</div>

  return (
    <div className="page">
      <h1>Platform Analytics</h1>

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
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Slug</th>
                <th>Conversations</th>
              </tr>
            </thead>
            <tbody>
              {data.top_tenants.map((tenant, i) => (
                <tr key={tenant.slug}>
                  <td>{i + 1}. {tenant.name}</td>
                  <td>{tenant.slug}</td>
                  <td>{tenant.conversations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No data yet</p>
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