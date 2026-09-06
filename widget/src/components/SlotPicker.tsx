import React, { useState, useMemo } from 'react'

interface Slot {
  start_time: number
  end_time: number
  available: boolean
}

interface SlotPickerProps {
  slots: Slot[]
  onSelect: (slot: Slot, email: string, name: string) => void
  /** date == null → rolling-week view; otherwise the YYYY-MM-DD to fetch. */
  onDateChange: (dateIso: string | null) => void
  /** Dismiss the picker entirely (header ✕). Wire this or the ✕ only resets the date filter. */
  onClose?: () => void
  horizonDays: number
  busy?: boolean
  error?: string | null
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export const SlotPicker: React.FC<SlotPickerProps> = ({
  slots,
  onSelect,
  onDateChange,
  onClose,
  horizonDays,
  busy = false,
  error = null,
}) => {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [dateIso, setDateIso] = useState<string | null>(null)
  // Slots that failed to book (conflict) — rendered as unavailable.
  const [taken, setTaken] = useState<Set<number>>(new Set())

  const todayIso = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }, [])
  const maxIso = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + horizonDays)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }, [horizonDays])

  const grouped = slots.reduce((acc, slot) => {
    const key = new Date(slot.start_time * 1000).toLocaleDateString('en-GB')
    if (!acc[key]) acc[key] = []
    acc[key].push(slot)
    return acc
  }, {} as Record<string, Slot[]>)

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  const changeDate = (iso: string | null) => {
    setDateIso(iso)
    setTaken(new Set())
    onDateChange(iso)
  }

  const pick = (slot: Slot) => {
    if (!emailOk || busy) return
    setTaken(prev => new Set(prev).add(slot.start_time))
    onSelect(slot, email.trim(), name.trim())
  }

  const headerDate = (d: string) => {
    const [dd, mm, yyyy] = d.split('/')
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const when = new Date(`${yyyy}-${mm}-${dd}T00:00:00`)
    return `${days[when.getDay()]} ${d}`
  }

  return (
    <div className="chatbot-slot-picker">
      <div className="chatbot-slot-header">
        <span>Pick a time</span>
        <button
          className="chatbot-slot-close"
          onClick={() => (onClose ? onClose() : onDateChange(null))}
          aria-label="Close booking options"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1={18} y1={6} x2={6} y2={18} />
            <line x1={6} y1={6} x2={18} y2={18} />
          </svg>
        </button>
      </div>
      <div className="chatbot-slot-list">
        <label className="chatbot-slot-date-label">
          Choose a date
          <div className="chatbot-slot-date-row">
            <input
              type="date"
              className="chatbot-slot-date-input"
              min={todayIso}
              max={maxIso}
              value={dateIso || ''}
              onChange={(e) => changeDate(e.target.value || null)}
            />
            {dateIso && (
              <button
                type="button"
                className="chatbot-slot-date-clear"
                onClick={() => changeDate(null)}
                title="Back to this week"
              >
                This week
              </button>
            )}
          </div>
        </label>
        <label className="chatbot-slot-email-label">
          Email for your confirmation
          <input
            type="email"
            className="chatbot-slot-email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="chatbot-slot-name-label">
          Your name (optional)
          <input
            type="text"
            className="chatbot-slot-name"
            placeholder="Alex Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {!emailOk && email && <p className="chatbot-slot-email-hint">Enter a valid email to book</p>}
        {error && (
          <p className="chatbot-slot-error">
            {error}{' '}
            <button
              type="button"
              className="chatbot-slot-retry"
              onClick={() => changeDate(dateIso)}
            >
              Refresh times
            </button>
          </p>
        )}
        {Object.keys(grouped).length === 0 && (
          <p className="chatbot-slot-empty">
            {dateIso ? 'No available times on this day.' : 'No available times in the next week.'}
          </p>
        )}
        {Object.entries(grouped).map(([date, daySlots]) => (
          <div key={date} className="chatbot-slot-day">
            <div className="chatbot-slot-date">{headerDate(date)}</div>
            <div className="chatbot-slot-times">
              {daySlots.map((slot) => {
                const isTaken = taken.has(slot.start_time)
                const available = slot.available && !isTaken
                return (
                  <button
                    key={`${slot.start_time}-${slot.end_time}`}
                    className={`chatbot-slot-btn ${available && emailOk ? 'available' : 'booked'}`}
                    onClick={() => pick(slot)}
                    disabled={!available || !emailOk || busy}
                  >
                    {new Date(slot.start_time * 1000).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {busy && <p className="chatbot-slot-busy">Booking…</p>}
      </div>
    </div>
  )
}