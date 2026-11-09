import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING, Switch } from '../primitives/controls.tsx'
import { ChevronEndIcon, MicIcon, SlidersIcon, SpeakerWavesIcon } from '../primitives/icons.tsx'
import { CameraSource, type CameraSourceProps } from './CameraSource.tsx'
import {
  DevicePicker,
  SOURCE_CARD,
  SourceCardHeader,
  SourceMessageLine,
  type SourceMessage,
} from './SourceCard.tsx'
import { WAVE_BARS, WAVE_FLOOR, stepWave, waveTargets, type WaveBar } from './waveform.ts'

/** One source as Home shows it (F-04). */
export interface AudioSourceView {
  /** The toggle. */
  enabled: boolean
  status: 'off' | 'starting' | 'live' | 'denied' | 'unavailable' | 'unsupported'
  /**
   * Recorded with the video, out of reach of the meters (the Mac computer sound, D-024): no
   * level bar, a note instead.
   */
  noMeter?: boolean
}

/** Live levels, 0 to 1 (see audioLevel.ts). */
export interface AudioLevelsView {
  mic: number
  system: number
}

export interface MicrophoneOption {
  id: string
  /** OS label; empty when the OS gives none. */
  label: string
}

export interface AudioSourcesProps {
  mic: AudioSourceView
  system: AudioSourceView
  onToggleMic(enabled: boolean): void
  onToggleSystem(enabled: boolean): void
  /** Microphones; the picker only shows with more than one (F-04). */
  microphones: readonly MicrophoneOption[]
  /** null: the system default. */
  microphoneId: string | null
  onSelectMicrophone(id: string | null): void
  /**
   * Levels arrive 10 to 15 times a second; only the meters subscribe, so the rest of Home
   * does not re-render with them. Returns unsubscribe.
   */
  subscribeLevels(listener: (levels: AudioLevelsView) => void): () => void
  /**
   * "Audio settings" on the microphone card: noise suppression (on by default). Changing it
   * reopens the microphone. Omitted: no settings row.
   */
  noiseSuppression?: { value: boolean; onChange(on: boolean): void }
  /** Webcam toggle with a live preview (A-03), in the same row. Omitted: no camera card. */
  camera?: CameraSourceProps
}

/**
 * Home's sound and camera cards (F-04, A-03): microphone with a level meter and its settings,
 * computer sound with a waveform, and the camera with its preview. Three in a row, two rows
 * when the window is narrow.
 */
export function AudioSources(props: AudioSourcesProps) {
  const t = useT()
  const titleId = useId()
  const { system } = props

  return (
    <section className="flex flex-col gap-md" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-title">
        {props.camera ? t('home.camera.sectionTitle') : t('home.audio.title')}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-md">
        <MicCard {...props} />
        <SystemCard
          source={system}
          onToggle={props.onToggleSystem}
          subscribeLevels={props.subscribeLevels}
        />
        {props.camera && <CameraSource {...props.camera} />}
      </div>
    </section>
  )
}

function MicCard(props: AudioSourcesProps) {
  const t = useT()
  const { mic } = props
  const live = mic.enabled && mic.status === 'live'
  const label = t('home.audio.microphone')
  return (
    <div className={SOURCE_CARD}>
      <SourceCardHeader
        icon={<MicIcon size={18} />}
        title={label}
        on={mic.enabled}
        onToggle={() => props.onToggleMic(!mic.enabled)}
      />
      {mic.enabled && (
        <DevicePicker
          devices={props.microphones}
          selectedId={props.microphoneId}
          label={t('home.audio.chooseMicrophone')}
          defaultLabel={t('home.audio.defaultMicrophone')}
          nameOf={(index) => t('home.audio.microphoneName', { index })}
          onSelect={props.onSelectMicrophone}
        />
      )}
      {/* In the middle of the room the camera preview gives the row. */}
      <div className="flex flex-1 items-center py-xs">
        <SegmentedMeter
          label={t('home.audio.level', { source: label })}
          live={live}
          subscribeLevels={props.subscribeLevels}
        />
      </div>
      <SourceMessageLine message={micMessage(mic, t)} />
      {props.noiseSuppression && <AudioSettings {...props.noiseSuppression} />}
    </div>
  )
}

function SystemCard({
  source,
  onToggle,
  subscribeLevels,
}: {
  source: AudioSourceView
  onToggle(enabled: boolean): void
  subscribeLevels: AudioSourcesProps['subscribeLevels']
}) {
  const t = useT()
  const unsupported = source.status === 'unsupported'
  const label = t('home.audio.system')
  return (
    <div className={`${SOURCE_CARD} overflow-hidden`}>
      <SoftWave />
      <SourceCardHeader
        icon={<SpeakerWavesIcon size={18} />}
        title={label}
        on={source.enabled && !unsupported}
        disabled={unsupported}
        onToggle={() => onToggle(!source.enabled)}
      />
      {!source.noMeter && !unsupported && (
        <Waveform
          label={t('home.audio.level', { source: label })}
          live={source.enabled && source.status === 'live'}
          subscribeLevels={subscribeLevels}
        />
      )}
      <div className="relative">
        <SourceMessageLine message={systemMessage(source, t)} />
      </div>
    </div>
  )
}

function micMessage(source: AudioSourceView, t: (key: string) => string): SourceMessage {
  if (!source.enabled) return null
  if (source.status === 'denied') return { tone: 'warning', text: t('home.audio.micDenied') }
  if (source.status === 'unavailable') {
    return { tone: 'warning', text: t('home.audio.micUnavailable') }
  }
  return null
}

function systemMessage(source: AudioSourceView, t: (key: string) => string): SourceMessage {
  // Mac before 13: no ScreenCaptureKit audio (D-024).
  if (source.status === 'unsupported') return { tone: 'muted', text: t('home.audio.systemSoon') }
  if (source.enabled && source.noMeter) {
    return { tone: 'muted', text: t('home.audio.systemWithVideo') }
  }
  if (source.enabled && (source.status === 'unavailable' || source.status === 'denied')) {
    return { tone: 'warning', text: t('home.audio.systemUnavailable') }
  }
  return null
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const SEGMENTS = 32

/**
 * The microphone meter: a row of small rounded bars, green up to the live level. Redrawn with
 * every level update (10 to 15 a second); no transition, the data is the motion.
 */
function SegmentedMeter({
  label,
  live,
  subscribeLevels,
}: {
  label: string
  live: boolean
  subscribeLevels: AudioSourcesProps['subscribeLevels']
}) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!live) {
      setLevel(0)
      return
    }
    return subscribeLevels((levels) => setLevel(levels.mic))
  }, [live, subscribeLevels])
  const value = Math.round(Math.min(1, Math.max(0, level)) * 100)
  const lit = Math.round((value / 100) * SEGMENTS)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={`flex h-[14px] w-full items-center gap-[3px] ${live ? '' : 'opacity-60'}`}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={`h-full min-w-0 flex-1 rounded-full ${i < lit ? 'bg-primary-strong' : 'bg-primary-container'}`}
        />
      ))}
    </div>
  )
}

const BAR_PITCH = 10
const BAR_WIDTH = 4.5
const WAVE_HEIGHT = 64
/** Bars after this one are the lighter tail on the right. */
const TAIL_FROM = (WAVE_BARS - 1) / 2 + 4

/**
 * The computer sound as a waveform: bars springing towards heights derived from the live
 * level (waveform.ts). Drawn straight into the SVG, so the level never re-renders React.
 * Calm dots when silent or off; with reduced motion, a still shape.
 */
function Waveform({
  label,
  live,
  subscribeLevels,
}: {
  label: string
  live: boolean
  subscribeLevels: AudioSourcesProps['subscribeLevels']
}) {
  const svg = useRef<SVGSVGElement>(null)
  const meter = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const rects = Array.from(svg.current?.querySelectorAll('rect') ?? [])
    const draw = (heights: readonly number[]) => {
      rects.forEach((rect, i) => {
        const h = Math.max(BAR_WIDTH, (heights[i] ?? WAVE_FLOOR) * WAVE_HEIGHT)
        rect.setAttribute('y', String((WAVE_HEIGHT - h) / 2))
        rect.setAttribute('height', String(h))
      })
    }
    const setValue = (level: number) =>
      meter.current?.setAttribute('aria-valuenow', String(Math.round(level * 100)))

    if (prefersReducedMotion()) {
      draw(waveTargets(live ? 0.55 : 0, 0))
      setValue(0)
      return
    }

    const bars: WaveBar[] = rects.map((rect) => ({
      x: Number(rect.getAttribute('height') ?? 0) / WAVE_HEIGHT,
      v: 0,
    }))
    let targets = waveTargets(0, 0)
    let tick = 0
    let frame = 0
    let last = 0
    const step = (now: number) => {
      const moving = stepWave(bars, targets, last ? (now - last) / 1000 : 1 / 60)
      last = now
      draw(bars.map((bar) => bar.x))
      frame = moving ? requestAnimationFrame(step) : 0
    }
    const retarget = (level: number) => {
      tick++
      targets = waveTargets(level, tick)
      setValue(level)
      if (!frame) {
        last = 0
        frame = requestAnimationFrame(step)
      }
    }
    retarget(0)
    const unsubscribe = live ? subscribeLevels((levels) => retarget(levels.system)) : () => {}
    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
    }
  }, [live, subscribeLevels])

  const floor = Math.max(BAR_WIDTH, WAVE_FLOOR * WAVE_HEIGHT)
  return (
    <div
      ref={meter}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      className={`relative flex flex-1 items-center justify-center py-xs ${live ? '' : 'opacity-60'}`}
    >
      <svg
        ref={svg}
        aria-hidden
        viewBox={`0 0 ${WAVE_BARS * BAR_PITCH} ${WAVE_HEIGHT}`}
        className="h-[64px] w-full max-w-[300px]"
        preserveAspectRatio="xMidYMid meet"
      >
        {Array.from({ length: WAVE_BARS }, (_, i) => (
          <rect
            key={i}
            x={i * BAR_PITCH + (BAR_PITCH - BAR_WIDTH) / 2}
            y={(WAVE_HEIGHT - floor) / 2}
            width={BAR_WIDTH}
            height={floor}
            rx={BAR_WIDTH / 2}
            className={i >= TAIL_FROM ? 'fill-primary-strong opacity-40' : 'fill-primary-strong'}
          />
        ))}
      </svg>
    </div>
  )
}

/** A soft hill along the bottom of the computer sound card: decoration only. */
function SoftWave() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 300 60"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[56px] w-full fill-primary-container opacity-70"
    >
      <path d="M0 38 C 60 20, 110 22, 160 34 S 260 52, 300 26 L 300 60 L 0 60 Z" />
    </svg>
  )
}

/**
 * "Audio settings ›" at the bottom of the microphone card: a small popover with noise
 * suppression. Esc or a click outside closes it; focus goes back to the row.
 */
function AudioSettings({ value, onChange }: NonNullable<AudioSourcesProps['noiseSuppression']>) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('[role="switch"]')?.focus()
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (panel.current?.contains(target) || button.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative mt-auto">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center gap-sm rounded-md bg-surface-raised px-sm py-xs text-start text-body transition-colors duration-[120ms] hover:bg-tertiary-container ${FOCUS_RING}`}
      >
        <span aria-hidden className="shrink-0 text-on-surface-muted">
          <SlidersIcon />
        </span>
        <span id={titleId} className="min-w-0 flex-1 truncate">
          {t('home.audio.settings')}
        </span>
        <span aria-hidden className="shrink-0 text-on-surface-muted rtl:-scale-x-100">
          <ChevronEndIcon />
        </span>
      </button>
      {open && (
        <div
          ref={panel}
          id={panelId}
          role="group"
          aria-labelledby={titleId}
          onBlur={(event) => {
            // Tab out of the popover closes it, like the menus.
            const next = event.relatedTarget as Node | null
            if (next && !panel.current?.contains(next) && !button.current?.contains(next)) {
              setOpen(false)
            }
          }}
          className="absolute inset-x-0 top-full z-30 mt-xs flex min-w-[240px] flex-col gap-xs rounded-lg border border-border bg-surface p-sm shadow-[0_8px_24px_rgba(0,0,0,0.1)]"
        >
          <Switch label={t('home.audio.noiseSuppression')} checked={value} onChange={onChange} />
          <p className="text-label text-on-surface-muted">{t('home.audio.noiseSuppressionHint')}</p>
        </div>
      )}
    </div>
  )
}
