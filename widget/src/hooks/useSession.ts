import { useState, useEffect, useCallback } from 'react'

export function useSession(tenantSlug: string) {
  const [sessionId] = useState(() => {
    const stored = localStorage.getItem(`chatbot_session_${tenantSlug}`)
    if (stored) return stored
    const newId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem(`chatbot_session_${tenantSlug}`, newId)
    return newId
  })

  const [conversationId, setConversationId] = useState<string | null>(() => {
    return localStorage.getItem(`chatbot_conversation_${tenantSlug}`)
  })

  const saveConversationId = useCallback((id: string) => {
    localStorage.setItem(`chatbot_conversation_${tenantSlug}`, id)
    setConversationId(id)
  }, [tenantSlug])

  const clearSession = useCallback(() => {
    localStorage.removeItem(`chatbot_conversation_${tenantSlug}`)
    setConversationId(null)
  }, [tenantSlug])

  return { sessionId, conversationId, saveConversationId, clearSession }
}