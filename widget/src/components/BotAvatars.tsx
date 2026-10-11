import React from 'react'

/**
 * The four bot avatars every tenant can choose between (admin → tenant →
 * Settings → Assistant → Avatar). The choice is stored in the tenant's
 * settings JSON as `bot_avatar` and delivered through /widget/config.
 *
 * Style: people-like characters on a soft white circle. Each face is drawn as
 * one aligned unit so the features don't overlap oddly: head shape first,
 * then hair only across the top of the head, ears at the sides, eyes at a
 * natural eye line, brows just above the eyes, a small nose, and the mouth
 * lower on the face. One clear trait per avatar so all four are easy to tell
 * apart:
 *   boy-1  — short dark hair, navy top, gentle head bob + blink
 *   boy-2  — curly hair, glasses, teal top, waving hand + blink
 *   girl-1 — twin ponytails, plum top, ponytail bob + blink
 *   girl-2 — blonde bob with a bow, magenta top, gentle sway + blink
 *
 * Background is white so the avatars stay readable on any host page.
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

/** Eye that blinks on a loop (SMIL works inside the widget's shadow DOM). */
const BlinkingEye: React.FC<{ cx: number; cy: number; dur?: string }> = ({
  cx,
  cy,
  dur = '3.4s',
}) => (
  <ellipse cx={cx} cy={cy} rx={1.9} ry={2.2} fill="#2A1F18">
    <animate
      attributeName="ry"
      values="2.2;2.2;0.25;2.2"
      keyTimes="0;0.9;0.935;1"
      dur={dur}
      repeatCount="indefinite"
    />
  </ellipse>
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
  neckColor = '#F1D1AB',
  fold = '#8E8678',
}) => (
  <>
    {/* shoulders under the head */}
    <path
      d="M14 64c0-14 8-22 20-22s18 8 18 20z"
      fill={topColor}
      stroke={accent}
      strokeWidth="1.1"
      opacity="0.94"
    />
    {/* faint cloth fold shadow */}
    <path
      d="M14 64c0-14 8-22 20-22s18 8 18 20z"
      fill="none"
      stroke={fold}
      strokeWidth="0.9"
      opacity="0.32"
    />
    {/* neckline / collar */}
    <path
      d="M26.5 44 L32 46.5 L37.5 44"
      fill="none"
      stroke={neckColor}
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity="0.95"
    />
    <path
      d="M26.5 44 L37.5 44"
      stroke={neckColor}
      strokeWidth="1.1"
      strokeLinecap="round"
      opacity="0.75"
    />
    {/* faint collar shadow */}
    <path
      d="M28 44.5 q4 2 8 0"
      fill="none"
      stroke={fold}
      strokeWidth="0.7"
      opacity="0.4"
    />
  </>
)

/** One clean aligned face: head base + skin shade + ears, all from one center. */
const FaceBase: React.FC<{
  cx: number
  cy: number
  rx: number
  ry: number
  skinColor: string
  earColor: string
  hairColor: string
}> = ({ cx, cy, rx, ry, skinColor, earColor, hairColor }) => {
  // neck/chin shadow under the face
  const shade = (
    <ellipse
      cx={cx}
      cy={cy + ry * 0.42}
      rx={rx * 0.55}
      ry={ry * 0.2}
      fill="#C99A75"
      opacity="0.32"
    />
  )

  // ears sit at the sides of the head, slightly below the center line
  const ears = (
    <>
      <ellipse cx={cx - rx * 0.92} cy={cy - 0.5} rx={2.1} ry={3.2} fill={earColor} />
      <ellipse cx={cx + rx * 0.92} cy={cy - 0.5} rx={2.1} ry={3.2} fill={earColor} />
    </>
  )

  return (
    <>
      {/* actual head shape */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={skinColor} />
      {/* subtle top-of-head highlight so the head reads as a head, not a blob */}
      <ellipse cx={cx} cy={cy - ry * 0.35} rx={rx * 0.8} ry={ry * 0.5} fill="none" stroke="#FCE6D2" strokeWidth="0.8" opacity="0.7" />
      {/* cheek/nose-area warmth */}
      <ellipse cx={cx} cy={cy + ry * 0.12} rx={rx * 0.5} ry={ry * 0.35} fill="#E8A090" opacity="0.28" />
      {/* cheek blush dots */}
      <ellipse cx={cx - rx * 0.5} cy={cy + ry * 0.22} rx={2.4} ry={1.8} fill="#E8A090" opacity="0.45" />
      <ellipse cx={cx + rx * 0.5} cy={cy + ry * 0.22} rx={2.4} ry={1.8} fill="#E8A090" opacity="0.45" />
      {shade}
      {ears}
    </>
  )
}

/** Hair that sits ONLY on top of the head, over the hairline — not over the eyes/mouth. */
const HairTop: React.FC<{
  cx: number
  cy: number
  rx: number
  ry: number
  hairColor: string
  shadow?: string
  dur?: string
}> = ({ cx, cy, rx, ry, hairColor, shadow = '#211A14', dur = '2.8s' }) => (
  <g>
    <animateTransform
      attributeName="transform"
      type="translate"
      values="0 0; 0 -0.6; 0 0"
      dur={dur}
      repeatCount="indefinite"
    />
    {/* main hair cap: sits above the head, hugging the top of the ellipse */}
    <path
      d={`M${(cx - rx).toFixed(2)} ${cy.toFixed(2)}
         C${(cx - rx * 1.1).toFixed(2)} ${(cy - ry * 1.05).toFixed(2)}
           ${(cx - rx * 0.45).toFixed(2)} ${(cy - ry * 1.25).toFixed(2)}
           ${cx} ${(cy - ry * 1.15).toFixed(2)}
         C${(cx + rx * 0.45).toFixed(2)} ${(cy - ry * 1.25).toFixed(2)}
           ${(cx + rx * 1.1).toFixed(2)} ${(cy - ry * 1.05).toFixed(2)}
           ${(cx + rx).toFixed(2)} ${cy.toFixed(2)}
         C${(cx + rx * 0.7).toFixed(2)} ${(cy - ry * 0.15).toFixed(2)}
           ${(cx + rx * 0.22).toFixed(2)} ${(cy + ry * 0.02).toFixed(2)}
           ${cx} ${(cy + ry * 0.06).toFixed(2)}
         C${(cx - rx * 0.22).toFixed(2)} ${(cy + ry * 0.02).toFixed(2)}
           ${(cx - rx * 0.7).toFixed(2)} ${(cy - ry * 0.15).toFixed(2)}
           ${(cx - rx).toFixed(2)} ${cy.toFixed(2)} Z`}
      fill={hairColor}
    />
    {/* darker underside of the hair cap so the hair shape reads */}
    <path
      d={`M${(cx - rx * 0.92).toFixed(2)} ${(cy - ry * 0.02).toFixed(2)}
         C${(cx - rx * 0.62).toFixed(2)} ${(cy - ry * 0.7).toFixed(2)}
           ${(cx - rx * 0.28).toFixed(2)} ${(cy - ry * 0.82).toFixed(2)}
           ${cx} ${(cy - ry * 0.74).toFixed(2)}
         C${(cx + rx * 0.28).toFixed(2)} ${(cy - ry * 0.82).toFixed(2)}
           ${(cx + rx * 0.62).toFixed(2)} ${(cy - ry * 0.7).toFixed(2)}
           ${(cx + rx * 0.92).toFixed(2)} ${(cy - ry * 0.02).toFixed(2)}
         C${(cx + rx * 0.5).toFixed(2)} ${(cy - ry * 0.18).toFixed(2)}
           ${(cx + rx * 0.05).toFixed(2)} ${(cy - ry * 0.12).toFixed(2)}
           ${cx} ${(cy - ry * 0.1).toFixed(2)}
         C${(cx - rx * 0.05).toFixed(2)} ${(cy - ry * 0.12).toFixed(2)}
           ${(cx - rx * 0.5).toFixed(2)} ${(cy - ry * 0.18).toFixed(2)}
           ${(cx - rx * 0.92).toFixed(2)} ${(cy - ry * 0.02).toFixed(2)} Z`}
      fill={shadow}
      opacity="0.35"
    />
  </g>
)

/** Eyes: brows then eye whites, iris, pupil, blink, catchlight — all on one eye line. */
const Eyes: React.FC<{
  cx: number
  eyeY: number
  dur?: string
}> = ({ cx, eyeY, dur = '3.4s' }) => {
  const leftEyeX = cx - 3.6
  const rightEyeX = cx + 3.6

  return (
    <g>
      {/* brows just above the eyes */}
      <path
        d={`M${(leftEyeX - 2.2).toFixed(2)} ${(eyeY - 2.7).toFixed(2)}
           L${(leftEyeX + 1.8).toFixed(2)} ${(eyeY - 2.9).toFixed(2)}`}
        stroke="#3A2E26"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d={`M${(rightEyeX - 1.8).toFixed(2)} ${(eyeY - 2.9).toFixed(2)}
           L${(rightEyeX + 2.2).toFixed(2)} ${(eyeY - 2.7).toFixed(2)}`}
        stroke="#3A2E26"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* eye whites */}
      <ellipse cx={leftEyeX} cy={eyeY} rx={1.9} ry={2.2} fill="#FFFFFF" />
      <ellipse cx={rightEyeX} cy={eyeY} rx={1.9} ry={2.2} fill="#FFFFFF" />

      {/* iris */}
      <circle cx={leftEyeX} cy={eyeY} r={1.3} fill="#4A3A2A" />
      <circle cx={rightEyeX} cy={eyeY} r={1.3} fill="#4A3A2A" />

      {/* pupil */}
      <circle cx={leftEyeX} cy={eyeY} r={0.55} fill="#1A140E" />
      <circle cx={rightEyeX} cy={eyeY} r={0.55} fill="#1A140E" />

      {/* blink */}
      <BlinkingEye cx={leftEyeX} cy={eyeY} dur={dur} />
      <BlinkingEye cx={rightEyeX} cy={eyeY} dur={dur} />

      {/* catchlights */}
      <circle cx={leftEyeX - 0.45} cy={eyeY - 0.5} r={0.4} fill="#FFFFFF" />
      <circle cx={rightEyeX + 0.45} cy={eyeY - 0.5} r={0.4} fill="#FFFFFF" />
    </g>
  )
}

/** Nose: small, centered, lower than the eyes. */
const Nose: React.FC<{ cx: number; noseY: number }> = ({ cx, noseY }) => (
  <path
    d={`M${cx} ${noseY}
       q1.2 1.6 0 2.6`}
    fill="none"
    stroke="#C89373"
    strokeWidth="1"
    strokeLinecap="round"
    opacity="0.7"
  />
)

/** Mouth: lower on the face than the nose. */
const Mouth: React.FC<{ cx: number; mouthY: number }> = ({ cx, mouthY }) => (
  <path
    d={`M${(cx - 4).toFixed(2)} ${mouthY.toFixed(2)}
       q4 3.4 8 0`}
    fill="none"
    stroke="#6E3F27"
    strokeWidth="1.9"
    strokeLinecap="round"
    opacity="0.9"
  />
)

/** boy-1 — short dark hair, navy top, gentle head bob + blink. */
export const BoyOneAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 13
  const ry = 13.5

  return (
    <svg viewBox="0 0 64 64" data-avatar="boy-1">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />

      <Body topColor="#274F8A" />

      {/* animated head group */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -1.5; 0 0"
          dur="2.8s"
          repeatCount="indefinite"
        />

        {/* face base first */}
        <FaceBase
          cx={headCenterX}
          cy={headCenterY}
          rx={rx}
          ry={ry}
          skinColor="#F2C9A0"
          earColor="#E5AE89"
          hairColor="#2A2520"
        />

        {/* hair only on top */}
        <HairTop
          cx={headCenterX}
          cy={headCenterY}
          rx={rx}
          ry={ry}
          hairColor="#2A2520"
        />

        {/* eyes on the eye line, above nose and mouth */}
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.28} />
        {/* nose */}
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.02} />
        {/* mouth lower */}
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.32} />
      </g>
    </svg>
  )
}

/** boy-2 — curly hair, glasses, teal top, waving hand + blink. */
export const BoyTwoAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 13
  const ry = 13.5

  return (
    <svg viewBox="0 0 64 64" data-avatar="boy-2">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />

      <Body topColor="#2F7A8C" />

      {/* animated waving hand */}
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

      {/* animated head group */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -0.8; 0 0"
          dur="3.1s"
          repeatCount="indefinite"
        />

        {/* face base first */}
        <FaceBase
          cx={headCenterX}
          cy={headCenterY}
          rx={rx}
          ry={ry}
          skinColor="#F2C9A0"
          earColor="#E5AE89"
          hairColor="#443A32"
        />

        {/* curly hair: soft knots sitting on top of the head */}
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 32 22; -10 32 22; 0 32 22"
            dur="3.1s"
            repeatCount="indefinite"
          />
          <ellipse cx={headCenterX - 10.1} cy={headCenterY - 5.4} rx={3.3} ry={3.5} fill="#443A32" />
          <ellipse cx={headCenterX - 5.8} cy={headCenterY - 9.7} rx="3.4" ry="3.6" fill="#443A32" />
          <ellipse cx={headCenterX} cy={headCenterY - 11.1} rx="3.4" ry="3.6" fill="#443A32" />
          <ellipse cx={headCenterX + 5.8} cy={headCenterY - 9.7} rx="3.4" ry="3.6" fill="#443A32" />
          <ellipse cx={headCenterX + 10.1} cy={headCenterY - 5.4} rx="3.3" ry="3.5" fill="#443A32" />
          <ellipse cx={headCenterX - 11} cy={headCenterY - 1.4} rx="3.1" ry="3.3" fill="#443A32" />
          <ellipse cx={headCenterX + 11} cy={headCenterY - 1.4} rx="3.1" ry="3.3" fill="#443A32" />
          <ellipse cx={headCenterX - 4.2} cy={headCenterY - 11.1} rx="2.8" ry="2.9" fill="#443A32" />
          <ellipse cx={headCenterX + 4.2} cy={headCenterY - 11.1} rx="2.8" ry="2.9" fill="#443A32" />
          <ellipse cx={headCenterX} cy={headCenterY - 7.9} rx="2.7" ry="2.8" fill="#443A32" />
        </g>

        {/* glasses: sit around the eyes, not over the mouth */}
        <circle cx={headCenterX - 3.6} cy={headCenterY - ry * 0.26} r={4.1} fill="none" stroke="#243246" strokeWidth="1.4" />
        <circle cx={headCenterX + 3.6} cy={headCenterY - ry * 0.26} r={4.1} fill="none" stroke="#243246" strokeWidth="1.4" />
        <line x1={headCenterX - 0.2} y1={headCenterY - ry * 0.26} x2={headCenterX + 0.6} y2={headCenterY - ry * 0.26} stroke="#243246" strokeWidth="1.4" />
        <line x1={headCenterX - 4.4} y1={headCenterY - ry * 0.26} x2={headCenterX - 7.1} y2={headCenterY - ry * 0.32} stroke="#243246" strokeWidth="1.1" />
        <line x1={headCenterX + 7.8} y1={headCenterY - ry * 0.26} x2={headCenterX + 10.5} y2={headCenterY - ry * 0.32} stroke="#243246" strokeWidth="1.1" />

        {/* eyes through the glasses */}
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.26} />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.02} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.32} />
      </g>
    </svg>
  )
}

/** girl-1 — twin ponytails, plum top, ponytail bob + blink. */
export const GirlOneAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 12.4
  const ry = 13.4

  return (
    <svg viewBox="0 0 64 64" data-avatar="girl-1">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />

      <Body topColor="#7A3A7E" />

      {/* animated twin ponytails: start at the sides of the head and hang down */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -2; 0 0"
          dur="2.1s"
          repeatCount="indefinite"
        />
        {/* left ponytail */}
        <path
          d="M${(headCenterX - rx - 2)} ${(headCenterY - 2)}
             C${(headCenterX - rx - 9)} ${(headCenterY - 12)}
               ${(headCenterX - rx - 9)} ${(headCenterY - 22)}
               ${(headCenterX - rx - 3)} ${(headCenterY - 24)}
             C${(headCenterX - rx + 2)} ${(headCenterY - 22)}
               ${(headCenterX - rx + 0.5)} ${(headCenterY - 14)}
               ${(headCenterX - rx - 2)} ${(headCenterY - 2)} Z"
          fill="#2A2520"
        />
        <path
          d="M${(headCenterX - rx - 2)} ${(headCenterY - 2)}
             C${(headCenterX - rx - 7)} ${(headCenterY - 7)}
               ${(headCenterX - rx - 7)} ${(headCenterY - 16)}
               ${(headCenterX - rx - 3)} ${(headCenterY - 18)}
             C${(headCenterX - rx + 1)} ${(headCenterY - 16)}
               ${(headCenterX - rx)} ${(headCenterY - 8)}
               ${(headCenterX - rx - 2)} ${(headCenterY - 2)} Z"
          fill="#3C3129"
          opacity="0.75"
        />
        {/* right ponytail */}
        <path
          d="M${(headCenterX + rx + 2)} ${(headCenterY - 2)}
             C${(headCenterX + rx + 9)} ${(headCenterY - 12)}
               ${(headCenterX + rx + 9)} ${(headCenterY - 22)}
               ${(headCenterX + rx + 3)} ${(headCenterY - 24)}
             C${(headCenterX + rx - 2)} ${(headCenterY - 22)}
               ${(headCenterX + rx - 0.5)} ${(headCenterY - 14)}
               ${(headCenterX + rx + 2)} ${(headCenterY - 2)} Z"
          fill="#2A2520"
        />
        <path
          d="M${(headCenterX + rx + 2)} ${(headCenterY - 2)}
             C${(headCenterX + rx + 7)} ${(headCenterY - 7)}
               ${(headCenterX + rx + 7)} ${(headCenterY - 16)}
               ${(headCenterX + rx + 3)} ${(headCenterY - 18)}
             C${(headCenterX + rx - 1)} ${(headCenterY - 16)}
               ${(headCenterX + rx)} ${(headCenterY - 8)}
               ${(headCenterX + rx + 2)} ${(headCenterY - 2)} Z"
          fill="#3C3129"
          opacity="0.75"
        />
      </g>

      {/* animated head group */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -1; 0 0"
          dur="2.6s"
          repeatCount="indefinite"
        />

        {/* face base first */}
        <FaceBase
          cx={headCenterX}
          cy={headCenterY}
          rx={rx}
          ry={ry}
          skinColor="#F2C9A0"
          earColor="#E5AE89"
          hairColor="#2A2520"
        />

        {/* hair frame around the face: top bun shape + side hair near the temples */}
        {/* top hair cap first */}
        <HairTop
          cx={headCenterX}
          cy={headCenterY}
          rx={rx}
          ry={ry}
          hairColor="#2A2520"
        />

        {/* a small hair bun/puff on top */}
        <ellipse cx={headCenterX} cy={headCenterY - ry * 1.05} rx="5.5" ry="3.5" fill="#2A2520" />
        <ellipse cx={headCenterX - 4} cy={headCenterY - ry * 1.1} rx="2.4" ry="2" fill="#3C3129" opacity="0.8" />
        <ellipse cx={headCenterX + 4} cy={headCenterY - ry * 1.1} rx="2.4" ry="2" fill="#3C3129" opacity="0.8" />

        {/* side hair framing the face — but keep it above the eyes */}
        <path
          d={`M${(headCenterX - rx * 0.92)} ${(headCenterY - ry * 0.5)}
             C${(headCenterX - rx * 1.15)} ${(headCenterY - ry * 0.1)}
               ${(headCenterX - rx * 0.9)} ${(headCenterY + ry * 0.3)}
               ${(headCenterX - rx * 0.78)} ${(headCenterY + ry * 0.35)} Z`}
          fill="#2A2520"
        />
        <path
          d={`M${(headCenterX + rx * 0.92)} ${(headCenterY - ry * 0.5)}
             C${(headCenterX + rx * 1.15)} ${(headCenterY - ry * 0.1)}
               ${(headCenterX + rx * 0.9)} ${(headCenterY + ry * 0.3)}
               ${(headCenterX + rx * 0.78)} ${(headCenterY + ry * 0.35)} Z`}
          fill="#2A2520"
        />

        {/* eyes */}
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.24} dur="3.8s" />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.04} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.34} />
      </g>
    </svg>
  )
}

/** girl-2 — blonde bob with a bow, magenta top, gentle sway + blink. */
export const GirlTwoAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 12.4
  const ry = 13.4

  return (
    <svg viewBox="0 0 64 64" data-avatar="girl-2">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />

      {/* magenta top — gentle sway */}
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

      {/* animated head group */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -0.6; 0 0"
          dur="3.2s"
          repeatCount="indefinite"
        />

        {/* face base first */}
        <FaceBase
          cx={headCenterX}
          cy={headCenterY}
          rx={rx}
          ry={ry}
          skinColor="#F2C9A0"
          earColor="#E5AE89"
          hairColor="#E6B84D"
        />

        {/* blonde bob: hair cap + side hair framing the face, all defined from the head center */}
        <HairTop
          cx={headCenterX}
          cy={headCenterY}
          rx={rx}
          ry={ry}
          hairColor="#E6B84D"
        />
        {/* darker underside of the bob */}
          <path
            d={`M${(headCenterX - rx * 0.92)} ${(headCenterY - ry * 0.02)}
               C${(headCenterX - rx * 0.62)} ${(headCenterY - ry * 0.7)}
                 ${(headCenterX - rx * 0.28)} ${(headCenterY - ry * 0.82)}
                 ${headCenterX} ${(headCenterY - ry * 0.74)}
               C${(headCenterX + rx * 0.28)} ${(headCenterY - ry * 0.82)}
                 ${(headCenterX + rx * 0.62)} ${(headCenterY - ry * 0.7)}
                 ${(headCenterX + rx * 0.92)} ${(headCenterY - ry * 0.02)}
               C${(headCenterX + rx * 0.5)} ${(headCenterY - ry * 0.18)}
                 ${(headCenterX + rx * 0.05)} ${(headCenterY - ry * 0.12)}
                 ${headCenterX} ${(headCenterY - ry * 0.1)}
               C${(headCenterX - rx * 0.05)} ${(headCenterY - ry * 0.12)}
                 ${(headCenterX - rx * 0.5)} ${(headCenterY - ry * 0.18)}
                 ${(headCenterX - rx * 0.92)} ${(headCenterY - ry * 0.02)} Z`}
            fill="#C79A31"
            opacity="0.8"
          />

        {/* side hair framing the face, above the eyes */}
        <path
          d={`M${(headCenterX - rx * 0.96)} ${(headCenterY - ry * 0.1)}
             C${(headCenterX - rx * 0.7)} ${(headCenterY - ry * 0.55)}
               ${(headCenterX - rx * 0.55)} ${(headCenterY - ry * 0.15)}
               ${(headCenterX - rx * 0.42)} ${(headCenterY + ry * 0.12)} Z`}
          fill="#E6B84D"
        />
        <path
          d={`M${(headCenterX + rx * 0.96)} ${(headCenterY - ry * 0.1)}
             C${(headCenterX + rx * 0.7)} ${(headCenterY - ry * 0.55)}
               ${(headCenterX + rx * 0.55)} ${(headCenterY - ry * 0.15)}
               ${(headCenterX + rx * 0.42)} ${(headCenterY + ry * 0.12)} Z`}
          fill="#E6B84D"
        />

        {/* satin bow: centered above the head, on the hair bun */}
        <g>
          <circle cx={headCenterX} cy={headCenterY - ry * 1.05} r="1.6" fill="#B5294F" />
          <path
            d={`M${(headCenterX + 1.6)} ${(headCenterY - ry * 1.05)}
               L${(headCenterX + 6.6)} ${(headCenterY - ry * 1.3)}
               L${(headCenterX + 6.6)} ${(headCenterY - ry * 0.8)}
               Z`}
            fill="#F25C84"
          />
          <path
            d={`M${(headCenterX + 1.6)} ${(headCenterY - ry * 1.05)}
               L${(headCenterX + 6.6)} ${(headCenterY - ry * 1.3)}`}
            stroke="#A01F47"
            strokeWidth="0.9"
          />
          <path
            d={`M${(headCenterX + 6.6)} ${(headCenterY - ry * 1.3)}
               L${(headCenterX + 6.6)} ${(headCenterY - ry * 0.8)}
               L${(headCenterX + 1.6)} ${(headCenterY - ry * 0.95)}
               Z`}
            fill="#F9A6C7"
            opacity="0.75"
          />
          <path
            d={`M${(headCenterX - 1.6)} ${(headCenterY - ry * 1.05)}
               L${(headCenterX - 6.6)} ${(headCenterY - ry * 1.3)}
               L${(headCenterX - 6.6)} ${(headCenterY - ry * 0.8)}
               Z`}
            fill="#F25C84"
            opacity="0.9"
          />
          <path
            d={`M${(headCenterX - 1.6)} ${(headCenterY - ry * 1.05)}
               L${(headCenterX - 6.6)} ${(headCenterY - ry * 1.3)}`}
            stroke="#A01F47"
            strokeWidth="0.9"
            opacity="0.9"
          />
          <path
            d={`M${(headCenterX - 6.6)} ${(headCenterY - ry * 1.3)}
               L${(headCenterX - 6.6)} ${(headCenterY - ry * 0.8)}
               L${(headCenterX - 1.6)} ${(headCenterY - ry * 0.95)}
               Z`}
            fill="#F9A6C7"
            opacity="0.6"
          />
        </g>

        {/* eyes */}
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.24} dur="4.1s" />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.04} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.34} />
      </g>
    </svg>
  )
}

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
