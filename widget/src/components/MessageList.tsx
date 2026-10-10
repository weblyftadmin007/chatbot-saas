import React from 'react'
import { MessageBubble, BotHead } from './MessageBubble'

interface MessageListProps {
  messages: any[]
  isLoading: boolean
  config: any
  onSend: (content: string) => void
  /** Card booking chips: opens the slot picker instead of chatting. */
  onOpenSlots: () => void
  /** Widget slug, for engagement telemetry. */
  tenantSlug?: string
  apiBase?: string
}

const DEFAULT_CHIPS = [
  'What services do you offer?',
  'How much does a website cost?',
  'What packages do you have?',
  'Can you redesign my site?',
  'How do I get in touch?',
  'What is your process?'
]

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  config,
  onSend,
  onOpenSlots,
  tenantSlug,
  apiBase = ''
}) => {
  if (messages.length === 0 && !isLoading) {
    const chips = (config.quick_replies && config.quick_replies.length
      ? config.quick_replies
      : DEFAULT_CHIPS) as string[]

    return (
      <div className="chatbot-welcome">
        <div className="chatbot-welcome-avatar" style={{ backgroundColor: config.primary_color }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <rect x={2} y={3} width={20} height={14} rx={2} ry={2} />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>
        <p className="chatbot-greeting">{config.greeting}</p>
        <div className="chatbot-suggest">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              className="chatbot-suggest-chip"
              onClick={() => (/book/i.test(chip) ? onOpenSlots() : onSend(chip))}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="chatbot-message-list">
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id || index}
          message={message}
          config={config}
          onSend={onSend}
          onOpenSlots={onOpenSlots}
          tenantSlug={tenantSlug}
          apiBase={apiBase}
        />
      ))}
      {isLoading && (
        <div className="chatbot-message assistant">
          <BotHead config={config} />
          <div className="chatbot-typing">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
    </div>
  )
}