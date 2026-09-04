import React from 'react'
import { MessageBubble } from './MessageBubble'

interface MessageListProps {
  messages: any[]
  isLoading: boolean
  config: any
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  config
}) => {
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="chatbot-welcome">
        <div className="chatbot-welcome-avatar" style={{ backgroundColor: config.primary_color }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <rect x={2} y={3} width={20} height={14} rx={2} ry={2} />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>
        <p className="chatbot-greeting">{config.greeting}</p>
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
        />
      ))}
      {isLoading && (
        <div className="chatbot-typing">
          <span></span>
          <span></span>
          <span></span>
        </div>
      )}
    </div>
  )
}