import React from 'react'

/**
 * The four bot avatars every tenant can choose between (admin → tenant →
 * Settings → Assistant → Avatar). The choice is stored in the tenant's
 * settings JSON as `bot_avatar` and delivered through /widget/config.
 */
export const BOT_AVATARS = [
  { id: 'boy-1', label: 'Boy 1' },
  { id: 'boy-2', label: 'Boy 2' },
  { id: 'girl-1', label: 'Girl 1' },
  { id: 'girl-2', label: 'Girl 2' },
] as const

export type BotAvatarId = (typeof BOT_AVATARS)[number]['id']

export function isBotAvatarId(value: unknown): value is BotAvatarId {
  return typeof value === 'string' && BOT_AVATARS.some((a) => a.id === value)
}

/** Eye that blinks on a loop (SMIL keeps it working inside the shadow DOM). */
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

const Smile: React.FC<{ d: string }> = ({ d }) => (
  <path d={d} stroke="#B4795A" strokeWidth="1.8" fill="none" strokeLinecap="round" />
)

/** Boy 1 — short dark hair, blue tee, gentle head bob + blink. */
export const BoyOneAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="boy-1">
    <circle cx="32" cy="32" r="32" fill="#DBEAFE" />
    <rect x="28" y="36" width="8" height="10" rx="2" fill="#EDB98E" />
    <path d="M10 64c0-12 10-18 22-18s22 6 22 18z" fill="#3B82F6" />
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -1.2; 0 0"
        dur="2.8s"
        repeatCount="indefinite"
      />
      <circle cx="32" cy="27" r="13" fill="#F6C9A0" />
      <path d="M19.5 25.5a12.5 12.5 0 0 1 25 0c-1.2-1.6-2.4-6-12.5-6s-11.3 4.4-12.5 6z" fill="#3F3B45" />
      <BlinkingEye cx={27} cy={28} />
      <BlinkingEye cx={37} cy={28} />
      <Smile d="M27.5 34q4.5 3.5 9 0" />
    </g>
  </svg>
)

/** Boy 2 — curly hair, glasses, green tee, waving hand + blink. */
export const BoyTwoAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="boy-2">
    <circle cx="32" cy="32" r="32" fill="#D1FAE5" />
    <g>
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="0 50 52; -24 50 52; 0 50 52"
        dur="1.5s"
        repeatCount="indefinite"
      />
      <rect x="47" y="40" width="6" height="13" rx="3" fill="#EDB98E" />
      <circle cx="50" cy="39" r="4" fill="#EDB98E" />
    </g>
    <rect x="28" y="36" width="8" height="10" rx="2" fill="#EDB98E" />
    <path d="M10 64c0-12 10-18 22-18s22 6 22 18z" fill="#10B981" />
    <circle cx="32" cy="27" r="13" fill="#F6C9A0" />
    <circle cx="23" cy="18" r="5" fill="#5B4632" />
    <circle cx="32" cy="15" r="5.5" fill="#5B4632" />
    <circle cx="41" cy="18" r="5" fill="#5B4632" />
    <circle cx="26.5" cy="21" r="4.5" fill="#5B4632" />
    <circle cx="37.5" cy="21" r="4.5" fill="#5B4632" />
    <circle cx="27" cy="28" r="4" fill="none" stroke="#374151" strokeWidth="1.4" />
    <circle cx="38" cy="28" r="4" fill="none" stroke="#374151" strokeWidth="1.4" />
    <line x1="31" y1="28" x2="34" y2="28" stroke="#374151" strokeWidth="1.4" />
    <BlinkingEye cx={27} cy={28} />
    <BlinkingEye cx={38} cy={28} />
    <Smile d="M28 34.5q4 3.5 8 0" />
  </svg>
)

/** Girl 1 — twin ponytails, purple tee, ponytail bob + blink. */
export const GirlOneAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="girl-1">
    <circle cx="32" cy="32" r="32" fill="#EDE9FE" />
    <g>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -1.5; 0 0"
        dur="2.2s"
        repeatCount="indefinite"
      />
      <ellipse cx="16" cy="27" rx="5" ry="8.5" fill="#2F2A28" />
      <ellipse cx="48" cy="27" rx="5" ry="8.5" fill="#2F2A28" />
    </g>
    <rect x="28" y="36" width="8" height="10" rx="2" fill="#F0BE97" />
    <path d="M10 64c0-12 10-18 22-18s22 6 22 18z" fill="#8B5CF6" />
    <circle cx="32" cy="27" r="13" fill="#F7CFAB" />
    <path d="M19.5 26a12.5 12.5 0 0 1 25 0c-.6-5.5-5.4-10-12.5-10s-11.9 4.5-12.5 10z" fill="#2F2A28" />
    <BlinkingEye cx={27} cy={28} dur="3.8s" />
    <BlinkingEye cx={37} cy={28} dur="3.8s" />
    <circle cx="22.5" cy="32" r="2.4" fill="#F9A8D4" opacity="0.55" />
    <circle cx="41.5" cy="32" r="2.4" fill="#F9A8D4" opacity="0.55" />
    <Smile d="M28 34.5q4 3.5 8 0" />
  </svg>
)

/** Girl 2 — blonde bob with a bow, pink tee, gentle sway + blink. */
export const GirlTwoAvatar: React.FC = () => (
  <svg viewBox="0 0 64 64" data-avatar="girl-2">
    <circle cx="32" cy="32" r="32" fill="#FCE7F3" />
    <g>
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="-1.5 32 62; 1.5 32 62; -1.5 32 62"
        dur="3.2s"
        repeatCount="indefinite"
      />
      <rect x="28" y="36" width="8" height="10" rx="2" fill="#F0BE97" />
      <path d="M10 64c0-12 10-18 22-18s22 6 22 18z" fill="#EC4899" />
      <path d="M17 31c0-12 6.5-19 15-19s15 7 15 19c0 4.5-.8 8-1.8 10.5V25c-2-6-7-8.5-13.2-8.5S20.8 19 18.8 25v16.5C17.8 39 17 35.5 17 31z" fill="#E6B85C" />
      <circle cx="32" cy="27" r="12.5" fill="#F7CFAB" />
      <path d="M20 24.5a12 12 0 0 1 24 0c-1-5.8-5.6-9.5-12-9.5s-11 3.7-12 9.5z" fill="#E6B85C" />
      <path d="M43 14.5l5.5-3v6z" fill="#F472B6" />
      <path d="M48.5 11.5l5 3v6l-5-3z" fill="#F9A8D4" />
      <BlinkingEye cx={27} cy={28} dur="4.1s" />
      <BlinkingEye cx={37} cy={28} dur="4.1s" />
      <circle cx="22.5" cy="32" r="2.4" fill="#F9A8D4" opacity="0.55" />
      <circle cx="41.5" cy="32" r="2.4" fill="#F9A8D4" opacity="0.55" />
      <Smile d="M28 34.5q4 3.5 8 0" />
    </g>
  </svg>
)

/** Renders the tenant's chosen avatar; unknown/missing ids fall back to Boy 1. */
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
