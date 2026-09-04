import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { FileUploader } from '../components/FileUploader'
import { BusinessHoursEditor } from '../components/BusinessHoursEditor'
import { apiFetch } from '../api'

interface TenantDetail {
  id: string
  slug: string
  name: string
  plan: string
  settings: any
  business_hours: any
  timezone: string
  slot_duration: number
  buffer_minutes: number
}

interface Conversation {
  id: string
  end_user_id: string
  status: string
  created_at: number
  updated_at: number
  message_count: number
  last_message: string
}

interface Appointment {
  id: string
  start_time: number
  end_time: number
  status: string
  title?: string
  end_user_email?: string
}

export function TenantDetail() {
  const { tenantId } = useParams()
  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'conversations' | 'appointments' | 'knowledge' | 'settings'>('overview')
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const [tenantRes, convRes, apptRes] = await Promise.all([
        apiFetch(`/admin/tenants/${tenantId}`),
        apiFetch(`/admin/tenants/${tenantId}/conversations`),
        apiFetch(`/admin/tenants/${tenantId}/appointments`)
      ])

      if (tenantRes.ok) setTenant(await tenantRes.json())
      if (convRes.ok) setConversations(await convRes.json())
      if (apptRes.ok) setAppointments(await apptRes.json())
    } catch (e) {
      console.error('Failed to fetch tenant data:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [tenantId])

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: '#10B981',
      pending: '#F59E0B',
      cancelled: '#EF4444',
      completed: '#3B82F6',
      active: '#10B981'
    }
    return colors[status] || '#64748B'
  }

  if (loading) return <div className="loading">Loading...</div>
  if (!tenant) return <div className="error">Tenant not found</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{tenant.name}</h1>
          <p className="tenant-slug">Slug: {tenant.slug} • Plan: {tenant.plan}</p>
        </div>
        <div className="page-header-actions">
          <span className="embed-code">
            Embed: <code><script src="..." data-tenant="{tenant.slug}"></script></code>
          </span>
        </div>
      </div>

      <div className="tabs">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'conversations', label: 'Conversations' },
          { id: 'appointments', label: 'Appointments' },
          { id: 'knowledge', label: 'Knowledge' },
          { id: 'settings', label: 'Settings' }
        ].map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id as any)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'overview' && tenant && (
          <div className="overview-grid">
            <div className="stat-card">
              <h3>Total Conversations</h3>
              <p className="stat-value">{conversations.length}</p>
            </div>
            <div className="stat-card">
              <h3>Total Appointments</h3>
              <p className="stat-value">{appointments.length}</p>
            </div>
            <div className="stat-card">
              <h3>Confirmed Bookings</h3>
              <p className="stat-value">
                {appointments.filter(a => a.status === 'confirmed').length}
              </p>
            </div>
            <div className="stat-card">
              <h3>Pending</h3>
              <p className="stat-value">
                {appointments.filter(a => a.status === 'pending').length}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'conversations' && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Messages</th>
                  <th>Status</th>
                  <th>Last Message</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((conv) => (
                  <tr key={conv.id}>
                    <td><code>{conv.id.slice(0, 8)}...</code></td>
                    <td>{conv.end_user_email || (conv.end_user_id ? conv.end_user_id.slice(0, 8) + '...' : 'Anonymous')}</td>
                    <td>{conv.message_count}</td>
                    <td>
                      <span className="badge" style={{ backgroundColor: getStatusColor(conv.status) }}>
                        {conv.status}
                      </span>
                    </td>
                    <td className="truncate" style={{ maxWidth: 300 }}>{conv.last_message}</td>
                    <td>{formatDateTime(conv.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'appointments' && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Customer</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appt) => (
                  <tr key={appt.id}>
                    <td>{formatDateTime(appt.start_time).split(',')[0]}</td>
                    <td>{formatTime(appt.start_time)} - {formatTime(appt.end_time)}</td>
                    <td>{appt.title || 'Appointment'}</td>
                    <td>
                      <span className="badge" style={{ backgroundColor: getStatusColor(appt.status) }}>
                        {appt.status}
                      </span>
                    </td>
                    <td>{appt.end_user_email || 'Unknown'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'knowledge' && (
          <FileUploader tenantId={tenantId!} onUpload={fetchData} />
        )}

        {activeTab === 'settings' && tenant && (
          <div className="settings-form">
            <BusinessHoursEditor
              businessHours={tenant.business_hours}
              timezone={tenant.timezone}
              slotDuration={tenant.slot_duration}
              bufferMinutes={tenant.buffer_minutes}
              onSave={async (settings) => {
                const res = await apiFetch(`/admin/tenants/${tenantId}`, {
                  method: 'PATCH',
                  body: JSON.stringify(settings)
                })
                if (res.ok) {
                  const updated = await res.json()
                  setTenant(updated)
                  alert('Settings saved')
                } else {
                  alert('Failed to save settings')
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}