import butterfly from '@kamo/design-tokens/decor/butterfly.svg'
import flower from '@kamo/design-tokens/decor/flower.svg'
import leavesCorner from '@kamo/design-tokens/decor/leaves-corner.svg'
import sprig from '@kamo/design-tokens/decor/sprig.svg'

const ART = { leavesCorner, sprig, flower, butterfly } as const

/** One decorative piece. Decorative only: hidden from assistive tech, never clickable. */
export function DecorPiece({
  art,
  height,
  className,
  flip,
}: {
  art: keyof typeof ART
  height: number
  className?: string
  flip?: boolean
}) {
  return (
    <img
      src={ART[art]}
      alt=""
      aria-hidden
      draggable={false}
      className={`pointer-events-none select-none ${className ?? ''}`}
      style={{ height, width: 'auto', ...(flip ? { transform: 'scaleX(-1)' } : {}) }}
    />
  )
}

/**
 * Paper-cut leaves in the bottom corners, with flowers and a butterfly (DESIGN.md → Mascot).
 * For rest screens only (onboarding, Home, empty states), never the editor or the countdown.
 * The parent must be `relative`; content above it should sit on a higher layer.
 */
export function CornerDecor({
  scale = 1,
  butterfly: withButterfly = true,
}: {
  scale?: number
  butterfly?: boolean
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <DecorPiece
        art="leavesCorner"
        height={220 * scale}
        className="absolute -bottom-[6px] -start-[10px]"
      />
      <DecorPiece
        art="flower"
        height={96 * scale}
        className="absolute bottom-[10px] start-[150px]"
      />
      <DecorPiece
        art="leavesCorner"
        height={250 * scale}
        flip
        className="absolute -bottom-[6px] -end-[10px]"
      />
      <DecorPiece
        art="flower"
        height={110 * scale}
        flip
        className="absolute bottom-[16px] end-[170px]"
      />
      {withButterfly && (
        <DecorPiece art="butterfly" height={56 * scale} className="absolute end-[12%] top-[14%]" />
      )}
    </div>
  )
}
