import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FileUploader } from '../components/FileUploader'
import { BusinessHoursEditor } from '../components/BusinessHoursEditor'
import { PublishSection } from '../components/PublishSection'
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
  end_user_id?: string | null | number | Record<string, unknown> | unknown[]
  end_user_email?: string | null
  status: string
  created_at: number
  updated_at: number
  message_count: number
  last_message: string
}

function userLabel(c: Conversation): string {
  if (c.end_user_email) return c.end_user_email
  const id = c.end_user_id
  if (typeof id === 'string' && id.length > 0) {
    return `User ${id.slice(0, 8)}`
  }
  if (typeof id === 'number') return `User ${id}`
  if (id != null) return `User <non-string id>`
  return 'User <no id>'
}

interface Appointment {
  id: string
  start_time: number
  end_time: number
  status: string
  title?: string
  end_user_email?: string
  notify_status?: string
  notify_error?: string
  remind_status?: string
}

export function TenantDetail() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'conversations' | 'appointments' | 'knowledge' | 'settings'>('overview')
  const [loading, setLoading] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  const getNotifyColor = (status: string) => {
    const colors: Record<string, string> = {
      sent: '#10B981',
      pending: '#F59E0B',
      failed: '#EF4444',
      reminded: '#10B981',
      remind_failed: '#EF4444'
    }
    return colors[status] || '#64748B'
  }

  const retryNotify = async (apptId: string) => {
    try {
      const res = await apiFetch(`/admin/tenants/${tenantId}/appointments/${apptId}/notify`, {
        method: 'POST'
      })
      if (res.ok) {
        await fetchData()
      } else {
        alert('Retry failed — check the GAS URL / sheet config.')
      }
    } catch (e) {
      alert('Retry failed unexpectedly.')
    }
  }

  const handleDelete = async () => {
    if (!tenantId) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await apiFetch(`/admin/tenants/${tenantId}`, { method: 'DELETE' })
      const text = await res.text().catch(() => '')
      if (res.ok) {
        navigate('/tenants')
      } else {
        let detail = text
        try { detail = JSON.parse(text).detail || text } catch { /* keep raw text */ }
        setDeleteError(detail || `Request failed (${res.status})`)
        setDeleting(false)
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Unknown error')
      setDeleting(false)
    }
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
          <PublishSection tenant={tenant} />
          <button
            className="btn btn-danger"
            onClick={() => {
              setDeleteError(null)
              setShowDeleteModal(true)
            }}
          >
            Delete Tenant
          </button>
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

        {activeTab === 'overview' && tenant && (
          <div className="tab-content">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Conversations</h3>
                <p className="stat-value">{conversations.length}</p>
              </div>
              <div className="stat-card">
                <h3>Appointments</h3>
                <p className="stat-value">{appointments.length}</p>
              </div>
              <div className="stat-card">
                <h3>Schedule Settings</h3>
                <p>
                  Slot duration: <strong>{tenant.slot_duration} min</strong>
                </p>
                <p>
                  Buffer time: <strong>{tenant.buffer_minutes} min</strong>
                </p>
                <p>
                  Timezone: <strong>{tenant.timezone}</strong>
                </p>
              </div>
            </div>

            {conversations.length > 0 && (
              <div className="table-card">
                <h3>Recent Conversations</h3>
                <table>
                  <thead>
                    <tr>
                      <th>End User</th>
                      <th>Last Message</th>
                      <th>Status</th>
                      <th>Messages</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversations.slice(0, 10).map((c) => (
                      <tr key={c.id}>
                        <td>{userLabel(c)}</td>
                        <td className="last-message">{c.last_message}</td>
                        <td>
                          <span
                            className="status-badge"
                            style={{ backgroundColor: getStatusColor(c.status) }}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td>{c.message_count}</td>
                        <td>{formatDateTime(c.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {conversations.length === 0 && (
              <div className="empty-state">
                <h2>No conversations yet</h2>
                <p>Once the widget is live on the tenant's website, conversations will appear here.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'conversations' && (
          <div className="tab-content">
            <div className="table-card">
              <h3>All Conversations</h3>
              {conversations.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>End User</th>
                      <th>Last Message</th>
                      <th>Status</th>
                      <th>Messages</th>
                      <th>Created</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversations.map((c) => (
                      <tr key={c.id}>
                        <td>{userLabel(c)}
                        </td>
                        <td className="last-message">{c.last_message}</td>
                        <td>
                          <span
                            className="status-badge"
                            style={{ backgroundColor: getStatusColor(c.status) }}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td>{c.message_count}</td>
                        <td>{formatDateTime(c.created_at)}</td>
                        <td>{formatDateTime(c.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <h2>No conversations</h2>
                  <p>Conversations will appear here once visitors start chatting with the bot.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'appointments' && (
          <div className="tab-content">
            <div className="table-card">
              <h3>Appointments</h3>
              {appointments.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Notification</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((a) => (
                      <tr key={a.id}>
                        <td>{a.title || '—'}</td>
                        <td>{formatDateTime(a.start_time)}</td>
                        <td>{formatDateTime(a.end_time)}</td>
                        <td>{a.end_user_email || '—'}</td>
                        <td>
                          <span
                            className="status-badge"
                            style={{ backgroundColor: getStatusColor(a.status) }}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td>
                          {a.notify_status && (
                            <span
                              className="status-badge"
                              style={{ backgroundColor: getNotifyColor(a.notify_status) }}
                            >
                              {a.notify_status}
                            </span>
                          )}
                          {a.notify_error && (
                            <span className="notify-error">{a.notify_error}</span>
                          )}
                        </td>
                        <td>
                          {a.status === 'confirmed' && (
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => retryNotify(a.id)}
                            >
                              Retry notify
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <h2>No appointments</h2>
                  <p>Appointment bookings will appear here once the booking flow is enabled.</p>
                </div>
              )}
            </div>
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
              gasUrl={tenant.settings?.gas_url}
              notificationEmail={tenant.settings?.notification_email}
              spreadsheetId={tenant.settings?.spreadsheet_id}
              gasSecret={tenant.settings?.gas_secret}
              quickReplies={tenant.settings?.quick_replies}
              bookingHorizon={tenant.settings?.booking_horizon_days}
              sessionTimeout={tenant.settings?.session_timeout_minutes}
              cardsEnabled={tenant.settings?.cards_enabled !== false}
              botName={tenant.settings?.bot_name}
              botAvatar={tenant.settings?.bot_avatar}
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

      {showDeleteModal && tenant && (
        <div className="modal-overlay" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="modal modal-danger" onClick={(e) => e.stopPropagation()}>
            <h2>Delete "{tenant.name}"?</h2>
            <div className="delete-warning">
              <p className="delete-warning-title">⚠️ This will permanently affect this tenant:</p>
              <ul>
                <li>The chat widget on the tenant's website <strong>stops working immediately</strong> — visitors will no longer see the chat button or be able to start conversations.</li>
                <li>The tenant is <strong>removed from this dashboard</strong> (Tenants list and Analytics).</li>
                <li>Its knowledge base, conversations, and messages become <strong>inaccessible</strong>.</li>
              </ul>
              <p className="delete-warning-note">This cannot be undone from the dashboard.</p>
            </div>
            {deleteError && <div className="error-banner" style={{ marginTop: 16 }}>{deleteError}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Yes, delete this tenant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
