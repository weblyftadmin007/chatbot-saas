import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'

interface Tenant {
  id: string
  slug: string
  name: string
  plan: string
  created_at: number
  settings?: { primary_color?: string; bot_name?: string }
}

function tenantColor(t: Tenant): string {
  const c = t.settings?.primary_color
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#3B82F6'
}

export function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newTenant, setNewTenant] = useState({ name: '', slug: '', color: '#3B82F6' })

  const fetchTenants = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiFetch('/admin/tenants')
      const text = await response.text().catch(() => '')
      if (response.ok) {
        try {
          const data = JSON.parse(text)
          setTenants(Array.isArray(data.tenants) ? data.tenants : [])
        } catch {
          setError('The server returned an unreadable response.')
        }
      } else {
        setError(text || `Request failed (${response.status})`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTenants()
  }, [])

  const openModal = () => {
    setCreateError(null)
    setShowModal(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const response = await apiFetch('/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: newTenant.name,
          slug: newTenant.slug,
          primary_color: newTenant.color,
        }),
      })
      const text = await response.text().catch(() => '')
      if (response.ok) {
        setShowModal(false)
        setNewTenant({ name: '', slug: '', color: '#3B82F6' })
        fetchTenants()
      } else {
        let detail = text
        try {
          detail = JSON.parse(text).detail || text
        } catch {
          /* keep raw text */
        }
        setCreateError(detail || `Request failed (${response.status})`)
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCreating(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Tenants</h1>
          <p className="page-subtitle">Manage your client workspaces and their chat widgets.</p>
        </div>
        <button className="btn btn-primary" onClick={openModal}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Tenant
        </button>
      </div>

      {error && <div className="error-banner">Could not load tenants: {error}</div>}

      {loading ? (
        <div className="loading">Loading tenants...</div>
      ) : tenants.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏢</div>
          <h2>No tenants yet</h2>
          <p>Click "Add Tenant" to create your first client workspace.</p>
        </div>
      ) : (
        <div className="tenants-grid">
          {tenants.map((tenant) => (
            <Link key={tenant.id} to={`/tenants/${tenant.id}`} className="tenant-card">
              <div className="tenant-card-header">
                <div className="tenant-avatar" style={{ backgroundColor: tenantColor(tenant) }}>
                  {tenant.name.charAt(0).toUpperCase()}
                </div>
                <div className="tenant-card-title">
                  <h3>{tenant.name}</h3>
                  <p className="tenant-slug">{tenant.slug}</p>
                </div>
              </div>
              <div className="tenant-card-footer">
                <span className={`badge badge-${tenant.plan}`}>{tenant.plan}</span>
                <span className="tenant-created">Created {formatDate(tenant.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add New Tenant</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label htmlFor="tenant-name">Business Name</label>
                <input
                  id="tenant-name"
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  placeholder="e.g. Weblyft Design"
                  required
                />
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label htmlFor="tenant-slug">Slug</label>
                <input
                  id="tenant-slug"
                  type="text"
                  value={newTenant.slug}
                  onChange={(e) =>
                    setNewTenant({ ...newTenant, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
                  }
                  placeholder="e.g. weblyft-design"
                  required
                  pattern="^[a-z0-9-]+$"
                />
                <small>Lowercase letters, numbers and hyphens. Used in the widget embed code.</small>
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label htmlFor="tenant-color">Primary Color</label>
                <div className="color-picker-row">
                  <input
                    id="tenant-color"
                    type="color"
                    value={newTenant.color}
                    onChange={(e) => setNewTenant({ ...newTenant, color: e.target.value })}
                  />
                  <code>{newTenant.color}</code>
                </div>
                <small>The chat widget button uses this color.</small>
              </div>

              {createError && <div className="error-banner" style={{ marginTop: 16 }}>{createError}</div>}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
