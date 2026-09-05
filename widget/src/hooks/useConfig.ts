import { useState, useCallback } from 'react'

interface WidgetConfig {
  tenant_slug: string
  tenant_name: string
  bot_name: string
  greeting: string
  primary_color: string
  secondary_color: string
  logo_url?: string
  show_branding: boolean
  business_hours?: Record<string, any>
  quick_replies?: string[]
}

function apiUrl(apiBase: string, path: string): string {
  return apiBase ? `${apiBase.replace(/\/+$/, '')}${path}` : path
}

export function useConfig(tenantSlug: string, apiBase = '') {
  const [data, setData] = useState<WidgetConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const response = await window.fetch(apiUrl(apiBase, `/widget/config/${tenantSlug}`))
      if (!response.ok) throw new Error('Failed to load config')
      const config = await response.json()
      setData(config)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, apiBase])

  return { data, loading, error, load }
}
