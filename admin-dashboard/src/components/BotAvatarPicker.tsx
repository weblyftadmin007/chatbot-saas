import React from 'react'

/**
 * The four animated bot avatars tenants can choose between (mirrors
 * widget/src/components/BotAvatars.tsx — the two apps are built separately).
 * The selection is saved into the tenant's settings as `bot_avatar`.
 *
 * These are the redesigned avatars: 2 boys + 2 girls with realistic
 * proportions (oval head, ears, neck, shoulders, 3/4-facing face with
 * pupils) and strongly contrasting tinted backgrounds so each avatar is
 * clearly visible on any page.
 */
export const BOT_AVATARS = [
  { id: 'boy-1', label: 'Boy 1' },
  { id: 'boy-2', label: 'Boy 2' },
  { id: 'girl-1', label: 'Girl 1' },
  { id: 'girl-2', label: 'Girl 2' },
] as const

/** Eye that blinks on a loop (SMIL). */
const BlinkingEye: React.FC<{ cx: number; cy: number; dur?: string }> = ({
  cx,
  cy,
  dur = '3.4s',
}) => (
  <ellipse cx={cx} cy={cy} rx={1.7} ry={2} fill="#3F3B45">
    <animate
      attributeName="ry"
      values="2;2;0.2;2"
      keyTimes="0;0.9;0.935;1"
      dur={dur}
      repeatCount="indefinite"
    />
  </ellipse>
)

/** Corrugated structured hair bangs. */
const HairBangs: React.FC<{ cx: number; cy: number; hairColor: string; r: number; dur?: string }> = ({
  cx,
  cy,
  hairColor,
  r,
  dur = '2.8s',
}) => (
  <g>
    <animateTransform
      attributeName="transform"
      type="translate"
      values="0 0; 0 -1; 0 0"
      dur={dur}
      repeatCount="indefinite"
    />
    <path
      d={`M${cx - r} ${cy - r * 0.35}
         C${cx - r * 1.15} ${cy - r * 1.5},
           ${cx - r * 0.55} ${cy - r * 1.55},
           ${cx} ${cy - r * 1.35}
         C${cx + r * 0.55} ${cy - r * 1.55},
           ${cx + r * 1.15} ${cy - r * 1.5},
           ${cx + r} ${cy - r * 0.35}
         C${cx + r * 0.7} ${cy - r * 0.55},
           ${cx + r * 0.3} ${cy - r * 0.3},
           ${cx} ${cy - r * 0.25}
         C${cx - r * 0.3} ${cy - r * 0.3},
           ${cx - r * 0.7} ${cy - r * 0.55},
           ${cx - r} ${cy - r * 0.35} Z`}
      fill={hairColor}
    />
    <path
      d={`M${cx - r * 0.95} ${cy - r * 0.25}
         C${cx - r * 0.7} ${cy - r * 1.1},
           ${cx - r * 0.3} ${cy - r * 1.15},
           ${cx} ${cy - r * 1.05}
         C${cx + r * 0.3} ${cy - r * 1.15},
           ${cx + r * 0.7} ${cy - r * 1.1},
           ${cx + r * 0.95} ${cy - r * 0.25}
         C${cx + r * 0.5} ${cy - r * 0.5},
           ${cx + r * 0.05} ${cy - r * 0.45},
           ${cx} ${cy - r * 0.42}
         C${cx - r * 0.05} ${cy - r * 0.45},
           ${cx - r * 0.5} ${cy - r * 0.5},
           ${cx - r * 0.95} ${cy - r * 0.25} Z`}
      fill={hairColor}
    />
    <path
      d={`M${cx - r * 0.85} ${cy - r * 0.15}
         C${cx - r * 0.45} ${cy - r * 0.85},
           ${cx - r * 0.1} ${cy - r * 0.9},
           ${cx + r * 0.1} ${cy - r * 0.85}
         C${cx + r * 0.45} ${cy - r * 0.85},
           ${cx + r * 0.75} ${cy - r * 0.6},
           ${cx + r * 0.85} ${cy - r * 0.1}
         C${cx + r * 0.4} ${cy - r * 0.45},
           ${cx + r * 0.1} ${cy - r * 0.42},
           ${cx} ${cy - r * 0.4}
         C${cx - r * 0.1} ${cy - r * 0.42},
           ${cx - r * 0.4} ${cy - r * 0.45},
           ${cx - r * 0.85} ${cy - r * 0.15} Z`}
      fill={hairColor}
    />
  </g>
)

/** Soft curly hair as stacked rings. */
const CurlyHair: React.FC<{ cx: number; cy: number; hairColor: string; r: number; dur?: string }> = ({
  cx,
  cy,
  hairColor,
  r,
  dur = '3.1s',
}) => (
  <g>
    <animateTransform
      attributeName="transform"
      type="rotate"
      values="0 ${cx} ${cy - r * 0.1}; -12 ${cx} ${cy - r * 0.1}; 0 ${cx} ${cy - r * 0.1}"
      dur={dur}
      repeatCount="indefinite"
    />
    <circle cx={cx - r * 0.95} cy={cy - r * 0.55} r={r * 0.28} fill={hairColor} />
    <circle cx={cx - r * 0.55} cy={cy - r * 0.95} r={r * 0.3} fill={hairColor} />
    <circle cx={cx} cy={cy - r * 1.05} r={r * 0.3} fill={hairColor} />
    <circle cx={cx + r * 0.55} cy={cy - r * 0.95} r={r * 0.3} fill={hairColor} />
    <circle cx={cx + r * 0.95} cy={cy - r * 0.55} r={r * 0.28} fill={hairColor} />
    <circle cx={cx - r * 1.05} cy={cy - r * 0.15} r={r * 0.26} fill={hairColor} />
    <circle cx={cx + r * 1.05} cy={cy - r * 0.15} r={r * 0.26} fill={hairColor} />
    <circle cx={cx - r * 0.4} cy={cy - r * 1.05} r={r * 0.24} fill={hairColor} />
    <circle cx={cx + r * 0.4} cy={cy - r * 1.05} r={r * 0.24} fill={hairColor} />
    <circle cx={cx} cy={cy - r * 0.75} r={r * 0.22} fill={hairColor} />
  </g>
)

/** Ears for a more human silhouette. */
const Ears: React.FC<{ cx: number; cy: number; skinColor: string }> = ({ cx, cy, skinColor }) => (
  <>
    <ellipse cx={cx - 13} cy={cy - 1} rx={2.2} ry={3.4} fill={skinColor} />
    <ellipse cx={cx + 13} cy={cy - 1} rx={2.2} ry={3.4} fill={skinColor} />
  </>
)

/** A 3/4-facing friendly smile. */
const Smile: React.FC<{ d: string }> = ({ d }) => (
  <g fill="none" strokeLinecap="round">
    <path d={d} stroke="#7C4A2E" strokeWidth="1.9" />
    <path d={"M" + (parseFloat(d.split(' ')[1]) - 0.5).toFixed(2) + " " + (parseFloat(d.split(' ')[2]) + 0.4).toFixed(2) + " q4 -1 7 0"} stroke="#7C4A2E" strokeWidth="1.4" opacity="0.85" />
  </g>
)

export const BoyOneAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="boy-1">
    <circle cx="32" cy="32" r="32" fill="#0B3D91" />
    <circle cx="32" cy="32" r="30" fill="none" stroke="#FFB627" strokeWidth="2.2" opacity="0.9" />
    <path d="M12 64c0-15 7.5-23 20-23s20 8 20 23z" fill="#0A2A66" />
    <path d="M12 64c0-15 7.5-23 20-23s20 8 20 23z" fill="none" stroke="#FFB627" strokeWidth="1.6" opacity="0.7" />
    <path d="M26 42.5 L32 46 L38 42.5 L38 64 L26 64 Z" fill="#FFD966" />
    <path d="M26 42.5 L32 46 L38 42.5" fill="none" stroke="#7A4B00" strokeWidth="1.1" />
    <path d="M26 42.5 L38 42.5" stroke="#7A4B00" strokeWidth="1.1" />
    <rect x="29.5" y="37" width="5" height="4" rx="1.5" fill="#F2C9A0" />
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -1.6; 0 0"
        dur="2.8s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="13.5" ry="14" fill="#F2C9A0" />
      <ellipse cx="32" cy="25" rx="13.5" ry="13" fill="none" stroke="#E0A978" strokeWidth="0.8" opacity="0.7" />
      <Ears cx={32} cy={27} skinColor="#E8B78C" />
      <HairBangs cx={32} cy={27} hairColor="#2A2522" r={13.5} dur="2.8s" />
      <circle cx={27} cy={28} r="1" fill="#2A2522" />
      <circle cx={37} cy={28} r="1" fill="#2A2522" />
      <BlinkingEye cx={27} cy={28} />
      <BlinkingEye cx={37} cy={28} />
      <path d="M25 23.5 L29 23.4" stroke="#2A2522" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
      <path d="M35 23.4 L39 23.5" stroke="#2A2522" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
      <path d="M32 28.4 q1.2 1.6 0 2.4" fill="none" stroke="#C78A5A" strokeWidth="1.1" strokeLinecap="round" opacity="0.65" />
      <Smile d="M27.5 33.5q4.5 3.5 9 0" />
    </g>
  </svg>
)

export const BoyTwoAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="boy-2">
    <circle cx="32" cy="32" r="32" fill="#0E4D2A" />
    <circle cx="32" cy="32" r="30" fill="none" stroke="#FFE08A" strokeWidth="2.2" opacity="0.9" />
    <path d="M12 64c0-15 7.5-23 20-23s20 8 20 23z" fill="#5C6B2E" />
    <path d="M12 64c0-15 7.5-23 20-23s20 8 20 23z" fill="none" stroke="#FFE08A" strokeWidth="1.6" opacity="0.7" />
    <path d="M26 42.5 L32 46 L38 42.5 L38 64 L26 64 Z" fill="#FFE08A" />
    <path d="M26 42.5 L32 46 L38 42.5" fill="none" stroke="#F2C24A" strokeWidth="1.1" />
    <path d="M26 42.5 L38 42.5" stroke="#F2C24A" strokeWidth="1.1" />
    <rect x="29.5" y="37" width="5" height="4" rx="1.5" fill="#F2C9A0" />
    <g>
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="0 50 40; -26 50 40; 0 50 40"
        dur="1.5s"
        repeatCount="indefinite"
      />
      <rect x="47" y="40" width="6" height="12" rx="3" fill="#F2C9A0" />
      <circle cx="50" cy="38" r="4" fill="#F2C9A0" />
      <circle cx="53" cy="36" r="1.4" fill="#F2C9A0" />
      <circle cx="54" cy="39" r="1.3" fill="#F2C9A0" />
      <circle cx="53" cy="41.5" r="1.3" fill="#F2C9A0" />
    </g>
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -0.8; 0 0"
        dur="3.1s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="13.5" ry="14" fill="#F2C9A0" />
      <ellipse cx="32" cy="25" rx="13.5" ry="13" fill="none" stroke="#E0A978" strokeWidth="0.8" opacity="0.7" />
      <Ears cx={32} cy={27} skinColor="#E8B78C" />
      <CurlyHair cx={32} cy={27} hairColor="#3A2F27" r={13.5} dur="3.1s" />
      <circle cx={27} cy={28} r={4} fill="none" stroke="#1F2937" strokeWidth="1.3" />
      <circle cx={37} cy={28} r={4} fill="none" stroke="#1F2937" strokeWidth="1.3" />
      <line x1={31} y1={28} x2={33} y2={28} stroke="#1F2937" strokeWidth="1.3" />
      <line x1={23} y1={28} x2={20.5} y2={27.4} stroke="#1F2937" strokeWidth="1.1" />
      <line x1={41} y1={28} x2={43.5} y2={27.4} stroke="#1F2937" strokeWidth="1.1" />
      <circle cx={27} cy={28} r={1} fill="#2A2522" />
      <circle cx={37} cy={28} r={1} fill="#2A2522" />
      <BlinkingEye cx={27} cy={28} />
      <BlinkingEye cx={37} cy={28} />
      <path d="M25 23.5 L29 23.4" stroke="#2A2522" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
      <path d="M35 23.4 L39 23.5" stroke="#2A2522" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
      <path d="M32 28.4 q1.2 1.6 0 2.4" fill="none" stroke="#C78A5A" strokeWidth="1.1" strokeLinecap="round" opacity="0.65" />
      <Smile d="M27.5 33.5q4.5 3.5 9 0" />
    </g>
  </svg>
)

export const GirlOneAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="girl-1">
    <circle cx="32" cy="32" r="32" fill="#3B0F6B" />
    <circle cx="32" cy="32" r="30" fill="none" stroke="#FFD966" strokeWidth="2.2" opacity="0.9" />
    <path d="M12 64c0-15 7.5-23 20-23s20 8 20 23z" fill="#5B2D7E" />
    <path d="M12 64c0-15 7.5-23 20-23s20 8 20 23z" fill="none" stroke="#FFD966" strokeWidth="1.6" opacity="0.7" />
    <path d="M26 42.5 L32 46 L38 42.5 L38 64 L26 64 Z" fill="#FFD966" />
    <path d="M26 42.5 L32 46 L38 42.5" fill="none" stroke="#9A5B00" strokeWidth="1.1" />
    <path d="M26 42.5 L38 42.5" stroke="#9A5B00" strokeWidth="1.1" />
    <rect x="29.5" y="37" width="5" height="4" rx="1.5" fill="#F2C9A0" />
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -2; 0 0"
        dur="2.2s"
        repeatCount="indefinite"
      />
      <path d="M16 28 C10 20, 10 8, 16 6 C20 4, 22 10, 20 16 C19 20, 16 26, 16 28 Z" fill="#2A2522" />
      <path d="M16 28 C12 22, 12 14, 16 10 C18 9, 19 14, 18 20 C17 23, 16 26, 16 28 Z" fill="#3A302A" opacity="0.7" />
      <path d="M48 28 C54 20, 54 8, 48 6 C44 4, 42 10, 44 16 C45 20, 48 26, 48 28 Z" fill="#2A2522" />
      <path d="M48 28 C52 22, 52 14, 48 10 C46 9, 45 14, 46 20 C47 23, 48 26, 48 28 Z" fill="#3A302A" opacity="0.7" />
    </g>
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -1; 0 0"
        dur="2.6s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="13" ry="13.5" fill="#F2C9A0" />
      <ellipse cx="32" cy="25" rx="13" ry="12.5" fill="none" stroke="#E0A978" strokeWidth="0.8" opacity="0.7" />
      <Ears cx={32} cy={27} skinColor="#E8B78C" />
      <path d="M19 27 C19 18, 25 15, 32 15 C39 15, 45 18, 45 27 C44 23, 40 21, 35 21 C32 21, 29 21, 26 23 C23 24, 21 26, 19 27 Z" fill="#2A2522" />
      <path d="M22 18 C26 16.5, 32 16, 38 17.5 C34 18.5, 29 18.3, 25 19 C22.5 19.4, 22 18.6, 22 18 Z" fill="#3A302A" opacity="0.7" />
      <circle cx={27} cy={28} r={1} fill="#2A2522" />
      <circle cx={37} cy={28} r={1} fill="#2A2522" />
      <BlinkingEye cx={27} cy={28} dur="3.8s" />
      <BlinkingEye cx={37} cy={28} dur="3.8s" />
      <path d="M26 24.4 L30 24.3" stroke="#2A2522" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <path d="M34 24.3 L38 24.4" stroke="#2A2522" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <path d="M32 28 q1.4 1.8 0 2.6" fill="none" stroke="#C78A5A" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
      <circle cx={22} cy={32} r="2.6" fill="#F4A6C0" opacity="0.6" />
      <circle cx={42} cy={32} r="2.6" fill="#F4A6C0" opacity="0.6" />
      <Smile d="M27.5 33.5q4.5 3.2 9 0" />
    </g>
  </svg>
)

export const GirlTwoAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="girl-2">
    <circle cx="32" cy="32" r="32" fill="#6E1B52" />
    <circle cx="32" cy="32" r="30" fill="none" stroke="#FFE08A" strokeWidth="2.2" opacity="0.9" />
    <path d="M12 64c0-15 7.5-23 20-23s20 8 20 23z" fill="#8E1B5B" />
    <path d="M12 64c0-15 7.5-23 20-23s20 8 20 23z" fill="none" stroke="#FFE08A" strokeWidth="1.6" opacity="0.7" />
    <path d="M26 42.5 L32 46 L38 42.5 L38 64 L26 64 Z" fill="#FFE08A" />
    <path d="M26 42.5 L32 46 L38 42.5" fill="none" stroke="#B5538A" strokeWidth="1.1" />
    <path d="M26 42.5 L38 42.5" stroke="#B5538A" strokeWidth="1.1" />
    <rect x="29.5" y="37" width="5" height="4" rx="1.5" fill="#F2C9A0" />
    <g>
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="-1.6 32 62; 1.6 32 62; -1.6 32 62"
        dur="3.2s"
        repeatCount="indefinite"
      />
      <path d="M12 64c0-15 7.5-23 20-23s20 8 20 23z" fill="#8E1B5B" />
      <path d="M12 64c0-15 7.5-23 20-23s20 8 20 23z" fill="none" stroke="#FFE08A" strokeWidth="1.6" opacity="0.7" />
      <path d="M26 42.5 L32 46 L38 42.5 L38 64 L26 64 Z" fill="#FFE08A" />
      <path d="M26 42.5 L32 46 L38 42.5" fill="none" stroke="#B5538A" strokeWidth="1.1" />
      <path d="M26 42.5 L38 42.5" stroke="#B5538A" strokeWidth="1.1" />
    </g>
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -0.6; 0 0"
        dur="3.2s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="13" ry="13.5" fill="#F2C9A0" />
      <ellipse cx="32" cy="25" rx="13" ry="12.5" fill="none" stroke="#E0A978" strokeWidth="0.8" opacity="0.7" />
      <Ears cx={32} cy={27} skinColor="#E8B78C" />
      <path d="M19.5 27 C19 21, 22 16.5, 32 16 C42 16.5, 45 20, 44.5 27 C44 30, 42 32, 40 31.5 C41.5 29, 41 26, 38 25 C35 24, 29 24, 26 25 C23 26, 22.5 29, 24 31.5 C22 32, 20 30, 19.5 27 Z" fill="#E6B84D" />
      <path d="M19.5 27 C21 29, 22.5 31, 24 31.5 C22.5 29, 21 26, 19.5 27 Z" fill="#C79A31" opacity="0.7" />
      <path d="M44.5 27 C43 29, 41.5 31, 40 31.5 C41.5 29, 43 26, 44.5 27 Z" fill="#C79A31" opacity="0.7" />
      <g>
        <path d="M43 14.5 L48.5 11.2 L48.5 17.6 Z" fill="#F25C84" />
        <path d="M43 14.5 L48.5 11.2" stroke="#B5294F" strokeWidth="1" />
        <path d="M48.5 11.2 L48.5 17.6 L43 15 Z" fill="#F9A6C7" opacity="0.7" />
        <circle cx={43} cy={14.7} r="1.5" fill="#B5294F" />
        <path d="M21 13 L15.5 10.5 L15.5 17 Z" fill="#F25C84" opacity="0.85" />
        <path d="M21 13 L15.5 10.5" stroke="#B5294F" strokeWidth="1" opacity="0.85" />
        <path d="M21 13 L15.5 17 L21 15 Z" fill="#F9A6C7" opacity="0.6" />
      </g>
      <circle cx={27} cy={28} r={1} fill="#2A2522" />
      <circle cx={37} cy={28} r={1} fill="#2A2522" />
      <BlinkingEye cx={27} cy={28} dur="4.1s" />
      <BlinkingEye cx={37} cy={28} dur="4.1s" />
      <path d="M26 24.4 L30 24.3" stroke="#2A2522" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <path d="M34 24.3 L38 24.4" stroke="#2A2522" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <path d="M32 28 q1.4 1.8 0 2.6" fill="none" stroke="#C78A5A" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
      <circle cx={22} cy={32} r="2.6" fill="#F4A6C0" opacity="0.6" />
      <circle cx={42} cy={32} r="2.6" fill="#F4A6C0" opacity="0.6" />
      <Smile d="M27.5 33.5q4.5 3.2 9 0" />
    </g>
  </svg>
)

export const BotAvatar: React.FC<{ id?: string | null }> = ({ id }) => {
  switch (id) {
    case 'boy-2':
      return <BoyTwoAvatar />
    case 'girl-1':
      return <GirlOneAvatar />
    case 'girl-2':
      return <GirlTwoAvatar />
    default:
      return <BoyOneAvatar />
  }
}

interface BotAvatarPickerProps {
  value: string
  onChange: (id: string) => void
}

/** Radio-style picker showing all four animated avatars. */
export function BotAvatarPicker({ value, onChange }: BotAvatarPickerProps) {
  return (
    <div className="avatar-picker" role="radiogroup" aria-label="Bot avatar">
      {BOT_AVATARS.map((avatar) => (
        <button
          key={avatar.id}
          type="button"
          role="radio"
          aria-checked={value === avatar.id}
          className={`avatar-option ${value === avatar.id ? 'selected' : ''}`}
          onClick={() => onChange(avatar.id)}
        >
          <BotAvatar id={avatar.id} />
          <span className="avatar-option-label">{avatar.label}</span>
        </button>
      ))}
    </div>
  )
}
