import React, { useState, useRef, useEffect } from 'react'

interface InputBarProps {
  onSend: (content: string) => void
  disabled: boolean
  placeholder: string
}

export const InputBar: React.FC<InputBarProps> = ({ onSend, disabled, placeholder }) => {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [value])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim() && !disabled) {
      onSend(value.trim())
      setValue('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="chatbot-input-form">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="chatbot-input"
        rows={1}
        aria-label="Type your message"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="chatbot-send"
        aria-label="Send message"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <line x1={22} y1={2} x2={11} y2={13} />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </form>
  )
}