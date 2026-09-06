import React, { useRef, useEffect } from 'react'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { SlotPicker } from './SlotPicker'

interface ChatPanelProps {
  config: any
  messages: any[]
  isLoading: boolean
  onSendMessage: (content: string) => void
  onClose: () => void
  conversationId: string | null
  sessionId: string
  slots: any[]
  pendingAction: string | null
  selectSlot: (slot: any, email?: string, name?: string) => void
  onDateChange: (dateIso: string | null) => void
  onClosePicker: () => void
  horizonDays: number
  busy?: boolean
  error?: string | null
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  config,
  messages,
  isLoading,
  onSendMessage,
  onClose,
  conversationId,
  sessionId,
  slots,
  pendingAction,
  selectSlot,
  onDateChange,
  onClosePicker,
  horizonDays,
  busy = false,
  error = null
}) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isMobile = window.innerWidth < 640

  return (
    <div
      ref={panelRef}
      className={`chatbot-panel ${isMobile ? 'mobile' : ''}`}
      style={{
        '--primary-color': config.primary_color,
        '--secondary-color': config.secondary_color
      } as React.CSSProperties}
    >
      <div className="chatbot-header">
        <div className="chatbot-header-left">
          {config.logo_url && (
            <img src={config.logo_url} alt="" className="chatbot-logo" />
          )}
          <div>
            <h3 className="chatbot-title">{config.bot_name}</h3>
            <p className="chatbot-status">Online now</p>
          </div>
        </div>
        <button
          className="chatbot-close"
          onClick={onClose}
          aria-label="Close chat"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1={18} y1={6} x2={6} y2={18} />
            <line x1={6} y1={6} x2={18} y2={18} />
          </svg>
        </button>
      </div>

      <div className="chatbot-messages">
        <MessageList
          messages={messages}
          isLoading={isLoading}
          config={config}
          onSend={onSendMessage}
        />
        <div ref={messagesEndRef} />
      </div>

      {pendingAction === 'pick_slot' && (
        <SlotPicker
          slots={slots}
          onSelect={selectSlot}
          onDateChange={onDateChange}
          onClose={onClosePicker}
          horizonDays={horizonDays}
          busy={busy}
          error={error}
        />
      )}

      <InputBar
        onSend={onSendMessage}
        disabled={isLoading}
        placeholder="Type a message..."
      />

      {config.show_branding && (
        <div className="chatbot-branding">
          Powered by AI Chatbot
        </div>
      )}
    </div>
  )
}