import { useState, useCallback, useRef, useEffect } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  intent?: string
  read?: boolean
  card?: any
  interactive?: boolean
}

interface Slot {
  start_time: number
  end_time: number
  available: boolean
}

interface Card {
  id: string
  kind: 'quick_replies' | 'contact_card' | 'booking_prompt' | 'cancel_lookup' | 'booking_confirm' | 'cancel_confirm'
  title?: string
  subtitle?: string
  chips?: string[]
  actions?: { label: string; send_message?: string; mailto?: string; url?: string; open_slots?: boolean }[]
}

function apiUrl(apiBase: string, path: string): string {
  return apiBase ? `${apiBase.replace(/\/+$/, '')}${path}` : path
}

/**
 * Fire-and-forget engagement event to POST /widget/telemetry/:slug. Never
 * throws, never blocks the UI; failures are silently dropped.
 */
export function trackEvent(
  apiBase: string,
  tenantSlug: string,
  event: 'card_clicked' | 'picker_opened' | 'slot_chosen',
  meta: { kind?: string; label?: string; source?: string } = {},
): void {
  try {
    const body = JSON.stringify({ event, ...meta })
    fetch(apiUrl(apiBase, `/widget/telemetry/${tenantSlug}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* telemetry is best-effort */
    })
  } catch {
    /* telemetry is best-effort */
  }
}

/**
 * Turn history rows into renderable messages. A row holds the answer text and
 * its follow-up card (tool_calls) together — keep them together so a restored
 * conversation shows the same single-message answers as the live stream.
 * Only the newest card stays clickable (single pending card rule).
 */
export function restoreHistory(rows: any[]): Message[] {
  const list = Array.isArray(rows) ? rows : []
  let lastCardIndex = -1
  list.forEach((m, i) => {
    if (m && m.role === 'assistant' && m.card) lastCardIndex = i
  })
  const out: Message[] = []
  list.forEach((m, i) => {
    if (!m) return
    const content = String(m.content ?? '')
    const card = m.role === 'assistant' && m.card ? m.card : undefined
    if (!content && !card) return
    out.push({
      id: m.id,
      role: m.role,
      content,
      intent: m.intent ?? undefined,
      card,
      interactive: card ? i === lastCardIndex : undefined,
    })
  })
  return out
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
  /** Card action asked for the slot picker; ChatWidget opens it on change. */
  const [pickerRequestId, setPickerRequestId] = useState(0)

  const eventSourceRef = useRef<EventSource | null>(null)
  // The rolling-week slots returned by the chat stream; restored when the
  // user clears a hand-picked date in the picker.
  const weekSlotsRef = useRef<Slot[]>([])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    // Any new message discards a pending slot-picker choice (it re-opens if
    // the user asks about availability again) and collapses any open card
    // (plan §5.1: one pending card at a time).
    setSlots([])
    setPendingAction(null)
    setMessages((prev) => prev.map((m) => (m.card ? { ...m, interactive: false } : m)))

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
          if (last && last.role === 'assistant' && !last.card) {
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

      case 'card':
        // Server-driven interactive card (docs/interactive-cards-plan.md).
        // Attached to the answer it belongs to so the reply and its
        // suggestions render as ONE message, not two.
        if (data.card && data.card.id) {
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && !last.card && last.content) {
              return [
                ...prev.slice(0, -1),
                { ...last, card: data.card as Card, interactive: true },
              ]
            }
            return [
              ...prev,
              {
                id: data.card.id as string,
                role: 'assistant' as const,
                content: '',
                card: data.card as Card,
                interactive: true,
              },
            ]
          })
        }
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

  /** Open the slot picker on request from a card action (booking chips). */
  const openSlotPicker = useCallback(async (source = 'card') => {
    trackEvent(apiBase, tenantSlug, 'picker_opened', { source })
    if (!weekSlotsRef.current.length) {
      try {
        const response = await fetch(
          apiUrl(apiBase, `/widget/appointments/${tenantSlug}/availability?days=7`),
        )
        if (response.ok) {
          const data = await response.json()
          weekSlotsRef.current = data.slots || []
        }
      } catch {
        // picker shows empty state; user can still pick a date
      }
    }      setSlots(weekSlotsRef.current || [])
      setPendingAction('pick_slot')
      setPickerRequestId((n) => n + 1)
  }, [tenantSlug, apiBase])

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
    trackEvent(apiBase, tenantSlug, 'slot_chosen', { source: 'picker' })
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
      const confirmationText = data.confirmation_message
        ? `${data.confirmation_message} (${when}, ${at})`
        : `You're booked for ${when} at ${at}. A confirmation email is on its way to ${email}.`
      // Local Phase-C confirmation card (widget-side booking path). Kept in
      // session state only — the DB row is the booking notification, so this
      // card deliberately does not survive a history reload. It is attached
      // to the confirmation text so the booking reads as one message.
      const gcal = (() => {
        const fmt = (ts: number) =>
          new Date(ts * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
        const params = new URLSearchParams({
          action: 'TEMPLATE',
          text: `Appointment \u2014 ${when} ${at}`,
          dates: `${fmt(slot.start_time)}/${fmt(slot.end_time)}`,
        })
        return `https://calendar.google.com/calendar/render?${params.toString()}`
      })()
      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}`,
        role: 'assistant' as const,
        content: confirmationText,
        card: {
          id: `card_${Date.now()}_confirm`,
          kind: 'booking_confirm' as const,
          title: 'You\u2019re booked',
          subtitle: `A confirmation email is on its way to ${email}.`,
          service: 'Appointment',
          when: `${when}, ${at}`,
          email,
          calendar_url: gcal,
          actions: [
            { label: 'Add to Google Calendar', url: gcal },
            { label: 'Book another time', send_message: 'What times are you available this week?' },
          ],
        },
      }])
      return { ok: true }
    } catch (e) {
      console.error('Booking failed:', e)
      return { ok: false, error: 'Network error — please try again.', conflict: false }
    }
  }, [tenantSlug, apiBase])

  // Mirror messages synchronously so the effect below can tell a restored
  // session (needs history) from a live stream (already has its messages).
  const messagesRef = useRef<Message[]>([])
  messagesRef.current = messages

  // Load history only when a stored conversation is restored on mount.
  // The first live answer assigns the new conversation_id — reloading there
  // would replace the just-streamed messages and hide the answer behind its
  // own follow-up card, so skip when we already have messages.
  useEffect(() => {
    if (conversationId && messagesRef.current.length === 0) {
      loadHistory(conversationId)
    }
  }, [conversationId, tenantSlug, apiBase])

  const loadHistory = async (convId: string) => {
    try {
      const response = await fetch(apiUrl(apiBase, `/widget/history/${tenantSlug}?conversation_id=${convId}`))
      if (response.ok) {
        const data = await response.json()
        setMessages(restoreHistory(data.messages || []))
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
    openSlotPicker,
    pickerRequestId,
    setConversationId,
    reset,
    fetchAvailableDate,
    bookSlot
  }
}