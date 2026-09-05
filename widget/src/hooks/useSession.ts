import { useState, useCallback } from 'react'

export function useSession(tenantSlug: string) {
  const sessionKey = `chatbot_session_${tenantSlug}`
  const conversationKey = `chatbot_conversation_${tenantSlug}`
  const activityKey = `chatbot_activity_${tenantSlug}`

  const [sessionId] = useState(() => {
    const stored = localStorage.getItem(sessionKey)
    if (stored) return stored
    const newId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem(sessionKey, newId)
    return newId
  })

  const [conversationId, setConversationId] = useState<string | null>(() => {
    return localStorage.getItem(conversationKey)
  })

  const saveConversationId = useCallback((id: string) => {
    localStorage.setItem(conversationKey, id)
    setConversationId(id)
  }, [conversationKey])

  const clearSession = useCallback(() => {
    localStorage.removeItem(conversationKey)
    setConversationId(null)
  }, [conversationKey])

  /** Epoch (ms) of the last user activity, or 0 if never. */
  const getLastActivity = useCallback(() => {
    return Number(localStorage.getItem(activityKey) || 0)
  }, [activityKey])

  /** Record user activity now (bumps the inactivity clock). */
  const markActive = useCallback(() => {
    localStorage.setItem(activityKey, String(Date.now()))
  }, [activityKey])

  return { sessionId, conversationId, saveConversationId, clearSession, getLastActivity, markActive }
}