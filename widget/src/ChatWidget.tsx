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

  // Load config on mount
  useEffect(() => {
    config.load()
  }, [tenantSlug])

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
    setIsOpen(prev => !prev)
    if (unreadCount > 0) {
      setUnreadCount(0)
    }
  }, [unreadCount])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

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
          onSendMessage={chat.sendMessage}
          onClose={handleClose}
          conversationId={chat.conversationId}
          sessionId={session.sessionId}
        />
      )}
    </>
  )
}