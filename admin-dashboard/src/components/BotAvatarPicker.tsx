import React from 'react'

/**
 * The four animated bot avatars tenants can choose between (mirrors
 * widget/src/components/BotAvatars.tsx — the two apps are built separately).
 * The selection is saved into the tenant's settings as `bot_avatar`.
 *
 * These mirror the more realistic widget avatars: people-like characters on a
 * soft white circle with subtle skin shading, smaller realistic eyes with a
 * blink, a more natural hair silhouette, and a shirt with faint cloth shading.
 * One clear trait per avatar so all four are easy to tell apart.
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
  <ellipse cx={cx} cy={cy} rx={1.8} ry={2.1} fill="#2C241B">
    <animate
      attributeName="ry"
      values="2.1;2.1;0.25;2.1"
      keyTimes="0;0.9;0.935;1"
      dur={dur}
      repeatCount="indefinite"
    />
  </ellipse>
)

/** Subtle skin shading under the chin/neck. */
const SkinShade: React.FC<{ cx: number; cy: number; r: number }> = ({
  cx,
  cy,
  r,
}) => (
  <>
    <ellipse cx={cx} cy={cy + r * 0.45} rx={r * 0.55} ry={r * 0.22} fill="#C99A75" opacity="0.35" />
    <ellipse cx={cx - r * 0.45} cy={cy + r * 0.18} rx={r * 0.22} ry={r * 0.16} fill="#E8A090" opacity="0.5" />
    <ellipse cx={cx + r * 0.45} cy={cy + r * 0.18} rx={r * 0.22} ry={r * 0.16} fill="#E8A090" opacity="0.5" />
  </>
)

/** Shared shirt/shoulders block with faint cloth shading. */
const Body: React.FC<{
  topColor: string
  accent?: string
  neckColor?: string
  fold?: string
}> = ({
  topColor,
  accent = '#D8CCC0',
  neckColor = '#F0CFA8',
  fold = '#8E8678',
}) => (
  <>
    <path
      d="M14 64c0-14 8-22 20-22s18 8 18 20z"
      fill={topColor}
      stroke={accent}
      strokeWidth="1.1"
      opacity="0.94"
    />
    <path
      d="M14 64c0-14 8-22 20-22s18 8 18 20z"
      fill="none"
      stroke={fold}
      strokeWidth="0.9"
      opacity="0.35"
    />
    <path
      d="M26.5 43 L32 45.5 L37.5 43"
      fill="none"
      stroke={neckColor}
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity="0.95"
    />
    <path
      d="M26.5 43 L37.5 43"
      stroke={neckColor}
      strokeWidth="1.1"
      strokeLinecap="round"
      opacity="0.75"
    />
    <path
      d="M28 43.5 q4 2 8 0"
      fill="none"
      stroke={fold}
      strokeWidth="0.7"
      opacity="0.4"
    />
  </>
)

/** Natural eyes with iris/pupil/catchlight/blink. */
const Eyes: React.FC<{
  cx: number
  cy: number
  browColor?: string
  dur?: string
}> = ({
  cx,
  cy,
  browColor = '#3A2E26',
  dur = '3.4s',
}) => (
  <g>
    <path
      d={`M${(cx - 4.4).toFixed(2)} ${(cy - 4.7).toFixed(2)}
         L${(cx - 0.8).toFixed(2)} ${(cy - 4.4).toFixed(2)}`}
      stroke={browColor}
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.55"
    />
    <path
      d={`M${(cx + 0.6).toFixed(2)} ${(cy - 4.4).toFixed(2)}
         L${(cx + 4.2).toFixed(2)} ${(cy - 4.7).toFixed(2)}`}
      stroke={browColor}
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.55"
    />
    <ellipse cx={cx - 3.6} cy={cy - 1.6} rx="2" ry="2.3" fill="#FFFFFF" />
    <ellipse cx={cx + 3.6} cy={cy - 1.6} rx="2" ry="2.3" fill="#FFFFFF" />
    <circle cx={cx - 3.6} cy={cy - 1.6} r="1.35" fill="#4A3A2A" />
    <circle cx={cx + 3.6} cy={cy - 1.6} r="1.35" fill="#4A3A2A" />
    <circle cx={cx - 3.6} cy={cy - 1.6} r="0.6" fill="#1A140E" />
    <circle cx={cx + 3.6} cy={cy - 1.6} r="0.6" fill="#1A140E" />
    <BlinkingEye cx={cx - 3.6} cy={cy - 1.6} dur={dur} />
    <BlinkingEye cx={cx + 3.6} cy={cy - 1.6} dur={dur} />
    <circle cx={cx - 3.15} cy={cy - 2.05} r="0.4" fill="#FFFFFF" />
    <circle cx={cx + 4.05} cy={cy - 2.05} r="0.4" fill="#FFFFFF" />
  </g>
)

/** Natural hair-top shape: smooth hairline with subtle darker underside. */
const HairTop: React.FC<{
  cx: number
  cy: number
  hairColor: string
  r: number
  dur?: string
}> = ({
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
      values="0 0; 0 -0.6; 0 0"
      dur={dur}
      repeatCount="indefinite"
    />
    <path
      d={`M${(cx - r).toFixed(2)} ${(cy - r * 0.28).toFixed(2)}
         C${(cx - r * 1.2).toFixed(2)} ${(cy - r * 1.3).toFixed(2)}
           ${(cx - r * 0.5).toFixed(2)} ${(cy - r * 1.5).toFixed(2)}
           ${cx} ${(cy - r * 1.32).toFixed(2)}
         C${(cx + r * 0.5).toFixed(2)} ${(cy - r * 1.5).toFixed(2)}
           ${(cx + r * 1.2).toFixed(2)} ${(cy - r * 1.3).toFixed(2)}
           ${(cx + r).toFixed(2)} ${(cy - r * 0.28).toFixed(2)}
         C${(cx + r * 0.65).toFixed(2)} ${(cy - r * 0.5).toFixed(2)}
           ${(cx + r * 0.2).toFixed(2)} ${(cy - r * 0.3).toFixed(2)}
           ${cx} ${(cy - r * 0.22).toFixed(2)}
         C${(cx - r * 0.2).toFixed(2)} ${(cy - r * 0.3).toFixed(2)}
           ${(cx - r * 0.65).toFixed(2)} ${(cy - r * 0.5).toFixed(2)}
           ${(cx - r).toFixed(2)} ${(cy - r * 0.28).toFixed(2)} Z`}
      fill={hairColor}
    />
    <path
      d={`M${(cx - r * 0.95).toFixed(2)} ${(cy - r * 0.24).toFixed(2)}
         C${(cx - r * 0.65).toFixed(2)} ${(cy - r * 0.95).toFixed(2)}
           ${(cx - r * 0.28).toFixed(2)} ${(cy - r * 1.0).toFixed(2)}
           ${cx} ${(cy - r * 0.92).toFixed(2)}
         C${(cx + r * 0.28).toFixed(2)} ${(cy - r * 1.0).toFixed(2)}
           ${(cx + r * 0.65).toFixed(2)} ${(cy - r * 0.95).toFixed(2)}
           ${(cx + r * 0.95).toFixed(2)} ${(cy - r * 0.24).toFixed(2)}
         C${(cx + r * 0.5).toFixed(2)} ${(cy - r * 0.42).toFixed(2)}
           ${(cx + r * 0.05).toFixed(2)} ${(cy - r * 0.38).toFixed(2)}
           ${cx} ${(cy - r * 0.36).toFixed(2)}
         C${(cx - r * 0.05).toFixed(2)} ${(cy - r * 0.38).toFixed(2)}
           ${(cx - r * 0.5).toFixed(2)} ${(cy - r * 0.42).toFixed(2)}
           ${(cx - r * 0.95).toFixed(2)} ${(cy - r * 0.24).toFixed(2)} Z`}
      fill="#211A14"
      opacity="0.35"
    />
  </g>
)

/** Natural mouth. */
const Mouth: React.FC<{ mouth: string }> = ({ mouth }) => (
  <path
    d={mouth}
    fill="none"
    stroke="#6E3F27"
    strokeWidth="1.9"
    strokeLinecap="round"
    opacity="0.9"
  />
)

export const BoyOneAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="boy-1">
    <circle cx="32" cy="32" r="32" fill="#FFFFFF" />
    <circle cx="32" cy="32" r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
    <Body topColor="#274F8A" />
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -1.5; 0 0"
        dur="2.8s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="13.2" ry="13.6" fill="#F2C9A0" />
      <ellipse cx="32" cy="25.4" rx="13.2" ry="12.9" fill="none" stroke="#E5AE89" strokeWidth="0.7" opacity="0.6" />
      <SkinShade cx={32} cy={27} r={13.2} />
      <HairTop cx={32} cy={27} hairColor="#2A2520" r={13.2} />
      <Eyes cx={32} cy={28} />
      <Mouth mouth="M28 33.4q4 3.4 8 0" />
    </g>
  </svg>
)

export const BoyTwoAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="boy-2">
    <circle cx="32" cy="32" r="32" fill="#FFFFFF" />
    <circle cx="32" cy="32" r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
    <Body topColor="#2F7A8C" />
    <g>
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="0 50 40; -22 50 40; 0 50 40"
        dur="1.5s"
        repeatCount="indefinite"
      />
      <path
        d="M47 40.5 q3.2 -0.6 4.8 -3.6"
        stroke="#F2C9A0"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="51.8" cy="36.6" r="2.1" fill="#F2C9A0" />
      <circle cx="53.2" cy="35.2" r="0.85" fill="#F2C9A0" />
      <circle cx="53.7" cy="37.2" r="0.85" fill="#F2C9A0" />
      <circle cx="52.9" cy="38.6" r="0.85" fill="#F2C9A0" />
    </g>
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -0.8; 0 0"
        dur="3.1s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="13.2" ry="13.6" fill="#F2C9A0" />
      <ellipse cx="32" cy="25.4" rx="13.2" ry="12.9" fill="none" stroke="#E5AE89" strokeWidth="0.7" opacity="0.6" />
      <SkinShade cx={32} cy={27} r={13.2} />
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="0 32 25; -10 32 25; 0 32 25"
          dur="3.1s"
          repeatCount="indefinite"
        />
        <ellipse cx={32 - 10.1} cy={27 - 5.2} rx="3.4" ry="3.6" fill="#443A32" />
        <ellipse cx={32 - 5.8} cy={27 - 9.5} rx="3.5" ry="3.7" fill="#443A32" />
        <ellipse cx={32} cy={27 - 10.9} rx="3.5" ry="3.7" fill="#443A32" />
        <ellipse cx={32 + 5.8} cy={27 - 9.5} rx="3.5" ry="3.7" fill="#443A32" />
        <ellipse cx={32 + 10.1} cy={27 - 5.2} rx="3.4" ry="3.6" fill="#443A32" />
        <ellipse cx={32 - 11} cy={27 - 1.2} rx="3.2" ry="3.4" fill="#443A32" />
        <ellipse cx={32 + 11} cy={27 - 1.2} rx="3.2" ry="3.4" fill="#443A32" />
        <ellipse cx={32 - 4.2} cy={27 - 10.9} rx="2.9" ry="3.0" fill="#443A32" />
        <ellipse cx={32 + 4.2} cy={27 - 10.9} rx="2.9" ry="3.0" fill="#443A32" />
        <ellipse cx={32} cy={27 - 7.7} rx="2.8" ry="2.9" fill="#443A32" />
      </g>
      <circle cx={28.5} cy={28.4} r={4} fill="none" stroke="#243246" strokeWidth="1.4" />
      <circle cx={35.7} cy={28.4} r={4} fill="none" stroke="#243246" strokeWidth="1.4" />
      <line x1="32.3" y1={28.4} x2="33.7" y2={28.4} stroke="#243246" strokeWidth="1.4" />
      <line x1="24.3" y1={28.25} x2="21.4" y2={27.7} stroke="#243246" strokeWidth="1.1" />
      <line x1="39.7" y1={28.25} x2="42.6" y2={27.7} stroke="#243246" strokeWidth="1.1" />
      <Eyes cx={32} cy={28.4} />
      <Mouth mouth="M28 33.4q4 3.4 8 0" />
    </g>
  </svg>
)

export const GirlOneAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="girl-1">
    <circle cx="32" cy="32" r="32" fill="#FFFFFF" />
    <circle cx="32" cy="32" r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
    <Body topColor="#7A3A7E" />
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -2; 0 0"
        dur="2.1s"
        repeatCount="indefinite"
      />
      <path
        d="M16 27
           C9 18 9 7 15 5
           C20 3 22 10 20 17
           C19 22 16 27 16 27 Z"
        fill="#2A2520"
      />
      <path
        d="M16 27
           C11 21 11 13 16 8
           C18 7 19 13 18 20
           C17 24 16 27 16 27 Z"
        fill="#3C3129"
        opacity="0.75"
      />
      <path
        d="M48 27
           C54 18 54 7 48 5
           C43 3 41 10 43 17
           C44 22 47 27 48 27 Z"
        fill="#2A2520"
      />
      <path
        d="M48 27
           C53 21 53 13 48 8
           C46 7 45 13 46 20
           C47 24 48 27 48 27 Z"
        fill="#3C3129"
        opacity="0.75"
      />
    </g>
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -1; 0 0"
        dur="2.6s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="12.6" ry="13.6" fill="#F2C9A0" />
      <ellipse cx="32" cy="25.4" rx="12.6" ry="12.9" fill="none" stroke="#E5AE89" strokeWidth="0.7" opacity="0.6" />
      <SkinShade cx={32} cy={27} r={12.6} />
      <path
        d="M19 27
             C19 18 25 15 32 15
             C39 15 45 18 45 27
             C44 22.5 40 20 35 20
             C32 20 29 20 26 22.5
             C23 23.5 21 25 19 27 Z"
        fill="#2A2520"
      />
      <path
        d="M22 17.5
             C26 15.8 32 15.3 38 17
             C33 17.8 29 17.6 25 18.4
             C22.6 18.8 22 18 22 17.5 Z"
        fill="#3C3129"
        opacity="0.8"
      />
      <Eyes cx={32} cy={28} />
      <Mouth mouth="M27.6 33.4q4.4 3.4 8.8 0" />
    </g>
  </svg>
)

export const GirlTwoAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="girl-2">
    <circle cx="32" cy="32" r="32" fill="#FFFFFF" />
    <circle cx="32" cy="32" r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
    <g>
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="-1.6 32 62; 1.6 32 62; -1.6 32 62"
        dur="3.2s"
        repeatCount="indefinite"
      />
      <Body topColor="#A62C60" />
    </g>
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -0.6; 0 0"
        dur="3.2s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="12.6" ry="13.6" fill="#F2C9A0" />
      <ellipse cx="32" cy="25.4" rx="12.6" ry="12.9" fill="none" stroke="#E5AE89" strokeWidth="0.7" opacity="0.6" />
      <SkinShade cx={32} cy={27} r={12.6} />
      <path
        d="M19.4 27
           C19 20.6 22 16 32 15.5
           C42 16 45 20.4 44.6 27
           C44.2 30.2 41.8 32 39.6 31.5
           C41.4 28.8 41 25.5 37.6 24.5
           C34.6 23.4 29.4 23.4 26.4 24.5
           C23.6 25.5 22.6 29 24.2 31.6
           C21.8 32.1 19.6 30.2 19.4 27 Z"
        fill="#E6B84D"
      />
      <path
        d="M19.4 27
           C20.5 29.4 22 31.4 23.3 32
           C21.8 29.4 20.5 25.8 19.4 27 Z"
        fill="#C79A31"
        opacity="0.8"
      />
      <path
        d="M44.6 27
           C43.5 29.4 42 31.4 40.7 32
           C42 29.4 43.3 25.8 44.6 27 Z"
        fill="#C79A31"
        opacity="0.8"
      />
      <g>
        <circle cx="20.2" cy="13.2" r="1.7" fill="#B5294F" />
        <path
          d="M21.6 13.5
             L27.2 10.2
             L27.2 16.9
             Z"
          fill="#F25C84"
        />
        <path
          d="M21.6 13.5
             L27.2 10.2"
          stroke="#A01F47"
          strokeWidth="0.9"
        />
        <path
          d="M27.2 10.2
             L27.2 16.9
             L21.6 14.2
             Z"
          fill="#F9A6C7"
          opacity="0.75"
        />
        <path
          d="M18.8 13.5
             L13.2 10.2
             L13.2 16.9"
          fill="#F25C84"
          opacity="0.9"
        />
        <path
          d="M18.8 13.5
             L13.2 10.2"
          stroke="#A01F47"
          strokeWidth="0.9"
          opacity="0.9"
        />
        <path
          d="M13.2 10.2
             L13.2 16.9
             L18.8 14.2"
          fill="#F9A6C7"
          opacity="0.6"
        />
      </g>
      <Eyes cx={32} cy={28} />
      <Mouth mouth="M27.6 33.4q4.4 3.4 8.8 0" />
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
