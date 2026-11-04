import {
  MAX_ZOOM_SCALE,
  MIN_ZOOM_MS,
  MIN_ZOOM_SCALE,
  ZOOM_SCALE_STEP,
  zoomGapAt,
  zoomsInTrim,
  type Zoom,
  type ZoomEdge,
} from '@kamo/core'
import { formatNumber, formatTimecode, isLocale, SOURCE_LOCALE } from '@kamo/i18n'
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { useSpring } from '../motion/useSpring.ts'
import { MinusIcon, PlusIcon } from './icons.tsx'
import { nudgeMs, snapToFrame, type TimeScale } from './scale.ts'
import { useDrag } from './useDrag.ts'

/** The zoom-track callbacks of `<Timeline>` (see TimelineProps). */
export interface ZoomTrackActions {
  onSelectZoom(id: string | null): void
  onMoveZoom(id: string, deltaMs: number): void
  onResizeZoom(id: string, edge: ZoomEdge, deltaMs: number): void
  onScaleZoom(id: string, scale: number): void
  onDeleteZoom(id: string): void
  onCreateZoom(tMs: number): void
  onTransactionStart(): void
  onTransactionEnd(): void
}

export interface ZoomTrackProps {
  scale: TimeScale
  fps: number
  zooms: readonly Zoom[]
  trim: { startMs: number; endMs: number }
  selectedZoomId: string | null
  /** block whose scale popover is open */
  openZoomId: string | null
  onOpenZoom(id: string | null): void
  actions: ZoomTrackActions
}

/** "2.0×" (DESIGN.md zoom-block label), with the decimal separator of the UI language. */
export function useScaleLabel(): (scale: number) => string {
  const t = useT()
  const language = useLocale()
  const locale = isLocale(language) ? language : SOURCE_LOCALE
  return (scale) =>
    t('timeline.zoomScale', {
      scale: formatNumber(locale, scale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
    })
}

/**
 * Zoom track (F-09): pink blocks that move by the middle, stretch by the edges, open the
 * scale control on click and are deleted with Delete/Backspace. Double-clicking an empty
 * stretch creates a block there. Only blocks that overlap the trim are shown (F-16).
 */
export function ZoomTrack({
  scale,
  fps,
  zooms,
  trim,
  selectedZoomId,
  openZoomId,
  onOpenZoom,
  actions,
}: ZoomTrackProps) {
  const t = useT()
  const label = useScaleLabel()
  const hintId = useId()
  const visible = zoomsInTrim(zooms, trim)
  const open = visible.find((zoom) => zoom.id === openZoomId && zoom.id === selectedZoomId)

  // Clicking anywhere outside the open popover and its block closes it.
  const popoverRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || popoverRef.current?.contains(target)) return
      if (target instanceof Element && target.closest(`[data-zoom-id="${CSS.escape(open.id)}"]`)) {
        return
      }
      onOpenZoom(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, onOpenZoom])

  const onLaneClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    onOpenZoom(null)
    actions.onSelectZoom(null)
  }

  const onLaneDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left
    const tMs = snapToFrame(scale.toMs(x), fps)
    const gap = zoomGapAt(zooms, trim, scale.durationMs, tMs)
    if (gap && gap.endMs - gap.startMs >= MIN_ZOOM_MS) actions.onCreateZoom(tMs)
  }

  return (
    <div className="relative h-[36px]" onClick={onLaneClick} onDoubleClick={onLaneDoubleClick}>
      <span id={hintId} hidden>
        {t('timeline.zoomBlockHint')}
      </span>
      {visible.map((zoom) => (
        <ZoomBlock
          key={zoom.id}
          zoom={zoom}
          scale={scale}
          fps={fps}
          label={label(zoom.scale)}
          hintId={hintId}
          selected={zoom.id === selectedZoomId}
          open={zoom === open}
          onToggleOpen={() => onOpenZoom(zoom === open ? null : zoom.id)}
          onClose={() => onOpenZoom(null)}
          actions={actions}
        />
      ))}
      {open && (
        <ScalePopover
          ref={popoverRef}
          zoom={open}
          anchorPx={scale.toPx((open.startMs + open.endMs) / 2)}
          laneWidthPx={scale.widthPx}
          label={label(open.scale)}
          onScale={(next) => actions.onScaleZoom(open.id, next)}
          onClose={() => onOpenZoom(null)}
        />
      )}
    </div>
  )
}

interface ZoomBlockProps {
  zoom: Zoom
  scale: TimeScale
  fps: number
  label: string
  hintId: string
  selected: boolean
  open: boolean
  onToggleOpen(): void
  onClose(): void
  actions: ZoomTrackActions
}

function ZoomBlock({
  zoom,
  scale,
  fps,
  label,
  hintId,
  selected,
  open,
  onToggleOpen,
  onClose,
  actions,
}: ZoomBlockProps) {
  const t = useT()
  const mode = useRef<'move' | ZoomEdge>('move')
  const suppressClick = useRef(false)

  const drag = useDrag({
    onDown(event) {
      suppressClick.current = false
      const edge = event.target instanceof HTMLElement ? event.target.dataset.edge : undefined
      mode.current = edge === 'start' || edge === 'end' ? edge : 'move'
      actions.onSelectZoom(zoom.id)
    },
    onStart: () => actions.onTransactionStart(),
    onMove(dxPx) {
      // Deltas are measured from the press, so clamping never accumulates.
      const deltaMs = snapToFrame(scale.deltaToMs(dxPx), fps)
      if (mode.current === 'move') actions.onMoveZoom(zoom.id, deltaMs)
      else actions.onResizeZoom(zoom.id, mode.current, deltaMs)
    },
    onEnd(moved) {
      if (!moved) return
      suppressClick.current = true
      actions.onTransactionEnd()
    },
  })

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    actions.onSelectZoom(zoom.id)
    onToggleOpen()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      onClose()
      actions.onDeleteZoom(zoom.id)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (open) onClose()
      else actions.onSelectZoom(null)
      return
    }
    const nudge = nudgeMs(event.key, event.shiftKey, fps)
    if (nudge === null) return
    event.preventDefault()
    actions.onSelectZoom(zoom.id)
    actions.onTransactionStart()
    actions.onMoveZoom(zoom.id, nudge)
    actions.onTransactionEnd()
  }

  const left = scale.toPx(zoom.startMs)
  const width = Math.max(scale.toPx(zoom.endMs) - left, 4)
  const edgeWidth = Math.min(8, width / 4)

  return (
    <button
      type="button"
      data-zoom-id={zoom.id}
      aria-label={t('timeline.zoomBlock', {
        scale: label,
        start: formatTimecode(zoom.startMs, fps),
        end: formatTimecode(zoom.endMs, fps),
      })}
      aria-describedby={hintId}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
      onKeyDown={onKeyDown}
      {...drag}
      className={`absolute top-[4px] flex h-[28px] cursor-grab touch-none items-center justify-center overflow-hidden rounded-sm bg-secondary text-label whitespace-nowrap text-on-secondary select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary active:cursor-grabbing ${
        selected ? 'shadow-[inset_0_0_0_2px_var(--color-on-secondary)]' : ''
      }`}
      style={{ insetInlineStart: left, width }}
    >
      <span
        aria-hidden
        data-edge="start"
        className="absolute inset-y-0 start-0 cursor-ew-resize"
        style={{ width: edgeWidth }}
      />
      <span className="pointer-events-none px-xs">{label}</span>
      <span
        aria-hidden
        data-edge="end"
        className="absolute inset-y-0 end-0 cursor-ew-resize"
        style={{ width: edgeWidth }}
      />
    </button>
  )
}

interface ScalePopoverProps {
  ref: Ref<HTMLDivElement>
  zoom: Zoom
  anchorPx: number
  laneWidthPx: number
  label: string
  onScale(scale: number): void
  onClose(): void
}

/** Scale control (F-09): − / value / +, 1.0× to 4.0× in steps of 0.25. */
function ScalePopover({
  ref,
  zoom,
  anchorPx,
  laneWidthPx,
  label,
  onScale,
  onClose,
}: ScalePopoverProps) {
  const t = useT()
  // Spring in (rule 10), restarted for each block.
  const appear = useSpring(1, 0, zoom.id)
  const half = 64
  const center = Math.min(Math.max(anchorPx, half), Math.max(laneWidthPx - half, half))

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('timeline.scale')}
      onKeyDown={onKeyDown}
      className="absolute bottom-[calc(100%+4px)] z-20 flex items-center gap-xs rounded-md border border-border bg-surface p-xs text-on-surface shadow-[0_8px_24px_rgb(0_0_0/0.1)]"
      style={{
        insetInlineStart: center,
        opacity: Math.min(1, Math.max(0, appear)),
        transform: `translateX(-50%) translateY(${(1 - appear) * 4}px) scale(${0.96 + 0.04 * appear})`,
      }}
    >
      <PopoverButton
        label={t('timeline.scaleDown')}
        disabled={zoom.scale <= MIN_ZOOM_SCALE}
        onClick={() => onScale(zoom.scale - ZOOM_SCALE_STEP)}
      >
        <MinusIcon />
      </PopoverButton>
      <output aria-live="polite" className="min-w-[3.5em] text-center text-label tabular-nums">
        {label}
      </output>
      <PopoverButton
        label={t('timeline.scaleUp')}
        disabled={zoom.scale >= MAX_ZOOM_SCALE}
        onClick={() => onScale(zoom.scale + ZOOM_SCALE_STEP)}
      >
        <PlusIcon />
      </PopoverButton>
    </div>
  )
}

function PopoverButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-[28px] items-center justify-center rounded-sm transition-colors duration-[120ms] hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-tertiary disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
