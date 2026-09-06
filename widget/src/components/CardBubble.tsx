import React from 'react'

export interface CardAction {
  label: string
  /** Sends this text back through the chat as a normal user message. */
  send_message?: string
  /** Opens the user's email client (mailto:). */
  mailto?: string
}

export interface Card {
  id: string
  kind: 'quick_replies' | 'contact_card'
  title?: string
  subtitle?: string
  chips?: string[]
  actions?: CardAction[]
}

interface CardBubbleProps {
  card: Card
  config: any
  withAvatar: boolean
  /** History cards re-render read-only (no click handlers). */
  interactive?: boolean
  onAction?: (action: CardAction) => void
}

/**
 * Renders a server-driven interactive card (docs/interactive-cards-plan.md).
 * quick_replies: chip buttons that send the chip text as a user message.
 * contact_card: action buttons (mailto link, quick reply). A card without
 * actions (e.g. the escalation "a human will follow up") renders as a
 * notice. History cards render read-only.
 */
export const CardBubble: React.FC<CardBubbleProps> = ({
  card,
  config,
  withAvatar,
  interactive = true,
  onAction,
}) => {
  const handle = (action: CardAction) => {
    if (!interactive) return
    if (action.mailto) {
      window.location.href = `mailto:${action.mailto}`
      return
    }
    if (action.send_message) onAction?.(action)
  }

  return (
    <div className={`chatbot-message assistant`}>
      {withAvatar && (
        <div className="chatbot-avatar" style={{ backgroundColor: config.primary_color }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <rect x={2} y={3} width={20} height={14} rx={2} ry={2} />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>
      )}
      <div className="chatbot-bubble">
        <div className="chatbot-card" role="group" aria-label={card.title || 'Quick options'}>
          {(card.title || card.subtitle) && (
            <div className="chatbot-card-head">
              {card.title && <p className="chatbot-card-title">{card.title}</p>}
              {card.subtitle && <p className="chatbot-card-subtitle">{card.subtitle}</p>}
            </div>
          )}

          {card.kind === 'quick_replies' && (card.chips?.length || 0) > 0 && (
            <div className="chatbot-card-chips">
              {card.chips!.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="chatbot-card-chip"
                  disabled={!interactive}
                  onClick={() => handle({ label: chip, send_message: chip })}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {card.actions && card.actions.length > 0 && (
            <div className="chatbot-card-actions">
              {card.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="chatbot-card-action"
                  disabled={!interactive}
                  onClick={() => handle(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {card.kind === 'contact_card' && !(card.actions?.length) && (
            <p className="chatbot-card-note">
              The team will reach out to you shortly.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
