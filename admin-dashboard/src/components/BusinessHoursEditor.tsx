import React, { useState } from 'react'

interface BusinessHoursEditorProps {
  businessHours: any
  timezone: string
  slotDuration: number
  bufferMinutes: number
  onSave: (settings: any) => void
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export function BusinessHoursEditor({
  businessHours,
  timezone,
  slotDuration,
  bufferMinutes,
  onSave
}: BusinessHoursEditorProps) {
  const [hours, setHours] = useState<Record<string, { open: string; close: string }>>(
    businessHours || {
      monday: { open: '09:00', close: '17:00' },
      tuesday: { open: '09:00', close: '17:00' },
      wednesday: { open: '09:00', close: '17:00' },
      thursday: { open: '09:00', close: '17:00' },
      friday: { open: '09:00', close: '17:00' },
      saturday: { open: '', close: '' },
      sunday: { open: '', close: '' }
    }
  )
  const [tz, setTz] = useState(timezone || 'UTC')
  const [slotDur, setSlotDur] = useState(slotDuration || 30)
  const [buffer, setBuffer] = useState(bufferMinutes || 15)

  const handleSave = () => {
    onSave({
      business_hours: hours,
      timezone: tz,
      slot_duration: slotDur,
      buffer_minutes: buffer
    })
  }

  const toggleDay = (day: string) => {
    setHours(prev => {
      const current = prev[day]
      if (current.open && current.close) {
        return { ...prev, [day]: { open: '', close: '' } }
      }
      return { ...prev, [day]: { open: '09:00', close: '17:00' } }
    })
  }

  const updateTime = (day: string, field: 'open' | 'close', value: string) => {
    setHours(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value }
    }))
  }

  return (
    <div className="settings-form">
      <div className="form-section">
        <h3>Business Hours</h3>
        <p className="form-hint">Set open/close times for each day. Leave empty for closed days.</p>

        <div className="hours-grid">
          {DAYS.map((day) => {
            const dayHours = hours[day]
            const isOpen = dayHours.open && dayHours.close

            return (
              <div key={day} className={`day-row ${!isOpen ? 'closed' : ''}`}>
                <label className="day-label">
                  <input
                    type="checkbox"
                    checked={isOpen}
                    onChange={() => toggleDay(day)}
                  />
                  <span>{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                </label>
                {isOpen && (
                  <div className="day-times">
                    <input
                      type="time"
                      value={dayHours.open}
                      onChange={(e) => updateTime(day, 'open', e.target.value)}
                      className="time-input"
                    />
                    <span>–</span>
                    <input
                      type="time"
                      value={dayHours.close}
                      onChange={(e) => updateTime(day, 'close', e.target.value)}
                      className="time-input"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="form-section">
        <h3>Appointment Settings</h3>
        <div className="settings-grid">
          <div className="form-group">
            <label>Timezone</label>
            <select value={tz} onChange={(e) => setTz(e.target.value)}>
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Chicago">Central Time</option>
              <option value="America/Denver">Mountain Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="Europe/London">London</option>
              <option value="Europe/Paris">Paris</option>
              <option value="Asia/Tokyo">Tokyo</option>
              <option value="Australia/Sydney">Sydney</option>
            </select>
          </div>

          <div className="form-group">
            <label>Slot Duration (minutes)</label>
            <select value={slotDur} onChange={(e) => setSlotDur(Number(e.target.value))}>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>

          <div className="form-group">
            <label>Buffer Between Appointments (minutes)</label>
            <select value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}>
              <option value={0}>No buffer</option>
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
            </select>
          </div>
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </div>
  )
}