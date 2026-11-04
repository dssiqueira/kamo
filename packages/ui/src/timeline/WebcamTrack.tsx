import { MIN_WEBCAM_HIDDEN_MS, webcamGapAt, type ZoomEdge } from '@kamo/core'
import { formatTimecode } from '@kamo/i18n'
import { useId, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { useT } from '../i18n.tsx'
import { nudgeMs, snapToFrame, type TimeScale } from './scale.ts'
import { useDrag } from './useDrag.ts'

export interface HiddenRange {
  startMs: number
  endMs: number
}

/** The webcam-lane callbacks of `<Timeline>` (see TimelineProps.webcam). */
export interface WebcamTrackActions {
  onSelectHidden(index: number | null): void
  /** drag deltas are measured from the start of the gesture, like the zoom blocks */
  onMoveHidden(index: number, deltaMs: number): void
  onResizeHidden(index: number, edge: ZoomEdge, deltaMs: number): void
  onDeleteHidden(index: number): void
  /** double-click on the lane, or the header button (at the playhead) */
  onAddHidden(tMs: number): void
  onTransactionStart(): void
  onTransactionEnd(): void
}

export interface WebcamTrackProps {
  scale: TimeScale
  fps: number
  hidden: readonly HiddenRange[]
  trim: { startMs: number; endMs: number }
  /** the bubble is off for the whole video (side panel) */
  off: boolean
  selectedIndex: number | null
  actions: WebcamTrackActions
}

/**
 * Webcam lane (A-03): a water bar where the bubble shows, with the stretches where it is
 * hidden as dashed blocks. Blocks move by the middle, stretch by the edges and go away with
 * Delete/Backspace, like the zoom blocks, but never pink (pink is only for zooms).
 */
export function WebcamTrack({
  scale,
  fps,
  hidden,
  trim,
  off,
  selectedIndex,
  actions,
}: WebcamTrackProps) {
  const t = useT()
  const hintId = useId()

  const onLaneClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    actions.onSelectHidden(null)
  }
  const onLaneDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left
    const tMs = snapToFrame(scale.toMs(x), fps)
    const gap = webcamGapAt(hidden, trim, scale.durationMs, tMs)
    if (gap && gap.endMs - gap.startMs >= MIN_WEBCAM_HIDDEN_MS) actions.onAddHidden(tMs)
  }

  return (
    <div
      className="relative h-[28px]"
      data-testid="webcam-lane"
      onClick={onLaneClick}
      onDoubleClick={onLaneDoubleClick}
    >
      <span id={hintId} hidden>
        {t('editor.webcam.hiddenHint')}
      </span>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-tertiary-container transition-opacity duration-[120ms] ${
          off ? 'opacity-40' : ''
        }`}
      />
      {hidden.map((range, index) =>
        range.endMs > trim.startMs && range.startMs < trim.endMs ? (
          <HiddenBlock
            key={index}
            index={index}
            range={range}
            scale={scale}
            fps={fps}
            hintId={hintId}
            selected={index === selectedIndex}
            actions={actions}
          />
        ) : null,
      )}
    </div>
  )
}

interface HiddenBlockProps {
  index: number
  range: HiddenRange
  scale: TimeScale
  fps: number
  hintId: string
  selected: boolean
  actions: WebcamTrackActions
}

function HiddenBlock({ index, range, scale, fps, hintId, selected, actions }: HiddenBlockProps) {
  const t = useT()
  const mode = useRef<'move' | ZoomEdge>('move')

  const drag = useDrag({
    onDown(event) {
      const edge = event.target instanceof HTMLElement ? event.target.dataset.edge : undefined
      mode.current = edge === 'start' || edge === 'end' ? edge : 'move'
      actions.onSelectHidden(index)
    },
    onStart: () => actions.onTransactionStart(),
    onMove(dxPx) {
      const deltaMs = snapToFrame(scale.deltaToMs(dxPx), fps)
      if (mode.current === 'move') actions.onMoveHidden(index, deltaMs)
      else actions.onResizeHidden(index, mode.current, deltaMs)
    },
    onEnd(moved) {
      if (moved) actions.onTransactionEnd()
    },
  })

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      actions.onDeleteHidden(index)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      actions.onSelectHidden(null)
      return
    }
    const nudge = nudgeMs(event.key, event.shiftKey, fps)
    if (nudge === null) return
    event.preventDefault()
    actions.onSelectHidden(index)
    actions.onTransactionStart()
    actions.onMoveHidden(index, nudge)
    actions.onTransactionEnd()
  }

  const left = scale.toPx(range.startMs)
  const width = Math.max(scale.toPx(range.endMs) - left, 4)
  const edgeWidth = Math.min(8, width / 4)

  return (
    <button
      type="button"
      data-testid="webcam-hidden"
      aria-label={t('editor.webcam.hiddenBlock', {
        start: formatTimecode(range.startMs, fps),
        end: formatTimecode(range.endMs, fps),
      })}
      aria-describedby={hintId}
      aria-pressed={selected}
      onClick={() => actions.onSelectHidden(index)}
      onKeyDown={onKeyDown}
      {...drag}
      className={`absolute top-[2px] flex h-[24px] cursor-grab touch-none items-center justify-center overflow-hidden rounded-sm border border-dashed bg-surface-raised text-label whitespace-nowrap text-on-surface-muted select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary active:cursor-grabbing ${
        selected ? 'border-tertiary text-on-surface' : 'border-on-surface-muted'
      }`}
      style={{ insetInlineStart: left, width }}
    >
      <span
        aria-hidden
        data-edge="start"
        className="absolute inset-y-0 start-0 cursor-ew-resize"
        style={{ width: edgeWidth }}
      />
      <span className="pointer-events-none px-xs">{t('editor.webcam.hidden')}</span>
      <span
        aria-hidden
        data-edge="end"
        className="absolute inset-y-0 end-0 cursor-ew-resize"
        style={{ width: edgeWidth }}
      />
    </button>
  )
}
