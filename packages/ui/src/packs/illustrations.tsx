// Small paper-cut scenes for the optional packs (DESIGN.md → Mascot: layered paper, soft
// shadows, pastel fills). Drawn with the theme's color tokens, so they follow light and dark.
// Decorative: hidden from assistive tech; the text next to them says what they mean.
import type { ReactNode } from 'react'

/** The soft drop shadow under each paper piece. */
export const SHADOW = 'fill-[rgb(43_42_38/0.10)]'

export function Art({
  width,
  height,
  size,
  className,
  children,
}: {
  width: number
  height: number
  /** Rendered height in px; the width follows the drawing. */
  size: number
  className?: string | undefined
  children: ReactNode
}) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={`0 0 ${width} ${height}`}
      height={size}
      width={(size * width) / height}
      className={`shrink-0 ${className ?? ''}`}
    >
      {children}
    </svg>
  )
}

/** A paper piece and its shadow, offset down and to the end. */
export function Paper({ d, className }: { d: string; className: string }) {
  return (
    <>
      <path d={d} transform="translate(1.5 2.5)" className={SHADOW} />
      <path d={d} className={className} />
    </>
  )
}

/** Light: a paper plane with a caption trailing behind it (fast transcripts). */
export function LightArt({ size, className }: { size: number; className?: string }) {
  return (
    <Art width={96} height={64} size={size} className={className}>
      <path
        d="M10 40c0-16 14-30 34-30 18 0 42 6 42 24 0 17-19 26-40 26C24 60 10 54 10 40z"
        className="fill-primary-container"
      />
      {/* The trail: a caption line flying off behind the plane. */}
      <g className="stroke-tertiary" strokeLinecap="round" fill="none">
        <path d="M14 42h16" strokeWidth="3" opacity="0.45" />
        <path d="M20 49h22" strokeWidth="3" opacity="0.7" />
        <path d="M30 35h8" strokeWidth="3" opacity="0.3" />
      </g>
      <Paper d="M40 38 80 16 66 52 57 42z" className="fill-surface" />
      <path d="M40 38 80 16 57 42z" className="fill-primary" />
      <path d="M57 42 80 16 60 50z" className="fill-[#8CC285]" />
      <path
        d="M40 38 80 16 66 52 57 42z"
        fill="none"
        strokeLinejoin="round"
        strokeWidth="1.2"
        className="stroke-primary-strong"
        opacity="0.5"
      />
      <circle cx="84" cy="12" r="2" className="fill-secondary" />
      <circle cx="22" cy="20" r="1.5" className="fill-tertiary" opacity="0.6" />
    </Art>
  )
}

/** Accurate: a magnifier over a caption card and its waveform (every word right). */
export function AccurateArt({ size, className }: { size: number; className?: string }) {
  return (
    <Art width={96} height={64} size={size} className={className}>
      <path
        d="M8 36C8 20 22 8 44 8c22 0 44 8 44 26 0 18-20 26-42 26C24 60 8 52 8 36z"
        className="fill-tertiary-container"
      />
      <Paper
        d="M16 18h44a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H16a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5z"
        className="fill-surface"
      />
      {/* The waveform, then the words it became. */}
      <g className="stroke-tertiary" strokeLinecap="round" strokeWidth="2.4">
        <path d="M19 27v4M24 25v8M29 23v12M34 26v6M39 24v10M44 27v4" />
      </g>
      <g className="stroke-on-surface-muted" strokeLinecap="round" strokeWidth="2.4" opacity="0.35">
        <path d="M19 42h18M41 42h12" />
      </g>
      {/* The magnifier, its lens enlarging one word. */}
      <path
        d="M77 49l9 9"
        strokeWidth="6"
        strokeLinecap="round"
        transform="translate(1.5 2.5)"
        className={`${SHADOW} stroke-[rgb(43_42_38/0.10)]`}
      />
      <path
        d="M77 49l9 9"
        strokeWidth="6"
        strokeLinecap="round"
        className="stroke-tertiary-strong"
      />
      <circle cx="68.5" cy="39.5" r="14" transform="translate(1.5 2.5)" className={SHADOW} />
      <circle
        cx="68.5"
        cy="39.5"
        r="14"
        className="fill-primary-container stroke-primary"
        strokeWidth="3.5"
      />
      <path
        d="M61 37.5h15M61 43.5h9"
        strokeLinecap="round"
        strokeWidth="3"
        className="stroke-primary-strong"
      />
      <circle cx="12" cy="14" r="1.8" className="fill-secondary" />
    </Art>
  )
}

/** The pack art by pack: what each one is for, at a glance. */
export function PackArt({
  quality,
  size,
  className,
}: {
  quality: 'light' | 'accurate'
  size: number
  className?: string
}) {
  const Drawing = quality === 'light' ? LightArt : AccurateArt
  return <Drawing size={size} {...(className ? { className } : {})} />
}

/**
 * Sound turning into words: a waveform on a paper card, an arrow, the caption lines. With
 * `moving`, the bars breathe (the `kamo-motion` class stops them for reduced motion).
 */
export function WaveToTextArt({
  size,
  moving = false,
  className,
}: {
  size: number
  moving?: boolean
  className?: string
}) {
  const bars = [6, 12, 18, 10, 15, 8]
  return (
    <Art width={128} height={48} size={size} className={className}>
      <Paper
        d="M6 8h44a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z"
        className="fill-tertiary-container"
      />
      <g className="stroke-tertiary" strokeLinecap="round" strokeWidth="3">
        {bars.map((height, i) => (
          <path
            key={i}
            d={`M${10 + i * 7.2} ${24 - height / 2}v${height}`}
            className={moving ? 'kamo-motion' : undefined}
            style={
              moving
                ? {
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    animation: `kamo-wave 1.1s ${i * 0.12}s infinite alternate cubic-bezier(0.34, 1.56, 0.64, 1)`,
                  }
                : undefined
            }
          />
        ))}
      </g>
      <path
        d="M60 24h12m-4-4.5 4.5 4.5-4.5 4.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
        className="stroke-on-surface-muted"
        opacity="0.6"
      />
      <Paper
        d="M82 8h40a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H82a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z"
        className="fill-primary-container"
      />
      <g className="stroke-primary-strong" strokeLinecap="round" strokeWidth="3">
        <path d="M84 19h26M84 29h16" />
      </g>
      <path d="M104 29h8" strokeLinecap="round" strokeWidth="3" className="stroke-primary" />
    </Art>
  )
}

/** Something not in the box yet (a build without the transcription program): a parcel and a clock. */
export function ParcelArt({ size, className }: { size: number; className?: string }) {
  return (
    <Art width={88} height={80} size={size} className={className}>
      <Paper d="M14 32 44 20l30 12v30L44 74 14 62z" className="fill-primary-container" />
      <path d="M14 32 44 44l30-12L44 20z" className="fill-primary" />
      <path d="M44 44v30L14 62V32z" className="fill-[#8CC285]" opacity="0.55" />
      <path d="M28 26.5 58 38.5v8l-6-2.5v-4L22 28z" className="fill-tertiary-container" />
      <path
        d="M14 32 44 44l30-12M44 44v30"
        fill="none"
        strokeLinejoin="round"
        strokeWidth="1.2"
        className="stroke-primary-strong"
        opacity="0.35"
      />
      <circle cx="70" cy="18" r="13" transform="translate(1.5 2.5)" className={SHADOW} />
      <circle cx="70" cy="18" r="13" className="fill-surface stroke-tertiary" strokeWidth="2.5" />
      <path
        d="M70 11v7.5l5 3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
        className="stroke-tertiary-strong"
      />
      <circle cx="10" cy="20" r="2" className="fill-secondary" />
    </Art>
  )
}

/** Offline: a paper cloud whose plug came out of the socket. */
export function OfflineArt({ size, className }: { size: number; className?: string }) {
  return (
    <Art width={88} height={80} size={size} className={className}>
      <Paper
        d="M24 40a13 13 0 0 1 2-25.8A17 17 0 0 1 58 18a11 11 0 0 1 4 22z"
        className="fill-tertiary-container"
      />
      <path
        d="M31 28h22"
        strokeLinecap="round"
        strokeWidth="3"
        className="stroke-tertiary"
        opacity="0.45"
      />
      {/* The cable and its plug, hanging loose. */}
      <path
        d="M44 40c0 6-6 6-6 12"
        fill="none"
        strokeLinecap="round"
        strokeWidth="2.5"
        className="stroke-on-surface-muted"
      />
      <rect x="33" y="51" width="10" height="7" rx="2" className="fill-primary" />
      <path
        d="M35.5 58v3.5M40.5 58v3.5"
        strokeLinecap="round"
        strokeWidth="2"
        className="stroke-on-surface-muted"
      />
      {/* The socket it came out of, a little apart. */}
      <rect
        x="44"
        y="64"
        width="16"
        height="11"
        rx="3"
        transform="translate(1.5 2.5)"
        className={SHADOW}
      />
      <rect
        x="44"
        y="64"
        width="16"
        height="11"
        rx="3"
        className="fill-surface-raised stroke-border"
        strokeWidth="1.5"
      />
      <path
        d="M49 68.5v2M55 68.5v2"
        strokeLinecap="round"
        strokeWidth="2"
        className="stroke-on-surface-muted"
      />
      <path
        d="M66 56l4-3M67 61h5M63 51l2-4"
        strokeLinecap="round"
        strokeWidth="2"
        className="stroke-tertiary"
        opacity="0.7"
      />
      <circle cx="78" cy="22" r="2" className="fill-secondary" />
      <circle cx="12" cy="56" r="1.6" className="fill-tertiary" opacity="0.6" />
    </Art>
  )
}
