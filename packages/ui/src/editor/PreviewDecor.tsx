import { DecorPiece } from '../decor/Decor.tsx'

/**
 * Quiet paper-cut leaves in the corners of the preview area (DESIGN.md → Mascot), so the
 * editor shares the look of the rest screens without competing with the video.
 *
 * It sits on the lowest layer of the preview area: the canvas covers it, so a piece only shows
 * in the empty margins around the video, as if tucked behind it. It is UI, never part of the
 * scene, so it never reaches the rendered or exported video. The parent must be `relative
 * isolate`, so `-z-10` keeps it above the page background and below the canvas.
 */
export function PreviewDecor() {
  return (
    <div
      aria-hidden
      data-testid="preview-decor"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-50"
    >
      <DecorPiece
        art="leavesCorner"
        height={150}
        className="absolute -bottom-[8px] -start-[12px]"
      />
      <DecorPiece
        art="sprig"
        height={120}
        className="absolute -top-[10px] start-[6px] rotate-[200deg]"
      />
      <DecorPiece
        art="leavesCorner"
        height={130}
        flip
        className="absolute -bottom-[8px] -end-[12px]"
      />
      <DecorPiece art="flower" height={60} flip className="absolute bottom-[14px] end-[70px]" />
    </div>
  )
}
