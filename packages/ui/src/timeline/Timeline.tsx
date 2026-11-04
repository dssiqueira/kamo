import { minTrimmedMs, type Zoom, type ZoomEdge } from '@kamo/core'
import { formatNumber, formatTimecode, isLocale, SOURCE_LOCALE } from '@kamo/i18n'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { EyeOffIcon, PlusIcon, SpeakerIcon } from './icons.tsx'
import { Ruler } from './Ruler.tsx'
import {
  createTimeScale,
  dragTrim,
  nudgeMs,
  snapToFrame,
  type TimeScale,
  type TrimEdge,
} from './scale.ts'
import { useDrag } from './useDrag.ts'
import { WebcamTrack, type HiddenRange, type WebcamTrackActions } from './WebcamTrack.tsx'
import { ZoomTrack } from './ZoomTrack.tsx'

export type AudioTrackId = 'mic' | 'system'

export interface TimelineAudioTrack {
  /** 0–1 */
  volume: number
  muted: boolean
}

/** The webcam lane (A-03): shown only when the project has a webcam. */
export interface TimelineWebcam extends Omit<
  WebcamTrackActions,
  'onTransactionStart' | 'onTransactionEnd'
> {
  /** stretches where the bubble is hidden, sorted */
  hidden: readonly HiddenRange[]
  /** the bubble is off for the whole video */
  off: boolean
  selectedIndex: number | null
}

export interface TimelineProps {
  durationMs: number
  fps: number
  trim: { startMs: number; endMs: number }
  /** all the project's zooms; the ones outside the trim are hidden, not deleted (F-16) */
  zooms: readonly Zoom[]
  playheadMs: number
  selectedZoomId: string | null
  /** audio rows appear only for the tracks that were recorded */
  tracks?: { mic?: TimelineAudioTrack; system?: TimelineAudioTrack }
  /** the webcam lane; missing when the project was recorded without the camera */
  webcam?: TimelineWebcam | undefined
  onScrub(tMs: number): void
  onSelectZoom(id: string | null): void
  /**
   * Drag gestures (move, resize, trim) are wrapped in onTransactionStart/End, and their
   * `deltaMs` is measured from the start of the gesture: apply it to the project as it was
   * at onTransactionStart (`history.base`), never to the previous update. Keyboard nudges
   * are wrapped the same way, one transaction per key press.
   */
  onMoveZoom(id: string, deltaMs: number): void
  onResizeZoom(id: string, edge: ZoomEdge, deltaMs: number): void
  /** new scale, already on the 0.25 grid inside 1.0–4.0 */
  onScaleZoom(id: string, scale: number): void
  onDeleteZoom(id: string): void
  /** double-click on an empty stretch, or the add button (at the playhead) */
  onCreateZoom(tMs: number): void
  /** absolute values, already clamped to the video and to the 1s minimum */
  onTrim(startMs: number, endMs: number): void
  onTrackVolume(track: AudioTrackId, volume: number): void
  onTrackMute(track: AudioTrackId, muted: boolean): void
  onTransactionStart(): void
  onTransactionEnd(): void
}

// Row heights shared by the header column and the lanes, so both stay aligned.
const ROW = {
  ruler: 'h-[24px]',
  video: 'h-[32px]',
  zoom: 'h-[36px]',
  webcam: 'h-[28px]',
  audio: 'h-[28px]',
} as const

/** Room on each side of the lanes so the trim handles at 0 and at the end can be grabbed. */
const LANE_GUTTER = 'mx-[12px]'

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary'

/**
 * Editor timeline (flows.md §5, F-09, F-16): ruler with scrub, video track with trim handles,
 * zoom track, and microphone and computer-sound tracks with volume and mute. Fully controlled:
 * it renders the props and reports every edit through callbacks; the editor applies them
 * with `@kamo/core` edit functions and records them in its undo history.
 *
 * Time flows left to right in every language (it is video notation), so the lanes are LTR.
 */
export function Timeline(props: TimelineProps) {
  const { durationMs, fps, trim, zooms, playheadMs, selectedZoomId, tracks, webcam } = props
  const t = useT()
  const lanesRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(lanesRef)
  const scale = createTimeScale(durationMs, width)
  const [openZoomId, setOpenZoomId] = useState<string | null>(null)

  const audio = (['mic', 'system'] as const).flatMap((id) => {
    const track = tracks?.[id]
    return track ? [{ id, track }] : []
  })

  const canAddAtPlayhead = playheadMs >= trim.startMs && playheadMs <= trim.endMs

  return (
    <section
      aria-label={t('timeline.label')}
      className="flex min-h-[160px] gap-sm border-t border-border bg-surface py-sm font-sans text-on-surface select-none"
    >
      {/* Track headers */}
      <div className="flex w-[12.5rem] shrink-0 flex-col gap-xs ps-md">
        <div className={`${ROW.ruler} flex items-center`}>
          <span className="font-mono text-timecode text-on-surface tabular-nums">
            {formatTimecode(playheadMs, fps)}
          </span>
        </div>
        <TrackHeader className={ROW.video} label={t('timeline.tracks.video')} />
        <TrackHeader className={ROW.zoom} label={t('timeline.tracks.zoom')}>
          <IconButton
            label={t('timeline.addZoom')}
            disabled={!canAddAtPlayhead}
            onClick={() => props.onCreateZoom(snapToFrame(playheadMs, fps))}
          >
            <PlusIcon />
          </IconButton>
        </TrackHeader>
        {webcam && (
          <TrackHeader className={ROW.webcam} label={t('editor.webcam.track')}>
            <IconButton
              label={t('editor.webcam.hideAtPlayhead')}
              disabled={!canAddAtPlayhead}
              onClick={() => webcam.onAddHidden(snapToFrame(playheadMs, fps))}
            >
              <EyeOffIcon />
            </IconButton>
          </TrackHeader>
        )}
        {audio.map(({ id, track }) => (
          <AudioHeader
            key={id}
            id={id}
            track={track}
            onVolume={(volume) => props.onTrackVolume(id, volume)}
            onMute={(muted) => props.onTrackMute(id, muted)}
            onTransactionStart={props.onTransactionStart}
            onTransactionEnd={props.onTransactionEnd}
          />
        ))}
      </div>

      {/* Lanes */}
      <div dir="ltr" className="relative min-w-0 flex-1 pe-sm">
        <div ref={lanesRef} className={`relative flex flex-col gap-xs ${LANE_GUTTER}`}>
          <Ruler scale={scale} fps={fps} playheadMs={playheadMs} onScrub={props.onScrub} />
          <VideoLane
            scale={scale}
            fps={fps}
            trim={trim}
            onTrim={props.onTrim}
            onTransactionStart={props.onTransactionStart}
            onTransactionEnd={props.onTransactionEnd}
          />
          <ZoomTrack
            scale={scale}
            fps={fps}
            zooms={zooms}
            trim={trim}
            selectedZoomId={selectedZoomId}
            openZoomId={openZoomId}
            onOpenZoom={setOpenZoomId}
            actions={props}
          />
          {webcam && (
            <WebcamTrack
              scale={scale}
              fps={fps}
              hidden={webcam.hidden}
              trim={trim}
              off={webcam.off}
              selectedIndex={webcam.selectedIndex}
              actions={{
                ...webcam,
                onTransactionStart: props.onTransactionStart,
                onTransactionEnd: props.onTransactionEnd,
              }}
            />
          )}
          {audio.map(({ id, track }) => (
            <div
              key={id}
              className={`${ROW.audio} flex items-center`}
              aria-hidden
              title={t(`timeline.tracks.${id}`)}
            >
              <div
                className={`h-[16px] w-full rounded-sm bg-tertiary-container transition-opacity duration-[120ms] ${
                  track.muted ? 'opacity-40' : ''
                }`}
              />
            </div>
          ))}

          <TrimShade scale={scale} trim={trim} />
          <Playhead scale={scale} playheadMs={playheadMs} />
        </div>
      </div>
    </section>
  )
}

function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}

function TrackHeader({
  className,
  label,
  children,
}: {
  className: string
  label: string
  children?: ReactNode
}) {
  return (
    <div className={`${className} flex min-w-0 items-center justify-between gap-xs`}>
      <span className="truncate text-label text-on-surface-muted" title={label}>
        {label}
      </span>
      {children}
    </div>
  )
}

function IconButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-[24px] shrink-0 items-center justify-center rounded-sm text-on-surface-muted transition-colors duration-[120ms] hover:bg-surface-raised hover:text-on-surface disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
    >
      {children}
    </button>
  )
}

interface AudioHeaderProps {
  id: AudioTrackId
  track: TimelineAudioTrack
  onVolume(volume: number): void
  onMute(muted: boolean): void
  onTransactionStart(): void
  onTransactionEnd(): void
}

function AudioHeader({
  id,
  track,
  onVolume,
  onMute,
  onTransactionStart,
  onTransactionEnd,
}: AudioHeaderProps) {
  const t = useT()
  const language = useLocale()
  const locale = isLocale(language) ? language : SOURCE_LOCALE
  const name = t(`timeline.tracks.${id}`)
  // A slider drag is one undo step, like any other drag.
  const dragging = useRef(false)
  const start = () => {
    if (dragging.current) return
    dragging.current = true
    onTransactionStart()
  }
  const end = () => {
    if (!dragging.current) return
    dragging.current = false
    onTransactionEnd()
  }

  return (
    <TrackHeader className={ROW.audio} label={name}>
      <div className="flex shrink-0 items-center gap-xs">
        <IconButton
          label={t('timeline.mute', { track: name })}
          pressed={track.muted}
          onClick={() => onMute(!track.muted)}
        >
          <SpeakerIcon muted={track.muted} />
        </IconButton>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={track.volume}
          disabled={track.muted}
          aria-label={t('timeline.volume', { track: name })}
          aria-valuetext={formatNumber(locale, track.volume, { style: 'percent' })}
          onChange={(event) => onVolume(Number(event.currentTarget.value))}
          onPointerDown={start}
          onPointerUp={end}
          onPointerCancel={end}
          onBlur={end}
          className={`w-[64px] accent-tertiary disabled:opacity-40 ${FOCUS_RING}`}
        />
      </div>
    </TrackHeader>
  )
}

interface VideoLaneProps {
  scale: TimeScale
  fps: number
  trim: { startMs: number; endMs: number }
  onTrim(startMs: number, endMs: number): void
  onTransactionStart(): void
  onTransactionEnd(): void
}

/** Video track with the trim handles at both ends (F-16). */
function VideoLane({
  scale,
  fps,
  trim,
  onTrim,
  onTransactionStart,
  onTransactionEnd,
}: VideoLaneProps) {
  const t = useT()
  const [warning, setWarning] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(hideTimer.current), [])

  // F-16: a trim under 1s is prevented with a warning, shown while the limit is being hit.
  const warn = useCallback(() => {
    setWarning(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setWarning(false), 2500)
  }, [])

  const handleProps = {
    scale,
    fps,
    trim,
    onTrim,
    onTransactionStart,
    onTransactionEnd,
    onLimited: warn,
  }

  return (
    <div className={`${ROW.video} relative flex items-center`}>
      <div className="h-[24px] w-full rounded-sm border border-border bg-surface-raised" />
      <TrimHandle edge="start" label={t('timeline.trimStart')} {...handleProps} />
      <TrimHandle edge="end" label={t('timeline.trimEnd')} {...handleProps} />
      <p
        role="status"
        className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center"
      >
        {warning && (
          <span className="rounded-md bg-surface-raised px-sm py-[2px] text-label text-warning shadow-[0_8px_24px_rgb(0_0_0/0.08)]">
            {t('timeline.trimTooShort')}
          </span>
        )}
      </p>
    </div>
  )
}

interface TrimHandleProps extends VideoLaneProps {
  edge: TrimEdge
  label: string
  onLimited(): void
}

function TrimHandle({
  edge,
  label,
  scale,
  fps,
  trim,
  onTrim,
  onTransactionStart,
  onTransactionEnd,
  onLimited,
}: TrimHandleProps) {
  const durationMs = scale.durationMs
  const atStart = useRef(trim)

  const apply = (from: typeof trim, deltaMs: number) => {
    const next = dragTrim(edge, from, durationMs, deltaMs)
    if (next.limited) onLimited()
    if (next.startMs !== trim.startMs || next.endMs !== trim.endMs) {
      onTrim(next.startMs, next.endMs)
    }
  }

  const drag = useDrag({
    onDown() {
      atStart.current = trim
    },
    onStart: onTransactionStart,
    onMove: (dxPx) => apply(atStart.current, snapToFrame(scale.deltaToMs(dxPx), fps)),
    onEnd: (moved) => {
      if (moved) onTransactionEnd()
    },
  })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nudge = nudgeMs(event.key, event.shiftKey, fps)
    let deltaMs: number | null = nudge
    const value = edge === 'start' ? trim.startMs : trim.endMs
    if (event.key === 'Home') deltaMs = -value
    else if (event.key === 'End') deltaMs = durationMs - value
    if (deltaMs === null) return
    event.preventDefault()
    onTransactionStart()
    apply(trim, deltaMs)
    onTransactionEnd()
  }

  const minLength = minTrimmedMs(durationMs)
  const value = edge === 'start' ? trim.startMs : trim.endMs
  const [min, max] =
    edge === 'start' ? [0, trim.endMs - minLength] : [trim.startMs + minLength, durationMs]

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={formatTimecode(value, fps)}
      onKeyDown={onKeyDown}
      {...drag}
      className={`absolute inset-y-0 z-10 flex w-[10px] cursor-ew-resize touch-none items-center justify-center bg-on-surface ${
        edge === 'start' ? '-translate-x-full rounded-s-sm' : 'rounded-e-sm'
      } ${FOCUS_RING}`}
      style={{ insetInlineStart: scale.toPx(value) }}
    >
      <span aria-hidden className="h-[12px] w-[2px] rounded-full bg-surface" />
    </div>
  )
}

/** Dims what the trim cuts out, across the video, zoom, webcam and audio tracks. */
function TrimShade({
  scale,
  trim,
}: {
  scale: TimeScale
  trim: { startMs: number; endMs: number }
}) {
  const start = scale.toPx(trim.startMs)
  const end = scale.toPx(trim.endMs)
  // Below the ruler (24px) and its gap (4px).
  const shade = 'pointer-events-none absolute top-[28px] bottom-0 bg-background/70'
  return (
    <>
      {start > 0 && (
        <div aria-hidden className={shade} style={{ insetInlineStart: 0, width: start }} />
      )}
      {end < scale.widthPx && (
        <div
          aria-hidden
          className={shade}
          style={{ insetInlineStart: end, width: scale.widthPx - end }}
        />
      )}
    </>
  )
}

function Playhead({ scale, playheadMs }: { scale: TimeScale; playheadMs: number }) {
  if (scale.widthPx <= 0) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 z-10 w-[2px] -translate-x-1/2 bg-on-surface"
      style={{ insetInlineStart: scale.toPx(Math.min(Math.max(playheadMs, 0), scale.durationMs)) }}
    >
      <span className="absolute -top-[2px] start-1/2 size-[8px] -translate-x-1/2 rounded-full bg-on-surface" />
    </div>
  )
}
