import React from 'react'

/**
 * The eight animated bot avatars tenants can choose between (mirrors
 * widget/src/components/BotAvatars.tsx — the two apps are built separately).
 * The selection is saved into the tenant's settings as `bot_avatar`.
 *
 * These mirror the aligned-face widget avatars: people-like characters on a
 * soft white circle where the face is drawn as one aligned unit (head base,
 * hair only on top, ears at the sides, eyes on one eye line, nose above
 * mouth, mouth lower on the face) so the features no longer overlap oddly.
 * One clear trait per avatar so all eight are easy to tell apart.
 */
export const BOT_AVATARS = [
  { id: 'person-1', label: 'Person 1' },
  { id: 'person-2', label: 'Person 2' },
  { id: 'person-3', label: 'Person 3' },
  { id: 'person-4', label: 'Person 4' },
  { id: 'person-5', label: 'Person 5' },
  { id: 'person-6', label: 'Person 6' },
  { id: 'person-7', label: 'Person 7' },
  { id: 'person-8', label: 'Person 8' },
] as const

/** Eye that blinks on a loop (SMIL). */
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
      opacity="0.32"
    />
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
    <path
      d="M28 44.5 q4 2 8 0"
      fill="none"
      stroke={fold}
      strokeWidth="0.7"
      opacity="0.4"
    />
  </>
)

/** One clean aligned face base: head ellipse + skin shade + ears. */
const FaceBase: React.FC<{
  cx: number
  cy: number
  rx: number
  ry: number
  skinColor: string
  earColor: string
  hairColor: string
}> = ({ cx, cy, rx, ry, skinColor, earColor, hairColor }) => (
  <>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={skinColor} />
    <ellipse cx={cx} cy={cy - ry * 0.35} rx={rx * 0.8} ry={ry * 0.5} fill="none" stroke="#FCE6D2" strokeWidth="0.8" opacity="0.7" />
    <ellipse cx={cx} cy={cy + ry * 0.12} rx={rx * 0.5} ry={ry * 0.35} fill="#E8A090" opacity="0.28" />
    <ellipse cx={cx - rx * 0.5} cy={cy + ry * 0.22} rx={2.4} ry={1.8} fill="#E8A090" opacity="0.45" />
    <ellipse cx={cx + rx * 0.5} cy={cy + ry * 0.22} rx={2.4} ry={1.8} fill="#E8A090" opacity="0.45" />
    <ellipse cx={cx} cy={cy + ry * 0.42} rx={rx * 0.55} ry={ry * 0.2} fill="#C99A75" opacity="0.32" />
    <ellipse cx={cx - rx * 0.92} cy={cy - 0.5} rx={2.1} ry={3.2} fill={earColor} />
    <ellipse cx={cx + rx * 0.92} cy={cy - 0.5} rx={2.1} ry={3.2} fill={earColor} />
  </>
)

/** Hair that sits ONLY on top of the head. */
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

/** Eyes on one eye line. */
const Eyes: React.FC<{
  cx: number
  eyeY: number
  dur?: string
}> = ({ cx, eyeY, dur = '3.4s' }) => {
  const leftEyeX = cx - 3.6
  const rightEyeX = cx + 3.6
  return (
    <g>
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
      <ellipse cx={leftEyeX} cy={eyeY} rx={1.9} ry={2.2} fill="#FFFFFF" />
      <ellipse cx={rightEyeX} cy={eyeY} rx={1.9} ry={2.2} fill="#FFFFFF" />
      <circle cx={leftEyeX} cy={eyeY} r={1.3} fill="#4A3A2A" />
      <circle cx={rightEyeX} cy={eyeY} r={1.3} fill="#4A3A2A" />
      <circle cx={leftEyeX} cy={eyeY} r={0.55} fill="#1A140E" />
      <circle cx={rightEyeX} cy={eyeY} r={0.55} fill="#1A140E" />
      <BlinkingEye cx={leftEyeX} cy={eyeY} dur={dur} />
      <BlinkingEye cx={rightEyeX} cy={eyeY} dur={dur} />
      <circle cx={leftEyeX - 0.45} cy={eyeY - 0.5} r={0.4} fill="#FFFFFF" />
      <circle cx={rightEyeX + 0.45} cy={eyeY - 0.5} r={0.4} fill="#FFFFFF" />
    </g>
  )
}

/** Nose. */
const Nose: React.FC<{ cx: number; noseY: number }> = ({ cx, noseY }) => (
  <path
    d={`M${cx} ${noseY} q1.2 1.6 0 2.6`}
    fill="none"
    stroke="#C89373"
    strokeWidth="1"
    strokeLinecap="round"
    opacity="0.7"
  />
)

/** Mouth. */
const Mouth: React.FC<{ cx: number; mouthY: number }> = ({ cx, mouthY }) => (
  <path
    d={`M${(cx - 4).toFixed(2)} ${mouthY.toFixed(2)} q4 3.4 8 0`}
    fill="none"
    stroke="#6E3F27"
    strokeWidth="1.9"
    strokeLinecap="round"
    opacity="0.9"
  />
)

/** person-1 (P1) — short brown hair, blue collared shirt + white collar + dark blue tie. */
export const PersonOneAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 13
  const ry = 13.5
  return (
    <svg viewBox="0 0 64 64" data-avatar="person-1">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
      <Body topColor="#274F8A" />
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -1.5; 0 0"
          dur="2.8s"
          repeatCount="indefinite"
        />
        <FaceBase cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} skinColor="#F2C9A0" earColor="#E5AE89" hairColor="#2A2520" />
        <HairTop cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} hairColor="#2A2520" />
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.28} />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.02} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.32} />
      </g>
    </svg>
  )
}

/** person-2 (P2) — short black curly/textured hair, dark brown skin, red shirt + rounded white neckline. */
export const PersonTwoAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 13
  const ry = 13.5
  return (
    <svg viewBox="0 0 64 64" data-avatar="person-2">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
      <Body topColor="#2F7A8C" />
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="0 50 40; -22 50 40; 0 50 40"
          dur="1.5s"
          repeatCount="indefinite"
        />
        <path d="M47 40.5 q3.2 -0.6 4.8 -3.6" stroke="#F2C9A0" strokeWidth="4" strokeLinecap="round" fill="none" />
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
        <FaceBase cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} skinColor="#F2C9A0" earColor="#E5AE89" hairColor="#443A32" />
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 32 22; -10 32 22; 0 32 22"
            dur="3.1s"
            repeatCount="indefinite"
          />
          <ellipse cx={headCenterX - 10.1} cy={headCenterY - 5.4} rx="3.3" ry="3.5" fill="#443A32" />
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
        <circle cx={headCenterX - 3.6} cy={headCenterY - ry * 0.26} r={4.1} fill="none" stroke="#243246" strokeWidth="1.4" />
        <circle cx={headCenterX + 3.6} cy={headCenterY - ry * 0.26} r={4.1} fill="none" stroke="#243246" strokeWidth="1.4" />
        <line x1={headCenterX - 0.2} y1={headCenterY - ry * 0.26} x2={headCenterX + 0.6} y2={headCenterY - ry * 0.26} stroke="#243246" strokeWidth="1.4" />
        <line x1={headCenterX - 4.4} y1={headCenterY - ry * 0.26} x2={headCenterX - 7.1} y2={headCenterY - ry * 0.32} stroke="#243246" strokeWidth="1.1" />
        <line x1={headCenterX + 7.8} y1={headCenterY - ry * 0.26} x2={headCenterX + 10.5} y2={headCenterY - ry * 0.32} stroke="#243246" strokeWidth="1.1" />
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.26} />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.02} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.32} />
      </g>
    </svg>
  )
}

/** person-3 (P3) — short dark brown hair, fair skin, dark eyes, yellow-and-white striped shirt. */
export const PersonThreeAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 12.4
  const ry = 13.4
  return (
    <svg viewBox="0 0 64 64" data-avatar="person-3">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
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
          d={`M${(headCenterX - rx - 2)} ${(headCenterY - 2)}
             C${(headCenterX - rx - 9)} ${(headCenterY - 12)}
               ${(headCenterX - rx - 9)} ${(headCenterY - 22)}
               ${(headCenterX - rx - 3)} ${(headCenterY - 24)}
             C${(headCenterX - rx + 2)} ${(headCenterY - 22)}
               ${(headCenterX - rx + 0.5)} ${(headCenterY - 14)}
               ${(headCenterX - rx - 2)} ${(headCenterY - 2)} Z`}
          fill="#2A2520"
        />
        <path
          d={`M${(headCenterX - rx - 2)} ${(headCenterY - 2)}
             C${(headCenterX - rx - 7)} ${(headCenterY - 7)}
               ${(headCenterX - rx - 7)} ${(headCenterY - 16)}
               ${(headCenterX - rx - 3)} ${(headCenterY - 18)}
             C${(headCenterX - rx + 1)} ${(headCenterY - 16)}
               ${(headCenterX - rx)} ${(headCenterY - 8)}
               ${(headCenterX - rx - 2)} ${(headCenterY - 2)} Z`}
          fill="#3C3129"
          opacity="0.75"
        />
        <path
          d={`M${(headCenterX + rx + 2)} ${(headCenterY - 2)}
             C${(headCenterX + rx + 9)} ${(headCenterY - 12)}
               ${(headCenterX + rx + 9)} ${(headCenterY - 22)}
               ${(headCenterX + rx + 3)} ${(headCenterY - 24)}
             C${(headCenterX + rx - 2)} ${(headCenterY - 22)}
               ${(headCenterX + rx - 0.5)} ${(headCenterY - 14)}
               ${(headCenterX + rx + 2)} ${(headCenterY - 2)} Z`}
          fill="#2A2520"
        />
        <path
          d={`M${(headCenterX + rx + 2)} ${(headCenterY - 2)}
             C${(headCenterX + rx + 7)} ${(headCenterY - 7)}
               ${(headCenterX + rx + 7)} ${(headCenterY - 16)}
               ${(headCenterX + rx + 3)} ${(headCenterY - 18)}
             C${(headCenterX + rx - 1)} ${(headCenterY - 16)}
               ${(headCenterX + rx)} ${(headCenterY - 8)}
               ${(headCenterX + rx + 2)} ${(headCenterY - 2)} Z`}
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
        <FaceBase cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} skinColor="#F2C9A0" earColor="#E5AE89" hairColor="#2A2520" />
        <HairTop cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} hairColor="#2A2520" />
        <ellipse cx={headCenterX} cy={headCenterY - ry * 1.05} rx="5.5" ry="3.5" fill="#2A2520" />
        <ellipse cx={headCenterX - 4} cy={headCenterY - ry * 1.1} rx="2.4" ry="2" fill="#3C3129" opacity="0.8" />
        <ellipse cx={headCenterX + 4} cy={headCenterY - ry * 1.1} rx="2.4" ry="2" fill="#3C3129" opacity="0.8" />
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
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.24} dur="3.8s" />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.04} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.34} />
      </g>
    </svg>
  )
}

/** person-4 (P4) — brown hair + beard + mustache, square glasses, dark purple shirt + white collared shirt underneath. */
export const PersonFourAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 12.4
  const ry = 13.4
  return (
    <svg viewBox="0 0 64 64" data-avatar="person-4">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
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
        <FaceBase cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} skinColor="#F2C9A0" earColor="#E5AE89" hairColor="#E6B84D" />
        <HairTop cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} hairColor="#E6B84D" />
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
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.24} dur="4.1s" />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.04} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.34} />
      </g>
    </svg>
  )
}

/** person-5 (P5) — dark brown hair in a top bun with a stray strand on the left, fair skin, green shirt + white round collar. */
export const PersonFiveAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 12.4
  const ry = 13.4
  return (
    <svg viewBox="0 0 64 64" data-avatar="person-5">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
      <Body topColor="#3F7A3A" />
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -1; 0 0"
          dur="2.6s"
          repeatCount="indefinite"
        />
        <FaceBase cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} skinColor="#F2C9A0" earColor="#E5AE89" hairColor="#2A2520" />
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 -0.6; 0 0"
            dur="2.5s"
            repeatCount="indefinite"
          />
          <ellipse cx={headCenterX} cy={headCenterY - ry * 1.05} rx="6.2" ry="4.2" fill="#2A2520" />
          <ellipse cx={headCenterX} cy={headCenterY - ry * 1.12} rx="4.2" ry="2.6" fill="#1A1410" opacity="0.5" />
          <ellipse cx={headCenterX} cy={headCenterY - ry * 1.05} rx="6.2" ry="1.4" fill="#1A1410" opacity="0.55" />
          <path
            d={`M${(headCenterX - rx).toFixed(2)} ${headCenterY.toFixed(2)}
               C${(headCenterX - rx * 1.1).toFixed(2)} ${(headCenterY - ry * 1.05).toFixed(2)}
                 ${(headCenterX - rx * 0.45).toFixed(2)} ${(headCenterY - ry * 1.2).toFixed(2)}
                 ${headCenterX} ${(headCenterY - ry * 1.12).toFixed(2)}
               C${(headCenterX + rx * 0.45).toFixed(2)} ${(headCenterY - ry * 1.2).toFixed(2)}
                 ${(headCenterX + rx * 1.1).toFixed(2)} ${(headCenterY - ry * 1.05).toFixed(2)}
                 ${(headCenterX + rx).toFixed(2)} ${headCenterY.toFixed(2)}
               C${(headCenterX + rx * 0.7).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
                 ${(headCenterX + rx * 0.22).toFixed(2)} ${(headCenterY + ry * 0.02).toFixed(2)}
                 ${headCenterX} ${(headCenterY + ry * 0.06).toFixed(2)}
               C${(headCenterX - rx * 0.22).toFixed(2)} ${(headCenterY + ry * 0.02).toFixed(2)}
                 ${(headCenterX - rx * 0.7).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
                 ${(headCenterX - rx).toFixed(2)} ${headCenterY.toFixed(2)} Z`}
            fill="#2A2520"
          />
          <path
            d={`M${(headCenterX - rx * 0.75).toFixed(2)} ${(headCenterY - ry * 0.35).toFixed(2)}
               C${(headCenterX - rx * 1.18).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
                 ${(headCenterX - rx * 1.08).toFixed(2)} ${(headCenterY + ry * 0.12).toFixed(2)}
                 ${(headCenterX - rx * 0.62).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}`}
            fill="none"
            stroke="#2A2520"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <path
            d={`M${(headCenterX - rx * 0.75).toFixed(2)} ${(headCenterY - ry * 0.35).toFixed(2)}
               C${(headCenterX - rx * 1.18).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
                 ${(headCenterX - rx * 1.08).toFixed(2)} ${(headCenterY + ry * 0.12).toFixed(2)}
                 ${(headCenterX - rx * 0.62).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}`}
            fill="none"
            stroke="#1A1410"
            strokeWidth="1"
            opacity="0.5"
          />
        </g>
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
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.24} dur="3.8s" />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.04} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.34} />
      </g>
    </svg>
  )
}

/** person-6 (P6) — shoulder-length reddish-brown hair, fair skin, magenta shirt + purple/dark-pink collared neckline. */
export const PersonSixAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 12.4
  const ry = 13.4
  return (
    <svg viewBox="0 0 64 64" data-avatar="person-6">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="-1.6 32 62; 1.6 32 62; -1.6 32 62"
          dur="3.2s"
          repeatCount="indefinite"
        />
        <path
          d="M14 64c0-14 8-22 20-22s18 8 18 20z"
          fill="#C2185B"
          stroke="#D8CCC0"
          strokeWidth="1.1"
          opacity="0.94"
        />
        <path
          d="M14 64c0-14 8-22 20-22s18 8 18 20z"
          fill="none"
          stroke="#8E8678"
          strokeWidth="0.9"
          opacity="0.32"
        />
        <path
          d="M24.5 44 L32 41 L39.5 44 L37.5 48 L32 46.5 L26.5 48 Z"
          fill="#6A1B5C"
          stroke="#8E8678"
          strokeWidth="0.9"
          opacity="0.5"
        />
        <path
          d="M26.5 48 L32 46.5 L37.5 48"
          fill="none"
          stroke="#F1D1AB"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.95"
        />
      </g>
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -0.6; 0 0"
          dur="3.1s"
          repeatCount="indefinite"
        />
        <FaceBase cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} skinColor="#F2C9A0" earColor="#E5AE89" hairColor="#7A3A1F" />
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 -0.5; 0 0"
            dur="2.8s"
            repeatCount="indefinite"
          />
          <path
            d={`M${(headCenterX - rx).toFixed(2)} ${headCenterY.toFixed(2)}
               C${(headCenterX - rx * 1.1).toFixed(2)} ${(headCenterY - ry * 1.05).toFixed(2)}
                 ${(headCenterX - rx * 0.45).toFixed(2)} ${(headCenterY - ry * 1.2).toFixed(2)}
                 ${headCenterX} ${(headCenterY - ry * 1.12).toFixed(2)}
               C${(headCenterX + rx * 0.45).toFixed(2)} ${(headCenterY - ry * 1.2).toFixed(2)}
                 ${(headCenterX + rx * 1.1).toFixed(2)} ${(headCenterY - ry * 1.05).toFixed(2)}
                 ${(headCenterX + rx).toFixed(2)} ${headCenterY.toFixed(2)}
               C${(headCenterX + rx * 0.7).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
                 ${(headCenterX + rx * 0.22).toFixed(2)} ${(headCenterY + ry * 0.02).toFixed(2)}
                 ${headCenterX} ${(headCenterY + ry * 0.06).toFixed(2)}
               C${(headCenterX - rx * 0.22).toFixed(2)} ${(headCenterY + ry * 0.02).toFixed(2)}
                 ${(headCenterX - rx * 0.7).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
                 ${(headCenterX - rx).toFixed(2)} ${headCenterY.toFixed(2)} Z`}
            fill="#7A3A1F"
          />
          <path
            d={`M${(headCenterX - rx * 0.92).toFixed(2)} ${(headCenterY - ry * 0.02).toFixed(2)}
               C${(headCenterX - rx * 0.62).toFixed(2)} ${(headCenterY - ry * 0.7).toFixed(2)}
                 ${(headCenterX - rx * 0.28).toFixed(2)} ${(headCenterY - ry * 0.82).toFixed(2)}
                 ${headCenterX} ${(headCenterY - ry * 0.74).toFixed(2)}
               C${(headCenterX + rx * 0.28).toFixed(2)} ${(headCenterY - ry * 0.82).toFixed(2)}
                 ${(headCenterX + rx * 0.62).toFixed(2)} ${(headCenterY - ry * 0.7).toFixed(2)}
                 ${(headCenterX + rx * 0.92).toFixed(2)} ${(headCenterY - ry * 0.02).toFixed(2)}
               C${(headCenterX + rx * 0.5).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
                 ${(headCenterX + rx * 0.05).toFixed(2)} ${(headCenterY - ry * 0.12).toFixed(2)}
                 ${headCenterX} ${(headCenterY - ry * 0.1).toFixed(2)}
               C${(headCenterX - rx * 0.05).toFixed(2)} ${(headCenterY - ry * 0.12).toFixed(2)}
                 ${(headCenterX - rx * 0.5).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
                 ${(headCenterX - rx * 0.92).toFixed(2)} ${(headCenterY - ry * 0.02).toFixed(2)} Z`}
            fill="#4A2410"
            opacity="0.55"
          />
          <path
            d={`M${(headCenterX - rx * 0.92).toFixed(2)} ${(headCenterY - ry * 0.35).toFixed(2)}
               C${(headCenterX - rx * 1.05).toFixed(2)} ${(headCenterY + ry * 0.05).toFixed(2)}
                 ${(headCenterX - rx * 1.02).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}
                 ${(headCenterX - rx * 0.78).toFixed(2)} ${(headCenterY + ry * 0.78).toFixed(2)}
               C${(headCenterX - rx * 0.5).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}
                 ${(headCenterX - rx * 0.35).toFixed(2)} ${(headCenterY + ry * 0.32).toFixed(2)}
                 ${(headCenterX - rx * 0.35).toFixed(2)} ${(headCenterY + ry * 0.05).toFixed(2)} Z`}
            fill="#7A3A1F"
          />
          <path
            d={`M${(headCenterX + rx * 0.92).toFixed(2)} ${(headCenterY - ry * 0.35).toFixed(2)}
               C${(headCenterX + rx * 1.05).toFixed(2)} ${(headCenterY + ry * 0.05).toFixed(2)}
                 ${(headCenterX + rx * 1.02).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}
                 ${(headCenterX + rx * 0.78).toFixed(2)} ${(headCenterY + ry * 0.78).toFixed(2)}
               C${(headCenterX + rx * 0.5).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}
                 ${(headCenterX + rx * 0.35).toFixed(2)} ${(headCenterY + ry * 0.32).toFixed(2)}
                 ${(headCenterX + rx * 0.35).toFixed(2)} ${(headCenterY + ry * 0.05).toFixed(2)} Z`}
            fill="#7A3A1F"
          />
        </g>
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.24} dur="4.1s" />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.04} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.34} />
      </g>
    </svg>
  )
}

/** person-7 (P7) — dark hair in two pigtail buns, fair skin, round glasses, blue shirt with darker blue polka dots. */
export const PersonSevenAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 12.4
  const ry = 13.4
  return (
    <svg viewBox="0 0 64 64" data-avatar="person-7">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="-1.6 32 62; 1.6 32 62; -1.6 32 62"
          dur="3.2s"
          repeatCount="indefinite"
        />
        <path
          d="M14 64c0-14 8-22 20-22s18 8 18 20z"
          fill="#2F6FB2"
          stroke="#D8CCC0"
          strokeWidth="1.1"
          opacity="0.94"
        />
        <path
          d="M14 64c0-14 8-22 20-22s18 8 18 20z"
          fill="none"
          stroke="#8E8678"
          strokeWidth="0.9"
          opacity="0.32"
        />
        <circle cx={21.5} cy={50} r="1.4" fill="#1B4A78" opacity="0.85" />
        <circle cx={26} cy={53.5} r="1.4" fill="#1B4A78" opacity="0.85" />
        <circle cx={32} cy="54" r="1.4" fill="#1B4A78" opacity="0.85" />
        <circle cx={38} cy="53.5" r="1.4" fill="#1B4A78" opacity="0.85" />
        <circle cx="42.5" cy="50" r="1.4" fill="#1B4A78" opacity="0.85" />
        <circle cx="19" cy="46.5" r="1.2" fill="#1B4A78" opacity="0.85" />
        <circle cx="45" cy="46.5" r="1.2" fill="#1B4A78" opacity="0.85" />
        <path
          d="M26.5 44 L32 46.5 L37.5 44"
          fill="none"
          stroke="#F1D1AB"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="M26.5 44 L37.5 44"
          fill="none"
          stroke="#F1D1AB"
          strokeWidth="1.1"
          strokeLinecap="round"
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
        <FaceBase cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} skinColor="#F2C9A0" earColor="#E5AE89" hairColor="#2A2520" />
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 -1; 0 0"
            dur="2.5s"
            repeatCount="indefinite"
          />
          <path
            d={`M${(headCenterX - rx).toFixed(2)} ${headCenterY.toFixed(2)}
               C${(headCenterX - rx * 1.1).toFixed(2)} ${(headCenterY - ry * 1.05).toFixed(2)}
                 ${(headCenterX - rx * 0.45).toFixed(2)} ${(headCenterY - ry * 1.2).toFixed(2)}
                 ${headCenterX} ${(headCenterY - ry * 1.12).toFixed(2)}
               C${(headCenterX + rx * 0.45).toFixed(2)} ${(headCenterY - ry * 1.2).toFixed(2)}
                 ${(headCenterX + rx * 1.1).toFixed(2)} ${(headCenterY - ry * 1.05).toFixed(2)}
                 ${(headCenterX + rx).toFixed(2)} ${headCenterY.toFixed(2)}
               C${(headCenterX + rx * 0.7).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
                 ${(headCenterX + rx * 0.22).toFixed(2)} ${(headCenterY + ry * 0.02).toFixed(2)}
                 ${headCenterX} ${(headCenterY + ry * 0.06).toFixed(2)}
               C${(headCenterX - rx * 0.22).toFixed(2)} ${(headCenterY + ry * 0.02).toFixed(2)}
                 ${(headCenterX - rx * 0.7).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
                 ${(headCenterX - rx).toFixed(2)} ${headCenterY.toFixed(2)} Z`}
            fill="#2A2520"
          />
          <ellipse cx={headCenterX - rx * 0.92} cy={headCenterY - ry * 0.7} rx="4" ry="2.6" fill="#2A2520" />
          <ellipse cx={headCenterX - rx * 0.92} cy={headCenterY - ry * 1.1} rx="2.6" ry="1.6" fill="#1A1410" opacity="0.5" />
          <ellipse cx={headCenterX + rx * 0.92} cy={headCenterY - ry * 0.7} rx="4" ry="2.6" fill="#2A2520" />
          <ellipse cx={headCenterX + rx * 0.92} cy={headCenterY - ry * 1.1} rx="2.6" ry="1.6" fill="#1A1410" opacity="0.5" />
          <ellipse cx={headCenterX - rx * 0.92} cy={headCenterY - ry * 0.7} rx="4" ry="0.8" fill="#1A1410" opacity="0.55" />
          <ellipse cx={headCenterX + rx * 0.92} cy={headCenterY - ry * 0.7} rx="4" ry="0.8" fill="#1A1410" opacity="0.55" />
        </g>
        <circle cx={headCenterX - 3.6} cy={headCenterY - ry * 0.26} r={4.3} fill="none" stroke="#243246" strokeWidth="1.4" />
        <circle cx={headCenterX + 3.6} cy={headCenterY - ry * 0.26} r={4.3} fill="none" stroke="#243246" strokeWidth="1.4" />
        <line x1={headCenterX - 0.4} y1={headCenterY - ry * 0.26} x2={headCenterX + 0.4} y2={headCenterY - ry * 0.26} stroke="#243246" strokeWidth="1.4" />
        <path
          d={`M${(headCenterX - rx * 0.92).toFixed(2)} ${(headCenterY - ry * 0.02).toFixed(2)}
             C${(headCenterX - rx * 0.62).toFixed(2)} ${(headCenterY - ry * 0.7).toFixed(2)}
               ${(headCenterX - rx * 0.28).toFixed(2)} ${(headCenterY - ry * 0.82).toFixed(2)}
               ${headCenterX} ${(headCenterY - ry * 0.74).toFixed(2)}
             C${(headCenterX + rx * 0.28).toFixed(2)} ${(headCenterY - ry * 0.82).toFixed(2)}
               ${(headCenterX + rx * 0.62).toFixed(2)} ${(headCenterY - ry * 0.7).toFixed(2)}
               ${(headCenterX + rx * 0.92).toFixed(2)} ${(headCenterY - ry * 0.02).toFixed(2)}
             C${(headCenterX + rx * 0.5).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
               ${(headCenterX + rx * 0.05).toFixed(2)} ${(headCenterY - ry * 0.12).toFixed(2)}
               ${headCenterX} ${(headCenterY - ry * 0.1).toFixed(2)}
             C${(headCenterX - rx * 0.05).toFixed(2)} ${(headCenterY - ry * 0.12).toFixed(2)}
               ${(headCenterX - rx * 0.5).toFixed(2)} ${(headCenterY - ry * 0.18).toFixed(2)}
               ${(headCenterX - rx * 0.92).toFixed(2)} ${(headCenterY - ry * 0.02).toFixed(2)} Z`}
          fill="#1A1410"
          opacity="0.55"
        />
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.26} />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.04} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.34} />
      </g>
    </svg>
  )
}

/** person-8 (P8) — long voluminous dark curly hair, brown skin, dark eyes, orange-yellow sleeveless top + small white flower badge on right shoulder. */
export const PersonEightAvatar: React.FC = () => {
  const headCenterX = 32
  const headCenterY = 28
  const rx = 12.4
  const ry = 13.4
  return (
    <svg viewBox="0 0 64 64" data-avatar="person-8">
      <circle cx={32} cy={32} r="32" fill="#FFFFFF" />
      <circle cx={32} cy={32} r="31.3" fill="none" stroke="#E8DDD0" strokeWidth="1.2" />
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="-1.6 32 62; 1.6 32 62; -1.6 32 62"
          dur="3.2s"
          repeatCount="indefinite"
        />
        <path
          d="M14 64c0-14 8-22 20-22s18 8 18 20z"
          fill="#F2A63C"
          stroke="#D8CCC0"
          strokeWidth="1.1"
          opacity="0.94"
        />
        <path
          d="M14 64c0-14 8-22 20-22s18 8 18 20z"
          fill="none"
          stroke="#8E8678"
          strokeWidth="0.9"
          opacity="0.32"
        />
        <path
          d={`M${(headCenterX - rx * 0.78).toFixed(2)} ${(headCenterY + ry * 0.25).toFixed(2)}
             C${(headCenterX - rx * 1.05).toFixed(2)} ${(headCenterY + ry * 0.02).toFixed(2)}
               ${(headCenterX - rx * 1.02).toFixed(2)} ${(headCenterY - ry * 0.42).toFixed(2)}
               ${(headCenterX - rx * 0.62).toFixed(2)} ${(headCenterY - ry * 0.55).toFixed(2)}
             L${(headCenterX - rx * 0.55).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}
               L${(headCenterX - rx * 0.4).toFixed(2)} ${(headCenterY + ry * 0.6).toFixed(2)}
             L${(headCenterX + rx * 0.4).toFixed(2)} ${(headCenterY + ry * 0.6).toFixed(2)}
               L${(headCenterX + rx * 0.55).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}
             L${(headCenterX + rx * 0.62).toFixed(2)} ${(headCenterY - ry * 0.55).toFixed(2)}
               C${(headCenterX + rx * 1.02).toFixed(2)} ${(headCenterY - ry * 0.42).toFixed(2)}
               ${(headCenterX + rx * 1.05).toFixed(2)} ${(headCenterY + ry * 0.02).toFixed(2)}
               ${(headCenterX + rx * 0.78).toFixed(2)} ${(headCenterY + ry * 0.25).toFixed(2)} Z`}
          fill="none"
          stroke="#8E8678"
          strokeWidth="0.9"
          opacity="0.45"
        />
        <g>
          <circle cx={headCenterX + rx * 0.72} cy={headCenterY + ry * 0.22} r="2.3" fill="#FFFFFF" opacity="0.95" />
          <circle cx={headCenterX + rx * 0.72 - 0.85} cy={headCenterY + ry * 0.22 - 0.5} r="1.1" fill="#FFFFFF" opacity="0.95" />
          <circle cx={headCenterX + rx * 0.72 + 0.85} cy={headCenterY + ry * 0.22 - 0.5} r="1.1" fill="#FFFFFF" opacity="0.95" />
          <circle cx={headCenterX + rx * 0.72 - 0.85} cy={headCenterY + ry * 0.22 + 0.5} r="1.1" fill="#FFFFFF" opacity="0.95" />
          <circle cx={headCenterX + rx * 0.72 + 0.85} cy={headCenterY + ry * 0.22 + 0.5} r="1.1" fill="#FFFFFF" opacity="0.95" />
          <circle cx={headCenterX + rx * 0.72} cy={headCenterY + ry * 0.22} r="0.9" fill="#E8A090" opacity="0.95" />
        </g>
      </g>
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -0.6; 0 0"
          dur="3.2s"
          repeatCount="indefinite"
        />
        <FaceBase cx={headCenterX} cy={headCenterY} rx={rx} ry={ry} skinColor="#C98A5A" earColor="#B57A4E" hairColor="#2A2520" />
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 -0.5; 0 0"
            dur="2.5s"
            repeatCount="indefinite"
          />
          <path
            d={`M${(headCenterX - rx).toFixed(2)} ${headCenterY.toFixed(2)}
               C${(headCenterX - rx * 1.25).toFixed(2)} ${(headCenterY - ry * 1.05).toFixed(2)}
                 ${(headCenterX - rx * 0.5).toFixed(2)} ${(headCenterY - ry * 1.35).toFixed(2)}
                 ${headCenterX} ${(headCenterY - ry * 1.28).toFixed(2)}
               C${(headCenterX + rx * 0.5).toFixed(2)} ${(headCenterY - ry * 1.35).toFixed(2)}
                 ${(headCenterX + rx * 1.25).toFixed(2)} ${(headCenterY - ry * 1.05).toFixed(2)}
                 ${(headCenterX + rx).toFixed(2)} ${headCenterY.toFixed(2)}
               C${(headCenterX + rx * 0.7).toFixed(2)} ${(headCenterY - ry * 0.15).toFixed(2)}
                 ${(headCenterX + rx * 0.22).toFixed(2)} ${(headCenterY + ry * 0.02).toFixed(2)}
                 ${headCenterX} ${(headCenterY + ry * 0.06).toFixed(2)}
               C${(headCenterX - rx * 0.22).toFixed(2)} ${(headCenterY + ry * 0.02).toFixed(2)}
                 ${(headCenterX - rx * 0.7).toFixed(2)} ${(headCenterY - ry * 0.15).toFixed(2)}
                 ${(headCenterX - rx).toFixed(2)} ${headCenterY.toFixed(2)} Z`}
            fill="#2A2520"
          />
          <path
            d={`M${(headCenterX - rx * 0.95).toFixed(2)} ${(headCenterY - ry * 0.02).toFixed(2)}
               C${(headCenterX - rx * 0.62).toFixed(2)} ${(headCenterY - ry * 0.75).toFixed(2)}
                 ${(headCenterX - rx * 0.28).toFixed(2)} ${(headCenterY - ry * 0.92).toFixed(2)}
                 ${headCenterX} ${(headCenterY - ry * 0.82).toFixed(2)}
               C${(headCenterX + rx * 0.28).toFixed(2)} ${(headCenterY - ry * 0.92).toFixed(2)}
                 ${(headCenterX + rx * 0.62).toFixed(2)} ${(headCenterY - ry * 0.75).toFixed(2)}
                 ${(headCenterX + rx * 0.95).toFixed(2)} ${(headCenterY - ry * 0.02).toFixed(2)}
               C${(headCenterX + rx * 0.5).toFixed(2)} ${(headCenterY - ry * 0.2).toFixed(2)}
                 ${(headCenterX + rx * 0.05).toFixed(2)} ${(headCenterY - ry * 0.12).toFixed(2)}
                 ${headCenterX} ${(headCenterY - ry * 0.12).toFixed(2)}
               C${(headCenterX - rx * 0.05).toFixed(2)} ${(headCenterY - ry * 0.12).toFixed(2)}
                 ${(headCenterX - rx * 0.5).toFixed(2)} ${(headCenterY - ry * 0.2).toFixed(2)}
                 ${(headCenterX - rx * 0.95).toFixed(2)} ${(headCenterY - ry * 0.02).toFixed(2)} Z`}
            fill="#1A1410"
            opacity="0.5"
          />
          <path
            d={`M${(headCenterX - rx * 0.92).toFixed(2)} ${(headCenterY - ry * 0.2).toFixed(2)}
               C${(headCenterX - rx * 1.12).toFixed(2)} ${(headCenterY + ry * 0.15).toFixed(2)}
                 ${(headCenterX - rx * 1.05).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}
                 ${(headCenterX - rx * 0.72).toFixed(2)} ${(headCenterY + ry * 0.72).toFixed(2)}
               C${(headCenterX - rx * 0.5).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}
                 ${(headCenterX - rx * 0.4).toFixed(2)} ${(headCenterY + ry * 0.32).toFixed(2)}
                 ${(headCenterX - rx * 0.4).toFixed(2)} ${(headCenterY + ry * 0.1).toFixed(2)} Z`}
            fill="#2A2520"
          />
          <path
            d={`M${(headCenterX + rx * 0.92).toFixed(2)} ${(headCenterY - ry * 0.2).toFixed(2)}
               C${(headCenterX + rx * 1.12).toFixed(2)} ${(headCenterY + ry * 0.15).toFixed(2)}
                 ${(headCenterX + rx * 1.05).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}
                 ${(headCenterX + rx * 0.72).toFixed(2)} ${(headCenterY + ry * 0.72).toFixed(2)}
               C${(headCenterX + rx * 0.5).toFixed(2)} ${(headCenterY + ry * 0.55).toFixed(2)}
                 ${(headCenterX + rx * 0.4).toFixed(2)} ${(headCenterY + ry * 0.32).toFixed(2)}
                 ${(headCenterX + rx * 0.4).toFixed(2)} ${(headCenterY + ry * 0.1).toFixed(2)} Z`}
            fill="#2A2520"
          />
          <ellipse cx={headCenterX - rx * 0.95} cy={headCenterY - ry * 0.5} rx="2.2" ry="2.4" fill="#1A1410" opacity="0.7" />
          <ellipse cx={headCenterX - rx * 0.5} cy={headCenterY - ry * 0.95} rx="2.2" ry="2.4" fill="#1A1410" opacity="0.7" />
          <ellipse cx={headCenterX} cy={headCenterY - ry * 1.1} rx="2.3" ry="2.5" fill="#1A1410" opacity="0.7" />
          <ellipse cx={headCenterX + rx * 0.5} cy={headCenterY - ry * 0.95} rx="2.2" ry="2.4" fill="#1A1410" opacity="0.7" />
          <ellipse cx={headCenterX + rx * 0.95} cy={headCenterY - ry * 0.5} rx="2.2" ry="2.4" fill="#1A1410" opacity="0.7" />
          <ellipse cx={headCenterX - rx * 0.72} cy={headCenterY - ry * 0.08} rx="2.1" ry="2.3" fill="#1A1410" opacity="0.6" />
          <ellipse cx={headCenterX + rx * 0.72} cy={headCenterY - ry * 0.08} rx="2.1" ry="2.3" fill="#1A1410" opacity="0.6" />
        </g>
        <Eyes cx={headCenterX} eyeY={headCenterY - ry * 0.24} dur="4.0s" />
        <Nose cx={headCenterX} noseY={headCenterY + ry * 0.04} />
        <Mouth cx={headCenterX} mouthY={headCenterY + ry * 0.34} />
      </g>
    </svg>
  )
}

export const BotAvatar: React.FC<{ id?: string | null }> = ({ id }) => {
  switch (id) {
    case 'person-1':
      return <PersonOneAvatar />
    case 'person-2':
      return <PersonTwoAvatar />
    case 'person-3':
      return <PersonThreeAvatar />
    case 'person-4':
      return <PersonFourAvatar />
    case 'person-5':
      return <PersonFiveAvatar />
    case 'person-6':
      return <PersonSixAvatar />
    case 'person-7':
      return <PersonSevenAvatar />
    case 'person-8':
      return <PersonEightAvatar />
    default:
      return <PersonOneAvatar />
  }
}

interface BotAvatarPickerProps {
  value: string
  onChange: (id: string) => void
}

/** Radio-style picker showing all eight animated avatars. */
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
