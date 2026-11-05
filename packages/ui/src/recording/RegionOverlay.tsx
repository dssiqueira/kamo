import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useT } from '../i18n.tsx'

/** A rectangle in page pixels (CSS px), which is DIP (points on Mac) of the covered display. */
export interface OverlayRect {
  x: number
  y: number
  width: number
  height: number
}

export interface RegionOverlayProps {
  /** Pixels of the recording per CSS pixel (the display's scale factor). */
  scaleFactor: number
  /** Smallest region, in pixels of the recording (A-08: 320×240). */
  minPixels: { width: number; height: number }
  /** The dragged rectangle, or null when cancelled (Esc). */
  onDone(rect: OverlayRect | null): void
}

interface Drag {
  startX: number
  startY: number
  x: number
  y: number
}

function rectOf(drag: Drag): OverlayRect {
  return {
    x: Math.min(drag.startX, drag.x),
    y: Math.min(drag.startY, drag.y),
    width: Math.abs(drag.x - drag.startX),
    height: Math.abs(drag.y - drag.startY),
  }
}

/**
 * A-08 region overlay (flows.md → Home): covers one display, the user drags a rectangle, the
 * size shows in pixels of the recording while dragging. Esc cancels; it is a key of this
 * focused window only, never a global listener (rule 2). A rectangle under 320×240 is refused
 * and the user drags again.
 */
export function RegionOverlay({ scaleFactor, minPixels, onDone }: RegionOverlayProps) {
  const t = useT()
  const [drag, setDrag] = useState<Drag | null>(null)
  const [tooSmall, setTooSmall] = useState(false)
  const done = useRef(false)
  const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1

  const finish = (rect: OverlayRect | null) => {
    if (done.current) return
    done.current = true
    onDone(rect)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (done.current) return
        done.current = true
        onDone(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  const rect = drag && rectOf(drag)
  const pixels = rect && {
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
  }
  const big =
    pixels !== null && pixels.width >= minPixels.width && pixels.height >= minPixels.height

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setTooSmall(false)
    setDrag({ startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY })
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    setDrag({ ...drag, x: event.clientX, y: event.clientY })
  }
  const onPointerUp = () => {
    if (!drag || !rect) return
    setDrag(null)
    if (big) finish(rect)
    else setTooSmall(true)
  }

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(event) => {
        event.preventDefault()
        finish(null)
      }}
    >
      {rect ? (
        <div
          className={`absolute border-2 ${big ? 'border-tertiary' : 'border-error'}`}
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            // everything outside the rectangle is dimmed
            boxShadow: '0 0 0 100000px rgb(0 0 0 / 0.45)',
          }}
        >
          {pixels && (
            <span className="absolute -top-[30px] start-0 rounded-md bg-surface px-sm py-[2px] font-mono text-label whitespace-nowrap text-on-surface">
              {t('home.displaySize', pixels)}
            </span>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 bg-[rgb(0_0_0/0.45)]" />
      )}
      {!drag && (
        <div className="pointer-events-none absolute inset-x-0 top-[40%] flex justify-center">
          <p
            role="status"
            className="max-w-[480px] rounded-lg bg-surface px-md py-sm text-center text-body text-on-surface shadow-[0_8px_24px_rgb(0_0_0/0.18)]"
          >
            {tooSmall ? t('home.capture.regionTooSmall', minPixels) : t('home.capture.regionHint')}
          </p>
        </div>
      )}
    </div>
  )
}
