import React from 'react'

interface ChatButtonProps {
  isOpen: boolean
  onClick: () => void
  unreadCount: number
  primaryColor: string
  botName: string
}

export const ChatButton: React.FC<ChatButtonProps> = ({
  isOpen,
  onClick,
  unreadCount,
  primaryColor,
  botName
}) => {
  if (isOpen) return null

  return (
    <button
      onClick={onClick}
      className="chatbot-button"
      style={{
        '--primary-color': primaryColor
      } as React.CSSProperties}
      aria-label={`Open ${botName}`}
    >
      <svg
        className="chatbot-button-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unreadCount > 0 && (
        <span className="chatbot-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
      )}
    </button>
  )
}