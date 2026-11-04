import { useRef, type PointerEvent } from 'react'

export interface DragOptions {
  /** Called on press; return false to ignore this pointer. */
  onDown?(event: PointerEvent<HTMLElement>): boolean | void
  /** The pointer moved past the threshold: the gesture begins (open the undo transaction). */
  onStart?(): void
  /** Horizontal distance from the press, in px. */
  onMove(dxPx: number, event: PointerEvent<HTMLElement>): void
  /** Released or canceled; `moved` says whether `onStart` ran. */
  onEnd?(moved: boolean): void
  /** px before a press becomes a drag (default 3; 0 starts on press) */
  thresholdPx?: number
}

/**
 * Horizontal pointer drag with pointer capture: the element keeps receiving the events
 * even when the pointer leaves it (or the window). Spread the result on the element.
 */
export function useDrag(options: DragOptions) {
  const latest = useRef(options)
  latest.current = options
  const drag = useRef<{ id: number; x0: number; moved: boolean } | null>(null)

  const finish = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    latest.current.onEnd?.(current.moved)
  }

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || drag.current) return
      if (latest.current.onDown?.(event) === false) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { id: event.pointerId, x0: event.clientX, moved: false }
      if ((latest.current.thresholdPx ?? 3) <= 0) {
        drag.current.moved = true
        latest.current.onStart?.()
        latest.current.onMove(0, event)
      }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = drag.current
      if (!current || current.id !== event.pointerId) return
      const dx = event.clientX - current.x0
      if (!current.moved) {
        if (Math.abs(dx) < (latest.current.thresholdPx ?? 3)) return
        current.moved = true
        latest.current.onStart?.()
      }
      latest.current.onMove(dx, event)
    },
    onPointerUp: finish,
    onPointerCancel: finish,
  }
}
