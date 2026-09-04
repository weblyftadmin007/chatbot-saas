import React from 'react'

interface MessageBubbleProps {
  message: any
  config: any
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, config }) => {
  const isUser = message.role === 'user'
  const time = new Date(message.created_at * 1000 || Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className={`chatbot-message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
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
        <span className="chatbot-time">{time}</span>
      </div>
      {isUser && (
        <div className="chatbot-avatar user" style={{ backgroundColor: config.secondary_color }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <circle cx={12} cy={12} r={10} />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1={9} y1={9} x2={9.01} y2={9} />
            <line x1={15} y1={9} x2={15.01} y2={9} />
          </svg>
        </div>
      )}
    </div>
  )
}