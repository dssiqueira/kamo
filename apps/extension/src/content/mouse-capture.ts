// Mouse capture in the recorded tab (E-02). Injected with `chrome.scripting.executeScript`
// (activeTab, no host permission) into the recorded tab only, once recording has started, and
// removed when it stops. It sends raw mouse samples to the offscreen recorder over a port; the
// recorder turns them into video pixels and recording time (shared/pointer.ts).
//
// Each function is serialized on its own, so it must not use anything from outside its body.
// Rule 2: only mouse listeners, never a key listener. It never reads the page: the only things
// it looks at are the event's coordinates and button, and the viewport's size and zoom.
// It draws nothing either (anything injected would show up in the video).

/** What the content script sends: the event as the page saw it, in CSS pixels. */
export interface RawPointerSample {
  kind: 'move' | 'down' | 'up' | 'scroll' | 'leave'
  /** `Date.now()` when the event arrived */
  at: number
  /** clientX / clientY: CSS px in the layout viewport */
  x: number
  y: number
  /** MouseEvent.button: 0 left, 1 middle, 2 right (down/up only) */
  button?: number
  /** wheel deltas in CSS px (scroll only) */
  dx?: number
  dy?: number
  /** innerWidth / innerHeight: the layout viewport, which is what the tab capture shows */
  vw: number
  vh: number
  /** visualViewport scale and offset (pinch zoom); 1, 0, 0 without one */
  scale: number
  ox: number
  oy: number
}

export function startMouseCapture(portName: string): void {
  type Capture = { stop(): void }
  const scope = globalThis as typeof globalThis & { __kamoMouseCapture?: Capture }
  // Injected again into the same document (e.g. a navigation event raced): one is enough.
  if (scope.__kamoMouseCapture) return
  const MOVE_INTERVAL_MS = 16
  const LINE_PX = 16
  const port = chrome.runtime.connect({ name: portName })
  let lastMoveAt = 0
  let pendingMove: MouseEvent | null = null
  let moveTimer: ReturnType<typeof setTimeout> | null = null

  const send = (kind: RawPointerSample['kind'], event: MouseEvent, extra: object = {}) => {
    const viewport = window.visualViewport
    const sample: RawPointerSample = {
      kind,
      at: Date.now(),
      x: event.clientX,
      y: event.clientY,
      vw: window.innerWidth,
      vh: window.innerHeight,
      scale: viewport?.scale ?? 1,
      ox: viewport?.offsetLeft ?? 0,
      oy: viewport?.offsetTop ?? 0,
      ...extra,
    }
    try {
      port.postMessage(sample)
    } catch {
      stop()
    }
  }

  const flushMove = () => {
    moveTimer = null
    if (!pendingMove) return
    lastMoveAt = Date.now()
    send('move', pendingMove)
    pendingMove = null
  }
  // ~60Hz: the latest position, at most once every 16ms (E-02).
  const onMove = (event: MouseEvent) => {
    pendingMove = event
    const wait = MOVE_INTERVAL_MS - (Date.now() - lastMoveAt)
    if (wait <= 0) flushMove()
    else moveTimer ??= setTimeout(flushMove, wait)
  }
  const onDown = (event: MouseEvent) => {
    flushMove()
    send('down', event, { button: event.button })
  }
  const onUp = (event: MouseEvent) => {
    flushMove()
    send('up', event, { button: event.button })
  }
  const onWheel = (event: WheelEvent) => {
    const unit = event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? window.innerHeight : 1
    send('scroll', event, { dx: event.deltaX * unit, dy: event.deltaY * unit })
  }
  // The pointer left the page (to the browser's toolbar or another window).
  const onOut = (event: MouseEvent) => {
    if (event.relatedTarget === null) send('leave', event)
  }

  const options = { capture: true, passive: true } as const
  window.addEventListener('mousemove', onMove, options)
  window.addEventListener('mousedown', onDown, options)
  window.addEventListener('mouseup', onUp, options)
  window.addEventListener('wheel', onWheel, options)
  window.addEventListener('mouseout', onOut, options)

  function stop(): void {
    window.removeEventListener('mousemove', onMove, options)
    window.removeEventListener('mousedown', onDown, options)
    window.removeEventListener('mouseup', onUp, options)
    window.removeEventListener('wheel', onWheel, options)
    window.removeEventListener('mouseout', onOut, options)
    if (moveTimer !== null) clearTimeout(moveTimer)
    try {
      port.disconnect()
    } catch {
      // already gone
    }
    delete scope.__kamoMouseCapture
  }
  // The recorder went away (stopped, or the offscreen document closed): clean up on our own.
  port.onDisconnect.addListener(stop)
  scope.__kamoMouseCapture = { stop }
}

export function stopMouseCapture(): void {
  const scope = globalThis as typeof globalThis & { __kamoMouseCapture?: { stop(): void } }
  scope.__kamoMouseCapture?.stop()
}
