import React from 'react'

/**
 * The four animated bot avatars tenants can choose between (mirrors
 * widget/src/components/BotAvatars.tsx — the two apps are built separately).
 * The selection is saved into the tenant's settings as `bot_avatar`.
 *
 * These mirror the redesigned widget avatars: clean, friendly, modern
 * illustrated characters on a soft white circle, with warm skin tones,
 * simple expressive faces, and one clear distinguishing trait each.
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

/** Shared shoulders + top block for a clean half-body look. */
const Body: React.FC<{
  topColor: string
  accent?: string
  neckColor?: string
}> = ({
  topColor,
  accent = '#D8C7B0',
  neckColor = '#F3D2B0',
}) => (
  <>
    <path
      d="M14 64c0-14 8-22 20-22s18 8 18 20z"
      fill={topColor}
      stroke={accent}
      strokeWidth="1.2"
      opacity="0.92"
    />
    <path
      d="M27 43 L32 45.5 L37 43"
      fill="none"
      stroke={neckColor}
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity="0.95"
    />
    <path
      d="M27 43 L37 43"
      stroke={neckColor}
      strokeWidth="1.1"
      strokeLinecap="round"
      opacity="0.7"
    />
  </>
)

/** Friendly 3/4 smile with a softer upper edge and optional blush. */
const Smile: React.FC<{ mouth: string; cheek?: boolean }> = ({ mouth, cheek = false }) => (
  <g fill="none" strokeLinecap="round">
    <path d={mouth} stroke="#7C4A2C" strokeWidth="1.9" opacity="0.95" />
    <path
      d={`M${(parseFloat(mouth.split(' ')[1]) - 1.1).toFixed(2)}
          ${(parseFloat(mouth.split(' ')[2]) - 0.1).toFixed(2)}
         ${(parseFloat(mouth.split(' ')[4]) + 1.1).toFixed(2)}
          ${(parseFloat(mouth.split(' ')[5]) - 0.6).toFixed(2)}`}
      stroke="#B57A52"
      strokeWidth="1.3"
      opacity="0.75"
    />
    {cheek && (
      <>
        <circle cx="20.5" cy="31.5" r="2.8" fill="#E8A3B6" opacity="0.5" />
        <circle cx="43.5" cy="31.5" r="2.8" fill="#E8A3B6" opacity="0.5" />
      </>
    )}
  </g>
)

/** Hair that frames the face. */
const FrameHair: React.FC<{
  cx: number
  cy: number
  hairColor: string
  r: number
  dur?: string
  side: 'left' | 'right'
}> = ({ cx, cy, hairColor, r, dur = '2.6s', side }) => {
  const sign = side === 'left' ? -1 : 1
  return (
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values={`0 0; ${sign * 0.4} -0.8; 0 0`}
        dur={dur}
        repeatCount="indefinite"
      />
      <path
        d={`M${(cx + sign * r * 0.78).toFixed(2)} ${(cy - r * 0.55).toFixed(2)}
          C${(cx + sign * r * 1.18).toFixed(2)} ${(cy - r * 0.05).toFixed(2)}
            ${(cx + sign * r * 1.28).toFixed(2)} ${(cy + r * 0.45).toFixed(2)}
            ${(cx + sign * r * 0.98).toFixed(2)} ${(cy + r * 0.85).toFixed(2)}
          C${(cx + sign * r * 0.68).toFixed(2)} ${(cy + r * 0.55).toFixed(2)}
            ${(cx + sign * r * 0.5).toFixed(2)} ${(cy + r * 0.2).toFixed(2)}
            ${(cx + sign * r * 0.42).toFixed(2)} ${(cy + r * 0.05).toFixed(2)}
          C${(cx + sign * r * 0.42).toFixed(2)} ${(cy - r * 0.2).toFixed(2)}
            ${(cx + sign * r * 0.6).toFixed(2)} ${(cy - r * 0.3).toFixed(2)}
            ${(cx + sign * r * 0.78).toFixed(2)} ${(cy - r * 0.55).toFixed(2)} Z`}
        fill={hairColor}
      />
      <path
        d={`M${(cx + sign * r * 0.74).toFixed(2)} ${(cy - r * 0.5).toFixed(2)}
          C${(cx + sign * r * 1.05).toFixed(2)} ${(cy - r * 0.15).toFixed(2)}
            ${(cx + sign * r * 1.12).toFixed(2)} ${(cy + r * 0.2).toFixed(2)}
            ${(cx + sign * r * 0.92).toFixed(2)} ${(cy + r * 0.5).toFixed(2)}
          C${(cx + sign * r * 0.74).toFixed(2)} ${(cy + r * 0.3).toFixed(2)}
            ${(cx + sign * r * 0.62).toFixed(2)} ${(cy + r * 0.06).toFixed(2)}
            ${(cx + sign * r * 0.58).toFixed(2)} ${(cy - r * 0.02).toFixed(2)}
          C${(cx + sign * r * 0.6).toFixed(2)} ${(cy - r * 0.22).toFixed(2)}
            ${(cx + sign * r * 0.66).toFixed(2)} ${(cy - r * 0.42).toFixed(2)}
            ${(cx + sign * r * 0.74).toFixed(2)} ${(cy - r * 0.5).toFixed(2)} Z`}
        fill={hairColor}
        opacity="0.85"
      />
    </g>
  )
}

/** Soft bangs across the top of the head. */
const Bangs: React.FC<{
  cx: number
  cy: number
  hairColor: string
  r: number
  dur?: string
  wave?: boolean
}> = ({ cx, cy, hairColor, r, dur = '2.8s', wave = false }) => (
  <g>
    <animateTransform
      attributeName="transform"
      type="translate"
      values={wave ? '0 0; 0 -0.9; 0 0' : '0 0; 0 -0.6; 0 0'}
      dur={dur}
      repeatCount="indefinite"
    />
    <path
      d={`M${(cx - r).toFixed(2)} ${(cy - r * 0.32).toFixed(2)}
         C${(cx - r * 1.18).toFixed(2)} ${(cy - r * 1.4).toFixed(2)}
           ${(cx - r * 0.5).toFixed(2)} ${(cy - r * 1.55).toFixed(2)}
           ${cx} ${(cy - r * 1.35).toFixed(2)}
         C${(cx + r * 0.5).toFixed(2)} ${(cy - r * 1.55).toFixed(2)}
           ${(cx + r * 1.18).toFixed(2)} ${(cy - r * 1.4).toFixed(2)}
           ${(cx + r).toFixed(2)} ${(cy - r * 0.32).toFixed(2)}
         C${(cx + r * 0.68).toFixed(2)} ${(cy - r * 0.52).toFixed(2)}
           ${(cx + r * 0.25).toFixed(2)} ${(cy - r * 0.25).toFixed(2)}
           ${cx} ${(cy - r * 0.18).toFixed(2)}
         C${(cx - r * 0.25).toFixed(2)} ${(cy - r * 0.25).toFixed(2)}
           ${(cx - r * 0.68).toFixed(2)} ${(cy - r * 0.52).toFixed(2)}
           ${(cx - r).toFixed(2)} ${(cy - r * 0.32).toFixed(2)} Z`}
      fill={hairColor}
    />
    {wave && (
      <path
        d={`M${(cx - r * 0.92).toFixed(2)} ${(cy - r * 0.22).toFixed(2)}
           C${(cx - r * 0.65).toFixed(2)} ${(cy - r * 1.0).toFixed(2)}
             ${(cx - r * 0.28).toFixed(2)} ${(cy - r * 1.05).toFixed(2)}
             ${cx} ${(cy - r * 0.95).toFixed(2)}
           C${(cx + r * 0.28).toFixed(2)} ${(cy - r * 1.05).toFixed(2)}
             ${(cx + r * 0.65).toFixed(2)} ${(cy - r * 1.0).toFixed(2)}
             ${(cx + r * 0.92).toFixed(2)} ${(cy - r * 0.22).toFixed(2)}
           C${(cx + r * 0.5).toFixed(2)} ${(cy - r * 0.45).toFixed(2)}
             ${(cx + r * 0.05).toFixed(2)} ${(cy - r * 0.4).toFixed(2)}
             ${cx} ${(cy - r * 0.38).toFixed(2)}
           C${(cx - r * 0.05).toFixed(2)} ${(cy - r * 0.4).toFixed(2)}
             ${(cx - r * 0.5).toFixed(2)} ${(cy - r * 0.45).toFixed(2)}
             ${(cx - r * 0.92).toFixed(2)} ${(cy - r * 0.22).toFixed(2)} Z`}
        fill={hairColor}
        opacity="0.9"
      />
    )}
  </g>
)

/** Eyes: brows, eye whites, pupils, catchlights, blink. */
const Eyes: React.FC<{ cx: number; cy: number; dur?: string }> = ({
  cx,
  cy,
  dur = '3.4s',
}) => (
  <g>
    <path
      d={`M${(cx - 4.5).toFixed(2)} ${(cy - 4.6).toFixed(2)}
         L${(cx - 0.6).toFixed(2)} ${(cy - 4.3).toFixed(2)}`}
      stroke="#3A2E26"
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.55"
    />
    <path
      d={`M${(cx + 0.5).toFixed(2)} ${(cy - 4.3).toFixed(2)}
         L${(cx + 4.4).toFixed(2)} ${(cy - 4.6).toFixed(2)}`}
      stroke="#3A2E26"
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.55"
    />
    <ellipse cx={cx - 3.6} cy={cy - 1.6} rx="1.9" ry="2.2" fill="#FFFFFF" />
    <ellipse cx={cx + 3.6} cy={cy - 1.6} rx="1.9" ry="2.2" fill="#FFFFFF" />
    <circle cx={cx - 3.6} cy={cy - 1.6} r="1.1" fill="#2C241B" />
    <circle cx={cx + 3.6} cy={cy - 1.6} r="1.1" fill="#2C241B" />
    <BlinkingEye cx={cx - 3.6} cy={cy - 1.6} dur={dur} />
    <BlinkingEye cx={cx + 3.6} cy={cy - 1.6} dur={dur} />
    <circle cx={cx - 3.15} cy={cy - 2.05} r="0.4" fill="#FFFFFF" />
    <circle cx={cx + 4.05} cy={cy - 2.05} r="0.4" fill="#FFFFFF" />
  </g>
)

/** Soft nose: a small curved stroke. */
const Nose: React.FC<{ cx: number; cy: number }> = ({ cx, cy }) => (
  <path
    d={`M${cx} ${(cy + 0.1).toFixed(2)}
       q1.3 1.7 0 2.7`}
    fill="none"
    stroke="#C89373"
    strokeWidth="1"
    strokeLinecap="round"
    opacity="0.6"
  />
)

export const BoyOneAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="boy-1">
    <circle cx="32" cy="32" r="32" fill="#FFFFFF" />
    <circle cx="32" cy="32" r="31.3" fill="none" stroke="#E9E2D6" strokeWidth="1.2" />
    <Body topColor="#274F8A" accent="#E9E2D6" neckColor="#F3D2B0" />
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -1.6; 0 0"
        dur="2.8s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="13.5" ry="13.5" fill="#F2C9A0" />
      <ellipse cx="32" cy="25.4" rx="13.5" ry="12.8" fill="none" stroke="#E5AE89" strokeWidth="0.7" opacity="0.7" />
      <Bangs cx={32} cy={27} hairColor="#2A2520" r={13.5} dur="2.8s" />
      <FrameHair cx={32} cy={27} hairColor="#2A2520" r={13.5} dur="2.8s" side="left" />
      <FrameHair cx={32} cy={27} hairColor="#2A2520" r={13.5} dur="2.8s" side="right" />
      <Eyes cx={32} cy={28} />
      <Nose cx={32} cy={28.4} />
      <Smile mouth="M28 33.4q4 3.4 8 0" />
    </g>
  </svg>
)

export const BoyTwoAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="boy-2">
    <circle cx="32" cy="32" r="32" fill="#FFFFFF" />
    <circle cx="32" cy="32" r="31.3" fill="none" stroke="#E9E2D6" strokeWidth="1.2" />
    <Body topColor="#2F7A8C" accent="#E9E2D6" neckColor="#F3D2B0" />
    <g>
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="0 50 40; -24 50 40; 0 50 40"
        dur="1.5s"
        repeatCount="indefinite"
      />
      <path
        d="M47 40.5 q3.4 -0.8 5.2 -4.2"
        stroke="#F2C9A0"
        strokeWidth="4.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="52.2" cy="36" r="2.2" fill="#F2C9A0" />
      <circle cx="53.6" cy="34.4" r="0.9" fill="#F2C9A0" />
      <circle cx="54.2" cy="36.6" r="0.9" fill="#F2C9A0" />
      <circle cx="53.4" cy="38.2" r="0.9" fill="#F2C9A0" />
    </g>
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -0.8; 0 0"
        dur="3.1s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="13.5" ry="13.5" fill="#F2C9A0" />
      <ellipse cx="32" cy="25.4" rx="13.5" ry="12.8" fill="none" stroke="#E5AE89" strokeWidth="0.7" opacity="0.7" />
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="0 32 25.5; -11 32 25.5; 0 32 25.5"
          dur="3.1s"
          repeatCount="indefinite"
        />
        <circle cx={32 - 10.2} cy={27 - 5.3} r={3.6} fill="#443A32" />
        <circle cx={32 - 5.9} cy={27 - 9.7} r={3.7} fill="#443A32" />
        <circle cx={32} cy={27 - 11.1} r={3.7} fill="#443A32" />
        <circle cx={32 + 5.9} cy={27 - 9.7} r={3.7} fill="#443A32" />
        <circle cx={32 + 10.2} cy={27 - 5.3} r={3.6} fill="#443A32" />
        <circle cx={32 - 11.2} cy={27 - 1.3} r={3.4} fill="#443A32" />
        <circle cx={32 + 11.2} cy={27 - 1.3} r={3.4} fill="#443A32" />
        <circle cx={32 - 4.3} cy={27 - 11.1} r={3.0} fill="#443A32" />
        <circle cx={32 + 4.3} cy={27 - 11.1} r={3.0} fill="#443A32" />
        <circle cx={32} cy={27 - 7.9} r={2.9} fill="#443A32" />
        <circle cx={32 - 2.1} cy={27 - 9.3} r={2.4} fill="#443A32" opacity="0.85" />
        <circle cx={32 + 2.1} cy={27 - 9.3} r={2.4} fill="#443A32" opacity="0.85" />
      </g>
      <circle cx={28.6} cy={28.4} r={4} fill="none" stroke="#243246" strokeWidth="1.4" />
      <circle cx={35.6} cy={28.4} r={4} fill="none" stroke="#243246" strokeWidth="1.4" />
      <line x1="32.4" y1={28.4} x2="33.6" y2={28.4} stroke="#243246" strokeWidth="1.4" />
      <line x1="24.4" y1={28.25} x2="21.6" y2={27.7} stroke="#243246" strokeWidth="1.1" />
      <line x1="39.6" y1={28.25} x2="42.4" y2={27.7} stroke="#243246" strokeWidth="1.1" />
      <Eyes cx={32} cy={28.4} />
      <Nose cx={32} cy={28.6} />
      <Smile mouth="M28 33.4q4 3.4 8 0" />
    </g>
  </svg>
)

export const GirlOneAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="girl-1">
    <circle cx="32" cy="32" r="32" fill="#FFFFFF" />
    <circle cx="32" cy="32" r="31.3" fill="none" stroke="#E9E2D6" strokeWidth="1.2" />
    <Body topColor="#7A3A7E" accent="#E9E2D6" neckColor="#F3D2B0" />
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -2.2; 0 0"
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
      <ellipse cx="32" cy="27" rx="13" ry="13.4" fill="#F2C9A0" />
      <ellipse cx="32" cy="25.4" rx="13" ry="12.6" fill="none" stroke="#E5AE89" strokeWidth="0.7" opacity="0.7" />
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
      <Eyes cx={32} cy={28} dur="3.8s" />
      <Nose cx={32} cy={28.4} />
      <Smile mouth="M27.6 33.4q4.4 3.4 8.8 0" cheek />
    </g>
  </svg>
)

export const GirlTwoAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="girl-2">
    <circle cx="32" cy="32" r="32" fill="#FFFFFF" />
    <circle cx="32" cy="32" r="31.3" fill="none" stroke="#E9E2D6" strokeWidth="1.2" />
    <g>
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="-1.6 32 62; 1.6 32 62; -1.6 32 62"
        dur="3.2s"
        repeatCount="indefinite"
      />
      <Body topColor="#A62C60" accent="#E9E2D6" neckColor="#F3D2B0" />
    </g>
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -0.6; 0 0"
        dur="3.2s"
        repeatCount="indefinite"
      />
      <ellipse cx="32" cy="27" rx="13" ry="13.4" fill="#F2C9A0" />
      <ellipse cx="32" cy="25.4" rx="13" ry="12.6" fill="none" stroke="#E5AE89" strokeWidth="0.7" opacity="0.7" />
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
             L13.2 16.9
             Z"
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
             L18.8 14.2
             Z"
          fill="#F9A6C7"
          opacity="0.6"
        />
      </g>
      <Eyes cx={32} cy={28} dur="4.1s" />
      <Nose cx={32} cy={28.4} />
      <Smile mouth="M27.6 33.4q4.4 3.4 8.8 0" cheek />
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
