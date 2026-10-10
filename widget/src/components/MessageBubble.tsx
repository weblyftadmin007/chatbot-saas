import React from 'react'
import { CardBubble, CardAction } from './CardBubble'

interface MessageBubbleProps {
  message: any
  config: any
  onSend?: (content: string) => void
  onOpenSlots?: () => void
  tenantSlug?: string
  apiBase?: string
}

const BULLET = /^\s*[-•*–]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/

/** Inline markup: **bold** → <strong>. Unmatched ** (mid-stream) stays literal. */
function renderInline(text: string, key: string): React.ReactNode {
  const segments = text.split(/\*\*([^*]+)\*\*/g)
  if (segments.length === 1) return text
  return segments.map((seg, i) =>
    i % 2 === 1 ? (
      <strong key={`${key}-${i}`}>{seg}</strong>
    ) : (
      <React.Fragment key={`${key}-${i}`}>{seg}</React.Fragment>
    ),
  )
}

/**
 * Block markup: "- "/"1." lines become lists, other lines become paragraphs,
 * blank lines separate blocks. Streams safely — a partially received line or
 * half-emitted ** simply renders as plain text until the rest arrives.
 */
function renderContent(content: string): React.ReactNode {
  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  let n = 0

  const flushPara = () => {
    if (!para.length) return
    const key = `p${n++}`
    blocks.push(
      <p className="chatbot-para" key={key}>
        {para.map((line, i) => (
          <React.Fragment key={i}>
            {i > 0 && <br />}
            {renderInline(line, `${key}-${i}`)}
          </React.Fragment>
        ))}
      </p>,
    )
    para = []
  }

  const flushList = () => {
    if (!list) return
    const key = `l${n++}`
    const Tag: React.ElementType = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag className="chatbot-list" key={key}>
        {list.items.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-${i}`)}</li>
        ))}
      </Tag>,
    )
    list = null
  }

  for (const raw of content.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) {
      flushList()
      flushPara()
      continue
    }
    const bullet = BULLET.exec(line)
    const ordered = bullet ? null : ORDERED.exec(line)
    if (bullet || ordered) {
      flushPara()
      const isOrdered = !!ordered
      if (list && list.ordered !== isOrdered) flushList()
      if (!list) list = { ordered: isOrdered, items: [] }
      list.items.push(bullet ? bullet[1] : ordered![1])
    } else {
      flushList()
      para.push(line)
    }
  }
  flushList()
  flushPara()
  return blocks
}

/** Bot header: avatar + name above the message (shared with the typing row). */
export const BotHead: React.FC<{ config: any }> = ({ config }) => (
  <div className="chatbot-message-head">
    <div className="chatbot-avatar" style={{ backgroundColor: config.primary_color }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
        <rect x={2} y={3} width={20} height={14} rx={2} ry={2} />
        <path d="M8 21h8M12 17v4" />
      </svg>
    </div>
    {config.bot_name && <span className="chatbot-message-name">{config.bot_name}</span>}
  </div>
)

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  config,
  onSend,
  onOpenSlots,
  tenantSlug,
  apiBase = '',
}) => {
  const isUser = message.role === 'user'
  const content = String(message.content ?? '')
  const card = !isUser && message.card ? message.card : null
  const showBubble = isUser ? content.length > 0 : content.length > 0 || !!card

  // Card actions: booking chips open the slot picker, the rest are sent as a
  // normal message (the worker classifies them like any other input).
  const handleCardAction = (action: CardAction) => {
    if (action.open_slots) {
      onOpenSlots?.()
      return
    }
    onSend?.(action.send_message!)
  }

  return (
    <div className={`chatbot-message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && <BotHead config={config} />}
      {showBubble && (
        <div className="chatbot-bubble">
          {content && <div className="chatbot-bubble-content chatbot-text">{renderContent(content)}</div>}
          {card && (
            <div className="chatbot-card-embed">
              <CardBubble
                card={card}
                interactive={message.interactive !== false}
                onAction={handleCardAction}
                tenantSlug={tenantSlug}
                apiBase={apiBase}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
