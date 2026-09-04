import React from 'react'

interface SlotPickerProps {
  slots: any[]
  onSelect: (slot: any) => void
}

export const SlotPicker: React.FC<SlotPickerProps> = ({ slots, onSelect }) => {
  // Group slots by date
  const grouped = slots.reduce((acc, slot) => {
    const date = new Date(slot.start_time * 1000).toLocaleDateString()
    if (!acc[date]) acc[date] = []
    acc[date].push(slot)
    return acc
  }, {} as Record<string, any[]>)

  return (
    <div className="chatbot-slot-picker">
      <div className="chatbot-slot-header">
        <span>Available times - click to book</span>
        <button className="chatbot-slot-close" onClick={() => onSelect(null)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1={18} y1={6} x2={6} y2={18} />
            <line x1={6} y1={6} x2={18} y2={18} />
          </svg>
        </button>
      </div>
      <div className="chatbot-slot-list">
        {Object.entries(grouped).map(([date, daySlots]) => (
          <div key={date} className="chatbot-slot-day">
            <div className="chatbot-slot-date">{date}</div>
            <div className="chatbot-slot-times">
              {daySlots.map((slot) => (
                <button
                  key={`${slot.start_time}-${slot.end_time}`}
                  className={`chatbot-slot-btn ${slot.available ? 'available' : 'booked'}`}
                  onClick={() => slot.available && onSelect(slot)}
                  disabled={!slot.available}
                >
                  {new Date(slot.start_time * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}