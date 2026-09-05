import React from 'react'

interface MessageBubbleProps {
  message: any
  config: any
  withAvatar: boolean
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, config, withAvatar }) => {
  const isUser = message.role === 'user'

  return (
    <div className={`chatbot-message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && withAvatar && (
        <div className="chatbot-avatar" style={{ backgroundColor: config.primary_color }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <rect x={2} y={3} width={20} height={14} rx={2} ry={2} />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>
      )}
      <div className="chatbot-bubble">
        <div className="chatbot-bubble-content">
          <p className="chatbot-text">{String(message.content ?? '')}</p>
        </div>
      </div>
    </div>
  )
}