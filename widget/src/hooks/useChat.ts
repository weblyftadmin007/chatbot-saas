import { useState, useCallback, useRef, useEffect } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  intent?: string
  read?: boolean
}

interface Slot {
  start_time: number
  end_time: number
  available: boolean
}

function apiUrl(apiBase: string, path: string): string {
  return apiBase ? `${apiBase.replace(/\/+$/, '')}${path}` : path
}

export function useChat(
  tenantSlug: string,
  initialConversationId: string | null,
  sessionId?: string | null,
  onConversationChange?: (id: string) => void,
  apiBase = ''
) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const [slots, setSlots] = useState<Slot[]>([])
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    // Add user message immediately
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: content.trim()
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      const url = apiUrl(apiBase, `/widget/chat/${tenantSlug}`)
      const body = JSON.stringify({
        message: content,
        conversation_id: conversationId,
        session_id: sessionId || `session_${tenantSlug}`
      })

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      })

      if (!response.ok) throw new Error('Chat request failed')

      // Handle SSE stream
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              handleStreamData(data)
            } catch (e) {
              console.warn('Failed to parse SSE data:', line)
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.'
      }])
    } finally {
      setIsLoading(false)
    }
  }, [tenantSlug, conversationId, isLoading, apiBase])

  const handleStreamData = (data: any) => {
    switch (data.type) {
      case 'content':
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: last.content + data.content }]
          } else {
            return [...prev, {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: data.content
            }]
          }
        })
        break

      case 'slots':
        setSlots(data.slots)
        setPendingAction('pick_slot')
        break

      case 'done':
        if (data.conversation_id) {
          setConversationId(data.conversation_id)
          onConversationChange?.(data.conversation_id)
        }
        // Mark last assistant message as read
        setMessages(prev => prev.map((m, i) =>
          i === prev.length - 1 && m.role === 'assistant' ? { ...m, read: true } : m
        ))
        setPendingAction(null)
        break
    }
  }

  const selectSlot = useCallback(async (slot: Slot | null, email?: string) => {
    // SlotPicker's close button calls onSelect(null) — just dismiss it then.
    if (!slot) {
      setSlots([])
      setPendingAction(null)
      return
    }
    // Send slot selection as a message
    const timeStr = new Date(slot.start_time * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
    const dateStr = new Date(slot.start_time * 1000).toLocaleDateString()
    await sendMessage(
      `Book ${dateStr} at ${timeStr}${email ? ` ${email}` : ''}`
    )
    setSlots([])
  }, [sendMessage])

  // Load history on conversation change
  useEffect(() => {
    if (conversationId) {
      loadHistory(conversationId)
    }
  }, [conversationId, tenantSlug, apiBase])

  const loadHistory = async (convId: string) => {
    try {
      const response = await fetch(apiUrl(apiBase, `/widget/history/${tenantSlug}?conversation_id=${convId}`))
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (e) {
      console.warn('Failed to load history:', e)
    }
  }

  return {
    messages,
    isLoading,
    conversationId,
    slots,
    pendingAction,
    sendMessage,
    selectSlot,
    setConversationId
  }
}