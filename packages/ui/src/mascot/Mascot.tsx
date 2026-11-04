import back from '@kamo/design-tokens/mascot/kamo-back.webp'
import front from '@kamo/design-tokens/mascot/kamo-front.webp'
import headBlink from '@kamo/design-tokens/mascot/kamo-head-blink.webp'
import headHappy from '@kamo/design-tokens/mascot/kamo-head-happy.webp'
import headLookSide from '@kamo/design-tokens/mascot/kamo-head-look-side.webp'
import headLookUp from '@kamo/design-tokens/mascot/kamo-head-look-up.webp'
import headLook from '@kamo/design-tokens/mascot/kamo-head-look.webp'
import headTongue from '@kamo/design-tokens/mascot/kamo-head-tongue.webp'
import headWink from '@kamo/design-tokens/mascot/kamo-head-wink.webp'
import icon from '@kamo/design-tokens/mascot/kamo-icon.webp'
import scene from '@kamo/design-tokens/mascot/kamo-scene.webp'
import side from '@kamo/design-tokens/mascot/kamo-side.webp'

const POSES = {
  front,
  side,
  back,
  scene,
  /** The app icon: the head framed in a rounded square, made to read at small sizes. */
  icon,
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
  /**
   * Sits Kamo on a disc of the paper it was cut from, like the hero circle on the site. Use it
   * for the big poses: it also hides any trace of the original paper on dark backgrounds.
   */
  backdrop?: boolean
  className?: string
}

/**
 * Kamo, the chameleon (DESIGN.md → Mascot). Decorative: it never carries information, so it
 * is hidden from assistive tech. Never inside the exported video or the editor chrome.
 */
export function Mascot({ pose, size, flip, backdrop, className }: MascotProps) {
  if (backdrop) {
    return (
      <div
        aria-hidden
        className={`flex items-end justify-center rounded-full bg-[#F3EEE6] ${className ?? ''}`}
        style={{ width: size * 1.15, height: size * 1.15 }}
      >
        <Mascot pose={pose} size={size * 0.92} {...(flip ? { flip } : {})} />
      </div>
    )
  }
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
