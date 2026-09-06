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
  // The rolling-week slots returned by the chat stream; restored when the
  // user clears a hand-picked date in the picker.
  const weekSlotsRef = useRef<Slot[]>([])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    // Any new message discards a pending slot-picker choice (it re-opens if
    // the user asks about availability again).
    setSlots([])
    setPendingAction(null)

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
        weekSlotsRef.current = data.slots || []
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
        break
    }
  }

  /**
   * Dismiss the slot picker (header ✕ button). The next availability question
   * re-opens it with fresh slots, so dropping the cached week slots is safe.
   */
  const closePicker = useCallback(() => {
    setSlots([])
    setPendingAction(null)
    weekSlotsRef.current = []
  }, [])

  const selectSlot = useCallback(async (slot: Slot | null, email?: string) => {
    // Defensive: a null slot just dismisses the picker.
    if (!slot) {
      closePicker()
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
  }, [sendMessage, closePicker])

  /** Start a fresh conversation (used by the 30-min inactivity expiry). */
  const reset = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setSlots([])
    setPendingAction(null)
    weekSlotsRef.current = []
  }, [])

  /**
   * Show slots for a specific date (fetched from the availability endpoint),
   * or restore the chat's rolling-week slots when passed null.
   */
  const fetchAvailableDate = useCallback(async (dateIso: string | null) => {
    if (!dateIso) {
      setSlots(weekSlotsRef.current || [])
      setPendingAction('pick_slot')
      return weekSlotsRef.current || []
    }
    try {
      const response = await fetch(
        apiUrl(apiBase, `/widget/appointments/${tenantSlug}/availability?date=${dateIso}`)
      )
      if (!response.ok) throw new Error('Availability request failed')
      const data = await response.json()
      const fetched: Slot[] = data.slots || []
      setSlots(fetched)
      setPendingAction('pick_slot')
      return fetched
    } catch (e) {
      console.error('Failed to fetch availability:', e)
      setSlots([])
      return []
    }
  }, [tenantSlug, apiBase])

  /** Book a slot directly via the REST endpoint (exact epochs, no text reparse). */
  const bookSlot = useCallback(async (slot: Slot, email: string, name: string) => {
    try {
      const response = await fetch(apiUrl(apiBase, `/widget/appointments/${tenantSlug}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          start_time: slot.start_time,
          end_time: slot.end_time
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          ok: false,
          error: (data.detail as string) || 'Booking failed',
          conflict: response.status === 409
        }
      }
      setSlots([])
      setPendingAction(null)
      const when = new Date(slot.start_time * 1000).toLocaleDateString([], {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
      const at = new Date(slot.start_time * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: data.confirmation_message
          ? `${data.confirmation_message} (${when}, ${at})`
          : `You're booked for ${when} at ${at}. A confirmation email is on its way to ${email}.`
      }])
      return { ok: true }
    } catch (e) {
      console.error('Booking failed:', e)
      return { ok: false, error: 'Network error — please try again.', conflict: false }
    }
  }, [tenantSlug, apiBase])

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
    closePicker,
    setConversationId,
    reset,
    fetchAvailableDate,
    bookSlot
  }
}