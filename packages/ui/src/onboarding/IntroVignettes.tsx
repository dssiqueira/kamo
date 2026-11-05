// Little drawings for the welcome tour (intro.ts): a mini Kamo on a mini screen, drawn with CSS
// and inline SVG (no image files). Decorative: the slide's text says everything, so they are
// hidden from assistive tech. They move with the Kamo spring and stand still for reduced motion.
import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '../i18n.tsx'
import { useSpringTo } from '../motion/useSpring.ts'
import type { IntroSlide } from './intro.ts'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Counts up every `ms` (the beat of a vignette); stays at `still` for reduced motion. */
function useBeat(ms: number, still: number): number {
  const [reduced] = useState(prefersReducedMotion)
  const [beat, setBeat] = useState(reduced ? still : 0)
  useEffect(() => {
    if (reduced) return
    const timer = window.setInterval(() => setBeat((b) => b + 1), ms)
    return () => window.clearInterval(timer)
  }, [ms, reduced])
  return beat
}

export function IntroVignette({ slide }: { slide: IntroSlide }) {
  if (slide === 'record') return <RecordVignette />
  if (slide === 'click') return <ClickVignette />
  return <EditVignette />
}

/** A small app window: title bar with three dots and a content area. */
function MiniWindow({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="relative h-[156px] w-full overflow-hidden rounded-md border border-border bg-background"
    >
      <div className="flex h-[18px] items-center gap-[4px] border-b border-border bg-surface-raised px-[8px]">
        <span className="h-[6px] w-[6px] rounded-full bg-border" />
        <span className="h-[6px] w-[6px] rounded-full bg-border" />
        <span className="h-[6px] w-[6px] rounded-full bg-border" />
      </div>
      <div className="relative h-[calc(100%-18px)] overflow-hidden">{children}</div>
    </div>
  )
}

function Glyph({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const SOURCE_GLYPHS = [
  // Screen
  <>
    <rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1.25" />
    <path d="M8 11v2.5M5.25 13.5h5.5" />
  </>,
  // Window
  <>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.25" />
    <path d="M1.75 5.75h12.5" />
  </>,
  // Selection
  <>
    <path d="M6 3h4M6 13h4M3 6v4M13 6v4" strokeDasharray="1.5 1.5" />
    <rect x="1.75" y="1.75" width="2.5" height="2.5" rx="0.5" />
    <rect x="11.75" y="1.75" width="2.5" height="2.5" rx="0.5" />
    <rect x="1.75" y="11.75" width="2.5" height="2.5" rx="0.5" />
    <rect x="11.75" y="11.75" width="2.5" height="2.5" rx="0.5" />
  </>,
]

const TOGGLE_GLYPHS = [
  // Microphone
  <>
    <rect x="5.5" y="1.75" width="5" height="8" rx="2.5" />
    <path d="M3.25 7.5a4.75 4.75 0 0 0 9.5 0M8 12.25v2" />
  </>,
  // Computer sound
  <>
    <path d="M2.5 6h2.25L8 3.25v9.5L4.75 10H2.5z" />
    <path d="M10.5 5.75a3 3 0 0 1 0 4.5M12.25 4a5.5 5.5 0 0 1 0 8" />
  </>,
  // Camera
  <>
    <rect x="1.75" y="4" width="9" height="8" rx="1.5" />
    <path d="M10.75 7l3.5-2v6l-3.5-2" />
  </>,
]

/** Slide 1: pick screen, window or selection; the optional toggles; Record. */
function RecordVignette() {
  const t = useT()
  const beat = useBeat(1600, 0)
  const source = beat % 3
  // The highlight glides between the three tiles (each tile is a third, minus the gaps).
  const x = useSpringTo(source)
  // The camera is the optional one: it flips on and off every other beat.
  const camera = useSpringTo(beat % 2)

  return (
    <MiniWindow>
      <div className="flex h-full flex-col justify-center gap-[12px] px-[18px]">
        <div className="relative grid grid-cols-3 gap-[8px]">
          <div
            className="absolute inset-y-0 rounded-md border-2 border-tertiary bg-tertiary-container"
            style={{
              width: 'calc((100% - 16px) / 3)',
              transform: `translateX(calc(${x} * (100% + 8px)))`,
            }}
          />
          {SOURCE_GLYPHS.map((glyph, i) => (
            <div
              key={i}
              className={`relative flex h-[44px] items-center justify-center rounded-md border border-border ${
                i === source ? 'text-tertiary-strong' : 'text-on-surface-muted'
              }`}
            >
              <Glyph size={20}>{glyph}</Glyph>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-sm">
          <div className="flex items-center gap-[6px]">
            {TOGGLE_GLYPHS.map((glyph, i) => {
              const on = i === 2 ? camera : 1
              return (
                <div
                  key={i}
                  className="flex items-center gap-[5px] rounded-full border border-border bg-surface px-[7px] py-[4px] text-on-surface-muted"
                >
                  <Glyph size={13}>{glyph}</Glyph>
                  <span className="relative h-[10px] w-[18px] rounded-full bg-border">
                    <span
                      className="absolute inset-0 rounded-full bg-primary"
                      style={{ opacity: Math.min(1, Math.max(0, on)) }}
                    />
                    <span
                      className="absolute top-[1px] h-[8px] w-[8px] rounded-full bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
                      style={{ insetInlineStart: `${1 + on * 8}px` }}
                    />
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex shrink-0 items-center gap-[6px] rounded-full bg-primary px-[12px] py-[5px] text-label font-semibold text-on-primary">
            <span className="kamo-motion h-[7px] w-[7px] animate-[kamo-rec-pulse_1.2s_ease-in-out_infinite_alternate] rounded-full bg-recording" />
            {t('home.record')}
          </div>
        </div>
      </div>
    </MiniWindow>
  )
}

/** Where the button sits in the mini app (percent of the content area). */
const TARGET = { x: 71, y: 64 }
const CURSOR_START = { x: 30, y: 30 }
const ZOOM = 0.55

/**
 * Slide 2: the cursor glides to a button, Kamo's tongue-pink ring hits the spot and the screen
 * zooms in right there, then back out. Beats: glide → click and zoom → zoom out.
 */
function ClickVignette() {
  // Reduced motion rests on the zoomed-in frame.
  const beat = useBeat(1300, 1)
  const phase = beat % 3
  const glide = useSpringTo(phase === 2 ? 0 : 1)
  const zoom = useSpringTo(phase === 1 ? 1 : 0)
  const hit = useSpringTo(phase === 1 ? 1 : 0)
  const scale = 1 + ZOOM * zoom

  // The cursor is drawn over the zoomed content, at the spot it points to after the zoom.
  const px = CURSOR_START.x + (TARGET.x - CURSOR_START.x) * glide
  const py = CURSOR_START.y + (TARGET.y - CURSOR_START.y) * glide
  const cx = TARGET.x + (px - TARGET.x) * scale
  const cy = TARGET.y + (py - TARGET.y) * scale
  const ring = phase === 1 ? Math.min(1, Math.max(0, hit)) : 0

  return (
    <MiniWindow>
      <div
        className="absolute inset-0"
        style={{ transform: `scale(${scale})`, transformOrigin: `${TARGET.x}% ${TARGET.y}%` }}
      >
        {/* A pretend app: sidebar, heading, two cards and the button that gets clicked. */}
        <div className="absolute inset-y-[10px] start-[10px] flex w-[22%] flex-col gap-[6px] rounded-sm bg-surface-raised p-[8px]">
          <span className="h-[5px] w-[70%] rounded-full bg-border" />
          <span className="h-[5px] w-[85%] rounded-full bg-border" />
          <span className="h-[5px] w-[60%] rounded-full bg-border" />
          <span className="h-[5px] w-[75%] rounded-full bg-border" />
        </div>
        <div className="absolute end-[10px] start-[calc(22%+20px)] top-[10px] flex flex-col gap-[8px]">
          <span className="h-[8px] w-[45%] rounded-full bg-on-surface-muted opacity-40" />
          <div className="flex gap-[8px]">
            <span className="flex h-[34px] flex-1 flex-col justify-center gap-[5px] rounded-sm border border-border bg-surface px-[8px]">
              <span className="h-[4px] w-[60%] rounded-full bg-border" />
              <span className="h-[4px] w-[40%] rounded-full bg-border" />
            </span>
            <span className="flex h-[34px] flex-1 flex-col justify-center gap-[5px] rounded-sm border border-border bg-surface px-[8px]">
              <span className="h-[4px] w-[50%] rounded-full bg-border" />
              <span className="h-[4px] w-[70%] rounded-full bg-border" />
            </span>
          </div>
        </div>
        {/* A field next to the button, so the zoomed-in frame still reads as an app. */}
        <span
          className="absolute flex h-[16px] -translate-y-1/2 items-center rounded-[4px] border border-border bg-surface px-[5px]"
          style={{ left: 'calc(22% + 20px)', width: '28%', top: `${TARGET.y}%` }}
        >
          <span className="h-[4px] w-[55%] rounded-full bg-border" />
        </span>
        <span
          className="absolute h-[16px] w-[50px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${TARGET.x}%`, top: `${TARGET.y}%` }}
        />
      </div>
      {/* The hit: a tongue-pink dot and ring right where the click landed. */}
      <span
        className="absolute h-[34px] w-[34px] rounded-full border-2 border-secondary"
        style={{
          left: `${TARGET.x}%`,
          top: `${TARGET.y}%`,
          opacity: (1 - ring) * (phase === 1 ? 1 : 0),
          transform: `translate(-50%, -50%) scale(${0.4 + ring * 1.4})`,
        }}
      />
      <span
        className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary"
        style={{ left: `${TARGET.x}%`, top: `${TARGET.y}%`, opacity: phase === 1 ? 1 : 0 }}
      />
      {/* The smoothed cursor. */}
      <svg
        width="16"
        height="20"
        viewBox="0 0 16 20"
        className="absolute drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${cx}%`, top: `${cy}%`, marginLeft: -2, marginTop: -1 }}
      >
        <path
          d="M2 1.5v14.2l3.6-3.3 2.5 5.6 2.6-1.1-2.5-5.5h5z"
          fill="#2B2A26"
          stroke="#FFFFFF"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    </MiniWindow>
  )
}

const FORMATS = [
  { w: 96, h: 54 },
  { w: 54, h: 54 },
  { w: 31, h: 54 },
]
/** Where the playhead hops: the start, each zoom block and the end. */
const PLAYHEAD_STOPS = [6, 27, 68, 94]

/** Slide 3: three formats over a mini timeline with pink zoom blocks and captions. */
function EditVignette() {
  const beat = useBeat(1500, 1)
  const format = beat % 3
  const playhead = useSpringTo(PLAYHEAD_STOPS[beat % PLAYHEAD_STOPS.length] ?? 0)

  return (
    <MiniWindow>
      <div className="flex h-full flex-col justify-between px-[16px] pb-[10px] pt-[10px]">
        <div className="flex items-end justify-center gap-[14px]">
          {FORMATS.map((size, i) => (
            <FormatFrame key={i} width={size.w} height={size.h} selected={i === format} />
          ))}
        </div>
        <div className="relative flex flex-col gap-[4px] rounded-sm bg-surface-raised px-[8px] py-[6px]">
          {/* Video, with its trim handles. */}
          <div className="relative h-[12px] rounded-[3px] bg-primary-container">
            <span className="absolute inset-y-0 start-0 w-[4px] rounded-s-[3px] bg-primary" />
            <span className="absolute inset-y-0 end-0 w-[4px] rounded-e-[3px] bg-primary" />
          </div>
          {/* Zooms: tongue pink, where Kamo struck. */}
          <div className="relative h-[10px]">
            <span className="absolute inset-y-0 start-[18%] w-[19%] rounded-[3px] bg-secondary" />
            <span className="absolute inset-y-0 start-[58%] w-[22%] rounded-[3px] bg-secondary" />
          </div>
          {/* Captions. */}
          <div className="relative h-[7px]">
            <span className="absolute inset-y-0 start-[4%] w-[16%] rounded-full bg-tertiary-container" />
            <span className="absolute inset-y-0 start-[24%] w-[22%] rounded-full bg-tertiary-container" />
            <span className="absolute inset-y-0 start-[52%] w-[14%] rounded-full bg-tertiary-container" />
            <span className="absolute inset-y-0 start-[70%] w-[20%] rounded-full bg-tertiary-container" />
          </div>
          <span
            className="absolute inset-y-[2px] w-[2px] -translate-x-1/2 rounded-full bg-tertiary"
            style={{ left: `calc(8px + (100% - 16px) * ${playhead / 100})` }}
          />
        </div>
      </div>
    </MiniWindow>
  )
}

function FormatFrame({
  width,
  height,
  selected,
}: {
  width: number
  height: number
  selected: boolean
}) {
  const on = useSpringTo(selected ? 1 : 0)
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-[5px] bg-primary-container"
      style={{
        width,
        height,
        transform: `translateY(${-3 * on}px)`,
        boxShadow: `0 0 0 ${2 * Math.max(0, on)}px var(--color-tertiary)`,
      }}
    >
      {/* The recording inside the frame, with Kamo's padding and corners. */}
      <span className="h-[56%] w-[70%] rounded-[3px] bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)]" />
    </div>
  )
}
