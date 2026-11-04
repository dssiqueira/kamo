import back from '@kamo/design-tokens/mascot/kamo-back.webp'
import front from '@kamo/design-tokens/mascot/kamo-front.webp'
import headBlink from '@kamo/design-tokens/mascot/kamo-head-blink.webp'
import headHappy from '@kamo/design-tokens/mascot/kamo-head-happy.webp'
import headLookSide from '@kamo/design-tokens/mascot/kamo-head-look-side.webp'
import headLookUp from '@kamo/design-tokens/mascot/kamo-head-look-up.webp'
import headLook from '@kamo/design-tokens/mascot/kamo-head-look.webp'
import headTongue from '@kamo/design-tokens/mascot/kamo-head-tongue.webp'
import headWink from '@kamo/design-tokens/mascot/kamo-head-wink.webp'
import scene from '@kamo/design-tokens/mascot/kamo-scene.webp'
import side from '@kamo/design-tokens/mascot/kamo-side.webp'

const POSES = {
  front,
  side,
  back,
  scene,
  'head-look': headLook,
  'head-look-side': headLookSide,
  'head-look-up': headLookUp,
  'head-blink': headBlink,
  'head-happy': headHappy,
  'head-wink': headWink,
  'head-tongue': headTongue,
} as const

export type MascotPose = keyof typeof POSES

export interface MascotProps {
  pose: MascotPose
  /** Rendered height in px; width follows the artwork. */
  size: number
  /** Mirrors the artwork so Kamo faces left (the drawings face right). */
  flip?: boolean
  className?: string
}

/**
 * Kamo, the chameleon (DESIGN.md → Mascot). Decorative: it never carries information, so it
 * is hidden from assistive tech. Never inside the exported video or the editor chrome.
 */
export function Mascot({ pose, size, flip, className }: MascotProps) {
  return (
    <img
      src={POSES[pose]}
      alt=""
      aria-hidden
      draggable={false}
      className={`select-none ${className ?? ''}`}
      style={{ height: size, width: 'auto', ...(flip ? { transform: 'scaleX(-1)' } : {}) }}
    />
  )
}
