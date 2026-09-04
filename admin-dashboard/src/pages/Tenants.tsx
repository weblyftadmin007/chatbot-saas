import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'

interface Tenant {
  id: string
  slug: string
  name: string
  plan: string
  created_at: number
  conversation_count?: number
}

export function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [debug, setDebug] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [newTenant, setNewTenant] = useState({ name: '', slug: '', color: '#3B82F6' })

  const fetchTenants = async () => {
    try {
      setLoading(true)
      setError(null)
      setDebug(null)
      const response = await apiFetch('/admin/tenants')
      const text = await response.text().catch(() => '')
      setDebug(`Status ${response.status}: ${text.slice(0, 400)}`)
      if (response.ok) {
        try {
          const data = JSON.parse(text)
          setTenants(Array.isArray(data.tenants) ? data.tenants : [])
        } catch {
          setError('Response was not valid JSON')
        }
      } else {
        setError(`Request failed (${response.status}): ${text}`)
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await apiFetch('/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: newTenant.name,
          slug: newTenant.slug,
          primary_color: newTenant.color
        })
      })
      if (response.ok) {
        setShowModal(false)
        setNewTenant({ name: '', slug: '', color: '#3B82F6' })
        fetchTenants()
      }
    } catch (e) {
      console.error('Failed to create tenant:', e)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tenants</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          Add Tenant
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <strong>Could not load tenants:</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="loading">Loading tenants...</div>
      ) : (
        <div className="tenants-grid">
          {tenants.map((tenant) => (
            <Link key={tenant.id} to={`/tenants/${tenant.id}`} className="tenant-card">
              <div className="tenant-card-header">
                <div className="tenant-avatar" style={{ backgroundColor: '#3B82F6' }}>
                  {tenant.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3>{tenant.name}</h3>
                  <p className="tenant-slug">{tenant.slug}</p>
                </div>
              </div>
              <div className="tenant-card-stats">
                <span className={`badge badge-${tenant.plan}`}>{tenant.plan}</span>
                <span>Created: {formatDate(tenant.created_at)}</span>
              </div>
            </Link>
          ))}
          {tenants.length === 0 && (
            <div className="empty-state">
              <p>No tenants yet. Click "Add Tenant" to create your first client.</p>
              {debug && (
                <p style={{ fontSize: 12, color: '#64748B', wordBreak: 'break-all' }}>
                  API said: {debug}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add New Tenant</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Business Name</label>
                <input
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Slug (URL-friendly)</label>
                <input
                  type="text"
                  value={newTenant.slug}
                  onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  required
                  pattern="^[a-z0-9-]+$"
                />
                <small>Used in widget embed code</small>
              </div>
              <div className="form-group">
                <label>Primary Color</label>
                <input
                  type="color"
                  value={newTenant.color}
                  onChange={(e) => setNewTenant({ ...newTenant, color: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}