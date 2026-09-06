import React from 'react'
import { trackEvent } from '../hooks/useChat'

export interface CardAction {
  label: string
  /** Sends this text back through the chat as a normal user message. */
  send_message?: string
  /** Opens the user's email client (mailto:). */
  mailto?: string
  /** Opens this URL in a new tab (e.g. add-to-calendar links). */
  url?: string
  /** Widget-side: clicking opens the slot picker instead of sending a message. */
  open_slots?: boolean
  /** Renders a text input; on submit {value} is substituted into send_template. */
  input?: boolean
  /** Placeholder for the input action. */
  placeholder?: string
  /** Template for the input action, e.g. "Cancel my appointment {value}". */
  send_template?: string
}

export interface Card {
  id: string
  kind: 'quick_replies' | 'contact_card' | 'booking_prompt' | 'cancel_lookup' | 'booking_confirm' | 'cancel_confirm'
  title?: string
  subtitle?: string
  chips?: string[]
  actions?: CardAction[]
  /** booking_confirm: appointment date+time. */
  when?: string
  /** booking_confirm: customer email. */
  email?: string
  /** booking_confirm: what was booked. */
  service?: string
  /** cancel_confirm: the cancelled slot's date+time. */
  cancelled_when?: string
  /** booking_confirm: add-to-calendar URL. */
  calendar_url?: string
}

interface CardBubbleProps {
  card: Card
  config: any
  withAvatar: boolean
  /** History cards re-render read-only (no click handlers). */
  interactive?: boolean
  onAction?: (action: CardAction) => void
  /** Widget slug, for engagement telemetry. */
  tenantSlug?: string
  apiBase?: string
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
  tenantSlug,
  apiBase = '',
}) => {
  const [inputValue, setInputValue] = React.useState('')

  const track = (action: CardAction) => {
    if (tenantSlug) {
      trackEvent(apiBase, tenantSlug, 'card_clicked', {
        kind: card.kind,
        label: action.label,
      })
    }
  }

  const handle = (action: CardAction) => {
    if (!interactive) return
    track(action)
    if (action.open_slots) {
      onAction?.(action)
      return
    }
    if (action.url) {
      window.open(action.url, '_blank', 'noopener')
      return
    }
    if (action.mailto) {
      window.location.href = `mailto:${action.mailto}`
      return
    }
    if (action.send_message) onAction?.(action)
  }

  const submitInput = (action: CardAction) => {
    const value = inputValue.trim()
    if (!interactive || !value) return
    track(action)
    const text = (action.send_template || '{value}').replace('{value}', value)
    onAction?.({ label: action.label, send_message: text })
    setInputValue('')
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

          {card.kind === 'booking_confirm' && (
            <div className="chatbot-card-fields">
              {card.service && (
                <div className="chatbot-card-field">
                  <span className="chatbot-card-field-label">Service</span>
                  <span className="chatbot-card-field-value">{card.service}</span>
                </div>
              )}
              {card.when && (
                <div className="chatbot-card-field">
                  <span className="chatbot-card-field-label">When</span>
                  <span className="chatbot-card-field-value">{card.when}</span>
                </div>
              )}
              {card.email && (
                <div className="chatbot-card-field">
                  <span className="chatbot-card-field-label">Confirmation to</span>
                  <span className="chatbot-card-field-value">{card.email}</span>
                </div>
              )}
            </div>
          )}

          {card.kind === 'cancel_confirm' && card.cancelled_when && (
            <div className="chatbot-card-fields">
              <div className="chatbot-card-field">
                <span className="chatbot-card-field-label">Cancelled slot</span>
                <span className="chatbot-card-field-value">{card.cancelled_when}</span>
              </div>
            </div>
          )}

          {card.kind === 'quick_replies' && (card.chips?.length || 0) > 0 && (
            <div className="chatbot-card-chips">
              {card.chips!.map((chip) => {
                // If actions already render this chip, skip the duplicate.
                if (card.actions?.some((a) => a.label === chip)) return null
                return (
                  <button
                    key={chip}
                    type="button"
                    className="chatbot-card-chip"
                    disabled={!interactive}
                    onClick={() => handle({ label: chip, send_message: chip })}
                  >
                    {chip}
                  </button>
                )
              })}
            </div>
          )}

          {card.actions && card.actions.length > 0 && (
            <div className="chatbot-card-actions">
              {card.actions.map((action) =>
                action.input ? (
                  <div key={action.label} className="chatbot-card-input-row">
                    <input
                      type={action.send_template?.includes('email') ? 'email' : 'text'}
                      className="chatbot-card-input"
                      placeholder={action.placeholder || 'Type here…'}
                      value={inputValue}
                      disabled={!interactive}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          submitInput(action)
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="chatbot-card-action"
                      disabled={!interactive || !inputValue.trim()}
                      onClick={() => submitInput(action)}
                    >
                      {action.label}
                    </button>
                  </div>
                ) : (
                  <button
                    key={action.label}
                    type="button"
                    className="chatbot-card-action"
                    disabled={!interactive}
                    onClick={() => handle(action)}
                  >
                    {action.label}
                  </button>
                )
              )}
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
