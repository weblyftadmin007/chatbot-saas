import React from 'react'
import { trackEvent } from '../hooks/useChat'

export interface CardAction {
  label: string
  send_message?: string
  mailto?: string
  url?: string
  open_slots?: boolean
  input?: boolean
  placeholder?: string
  send_template?: string
}

export interface Card {
  id: string
  kind: 'quick_replies' | 'contact_card' | 'booking_prompt' | 'cancel_lookup' | 'booking_confirm' | 'cancel_confirm' | 'explore_services' | 'pricing_guide' | 'talk_to_human'
  title?: string
  subtitle?: string
  chips?: string[]
  actions?: CardAction[]
  when?: string
  email?: string
  service?: string
  cancelled_when?: string
  calendar_url?: string
}

interface CardBubbleProps {
  card: Card
  interactive?: boolean
  onAction?: (action: CardAction) => void
  tenantSlug?: string
  apiBase?: string
}

/**
 * Renders just the card block (chips, actions, fields). It lives inside the
 * owning message's bubble so the answer and its suggestions read as one
 * message — see MessageBubble.
 */
export const CardBubble: React.FC<CardBubbleProps> = ({
  card,
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

  const kindClass = {
    explore_services: 'kind-explore',
    pricing_guide: 'kind-pricing',
    talk_to_human: 'kind-contact',
    booking_confirm: 'kind-confirm',
    cancel_confirm: 'kind-cancel',
  }[card.kind] || ''

  return (
    <div className={`chatbot-card ${kindClass}`} role="group" aria-label={card.title || 'Quick options'}>
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
                className={`chatbot-card-action ${action.label.toLowerCase().includes('book') || action.label.toLowerCase().includes('call') || action.label.toLowerCase().includes('email') ? 'cta' : ''}`}
                disabled={!interactive}
                onClick={() => handle(action)}
              >
                {action.label}
              </button>
            )
          )}
        </div>
      )}

      {card.kind === 'talk_to_human' && !(card.actions?.length) && (
        <p className="chatbot-card-note">
          The team will reach out to you shortly.
        </p>
      )}
    </div>
  )
}
