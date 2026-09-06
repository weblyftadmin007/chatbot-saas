import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChatButton } from './components/ChatButton'
import { ChatPanel } from './components/ChatPanel'
import { useConfig } from './hooks/useConfig'
import { useChat } from './hooks/useChat'
import { useSession } from './hooks/useSession'

interface ChatWidgetProps {
  tenantSlug: string
  apiBase?: string
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ tenantSlug, apiBase = '' }) => {
  const config = useConfig(tenantSlug, apiBase)
  const session = useSession(tenantSlug)
  const chat = useChat(tenantSlug, session.conversationId, session.sessionId, session.saveConversationId, apiBase)

  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const selectedDateRef = useRef<string | null>(null)

  // Load config on mount
  useEffect(() => {
    config.load()
  }, [tenantSlug])

  // 30-min inactivity expiry: once config is available, drop the stale
  // conversation if the last activity is older than the tenant timeout.
  useEffect(() => {
    if (!config.data) return
    const last = session.getLastActivity()
    const timeoutMin = config.data.session_timeout_minutes ?? 30
    if (last && Date.now() - last > timeoutMin * 60000) {
      chat.reset()
      session.clearSession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.data])

  // Handle new messages when closed
  useEffect(() => {
    if (!isOpen && chat.messages.length > 0) {
      const lastMsg = chat.messages[chat.messages.length - 1]
      if (lastMsg.role === 'assistant' && !lastMsg.read) {
        setUnreadCount(prev => prev + 1)
      }
    }
  }, [chat.messages, isOpen])

  const toggleChat = useCallback(() => {
    const opening = !isOpen
    if (opening) {
      const last = session.getLastActivity()
      const timeoutMin = config.data?.session_timeout_minutes ?? 30
      if (last && Date.now() - last > timeoutMin * 60000) {
        chat.reset()
        session.clearSession()
      }
      session.markActive()
    }
    setIsOpen(opening)
    if (unreadCount > 0) {
      setUnreadCount(0)
    }
  }, [isOpen, unreadCount, config.data, session, chat])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleSendMessage = useCallback((content: string) => {
    session.markActive()
    chat.sendMessage(content)
  }, [session, chat])

  const handleDateChange = useCallback((iso: string | null) => {
    selectedDateRef.current = iso
    chat.fetchAvailableDate(iso)
  }, [chat])

  const handleSelectSlot = useCallback(async (slot: any, email?: string, name?: string) => {
    session.markActive()
    if (!email) return
    setBookingBusy(true)
    setBookingError(null)
    const res = await chat.bookSlot(slot, email, name || '')
    setBookingBusy(false)
    if (!res.ok) {
      if (res.conflict) {
        setBookingError('That time was just taken — please pick another.')
        chat.fetchAvailableDate(selectedDateRef.current)
      } else {
        setBookingError(res.error || 'Booking failed — please try again.')
      }
    } else {
      setBookingError(null)
    }
  }, [session, chat])

  if (!config.data) {
    return null // Still loading config
  }

  return (
    <>
      <ChatButton
        isOpen={isOpen}
        onClick={toggleChat}
        unreadCount={unreadCount}
        primaryColor={config.data.primary_color}
        botName={config.data.bot_name}
      />
      {isOpen && (
        <ChatPanel
          config={config.data}
          messages={chat.messages}
          isLoading={chat.isLoading}
          onSendMessage={handleSendMessage}
          onClose={handleClose}
          conversationId={chat.conversationId}
          sessionId={session.sessionId}
          slots={chat.slots}
          pendingAction={chat.pendingAction}
          selectSlot={handleSelectSlot}
          onDateChange={handleDateChange}
          onClosePicker={chat.closePicker}
          horizonDays={config.data.booking_horizon_days ?? 60}
          busy={bookingBusy}
          error={bookingError}
        />
      )}
    </>
  )
}