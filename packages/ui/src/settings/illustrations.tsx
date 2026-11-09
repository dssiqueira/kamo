// Small paper-cut scenes for the Settings section headers, in the same style as the packs art
// (DESIGN.md → Mascot: layered paper, soft shadows, pastel fills). Drawn with the theme's color
// tokens, so they follow light and dark. Decorative: hidden from assistive tech; the headline
// next to each one says what it means.
import { Art, Paper, SHADOW } from '../packs/illustrations.tsx'

interface ArtProps {
  size: number
  className?: string
}

/** Every scene shares one canvas, so the headlines line up section after section. */
const W = 120
const H = 56

/** A rounded rectangle as a path (paper pieces need paths for their shadows). */
function rr(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1-${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1-${r}-${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r}-${r}z`
}

/** A paper disc and its shadow. */
function Disc({ cx, cy, r, className }: { cx: number; cy: number; r: number; className: string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} transform="translate(1.5 2.5)" className={SHADOW} />
      <circle cx={cx} cy={cy} r={r} className={className} />
    </>
  )
}

/** The pink and water confetti every scene has. */
function Dots({ pink, water }: { pink: [number, number]; water: [number, number] }) {
  return (
    <>
      <circle cx={pink[0]} cy={pink[1]} r="2" className="fill-secondary" />
      <circle cx={water[0]} cy={water[1]} r="1.6" className="fill-tertiary" opacity="0.6" />
    </>
  )
}

/** Appearance: a light window and a dark one, a sun and a moon. */
export function ThemeArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <Paper d={rr(14, 6, 52, 38, 6)} className="fill-[#FFFDF8]" />
      <path d="M22 14h14" strokeLinecap="round" strokeWidth="3" className="stroke-[#E6E0D6]" />
      <circle cx="40" cy="29" r="6.5" className="fill-[#F5CF7A]" />
      <path
        d="M40 18.5v2M40 37.5v2M29.5 29h2M48.5 29h2M32.6 21.6l1.4 1.4M46 35l1.4 1.4M47.4 21.6 46 23M34 35l-1.4 1.4"
        strokeLinecap="round"
        strokeWidth="2"
        className="stroke-[#F5CF7A]"
      />
      <Paper d={rr(56, 13, 52, 38, 6)} className="fill-[#2B2A26]" />
      <path d="M64 21h14" strokeLinecap="round" strokeWidth="3" className="stroke-[#4A4842]" />
      <path d="M86 26a8.5 8.5 0 1 0 8 11.5A7 7 0 0 1 86 26z" className="fill-[#ECEAE4]" />
      <circle cx="98" cy="28" r="1.3" className="fill-[#ECEAE4]" opacity="0.7" />
      <circle cx="74" cy="42" r="1.1" className="fill-[#ECEAE4]" opacity="0.5" />
      <Dots pink={[8, 12]} water={[114, 8]} />
    </Art>
  )
}

/** Language: two speech bubbles answering each other. */
export function LanguageArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <Paper
        d="M20 4h40a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H34l-10 9v-9h-4a8 8 0 0 1-8-8V12a8 8 0 0 1 8-8z"
        className="fill-surface"
      />
      <g className="stroke-tertiary" strokeLinecap="round" strokeWidth="3">
        <path d="M22 14h26M22 22h16" />
      </g>
      <Paper
        d="M60 18h40a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8h-4v9l-10-9H60a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8z"
        className="fill-primary-container"
      />
      <g className="stroke-primary-strong" strokeLinecap="round" strokeWidth="3" opacity="0.85">
        <path d="M62 28h30M62 36h18" />
      </g>
      <Dots pink={[112, 10]} water={[8, 46]} />
    </Art>
  )
}

/** Window: the window closes into the tray, where Kamo keeps waiting. */
export function TrayArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <Paper d={rr(10, 4, 58, 40, 6)} className="fill-surface" />
      <path d="M16 4h46a6 6 0 0 1 6 6v3H10v-3a6 6 0 0 1 6-6z" className="fill-surface-raised" />
      <g className="fill-on-surface-muted" opacity="0.5">
        <circle cx="17" cy="8.5" r="1.4" />
        <circle cx="22" cy="8.5" r="1.4" />
        <circle cx="27" cy="8.5" r="1.4" />
      </g>
      <g className="stroke-border" strokeLinecap="round" strokeWidth="3">
        <path d="M18 23h30M18 31h20" />
      </g>
      <path
        d="M70 18c12 0 20 6 22 17"
        fill="none"
        strokeLinecap="round"
        strokeWidth="2.2"
        strokeDasharray="0.5 5"
        className="stroke-tertiary"
      />
      <path
        d="M87.5 32.5 92 37l4.5-4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
        className="stroke-tertiary"
      />
      <Paper d={rr(70, 41, 44, 12, 6)} className="fill-surface" />
      <circle cx="81" cy="47" r="2.6" className="fill-border" />
      <circle cx="92" cy="47" r="3.4" className="fill-primary" />
      <circle cx="103" cy="47" r="2.6" className="fill-border" />
      <Dots pink={[112, 10]} water={[6, 50]} />
    </Art>
  )
}

/** Recording: a 3 in a countdown ring, ticking softly. */
export function CountdownArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <Disc cx={52} cy={28} r={23} className="fill-surface" />
      <circle cx="52" cy="28" r="17" fill="none" strokeWidth="4" className="stroke-border" />
      <circle
        cx="52"
        cy="28"
        r="17"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="71 107"
        transform="rotate(-90 52 28)"
        className="stroke-tertiary"
      />
      <path
        d="M47 20.5h9l-5 6c3.5 0 5.5 2 5.5 4.75S54 36 51 36c-2 0-3.5-.75-4.5-2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.8"
        className="stroke-on-surface"
      />
      <g className="stroke-tertiary" fill="none" strokeLinecap="round" strokeWidth="2.6">
        <path d="M82 21a10 10 0 0 1 0 14" opacity="0.8" />
        <path d="M89 15a18 18 0 0 1 0 26" opacity="0.45" />
      </g>
      <Dots pink={[22, 10]} water={[104, 46]} />
    </Art>
  )
}

/** Folders: a folder with a recording peeking out. */
export function FolderArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <Paper
        d="M24 6h20l6 6h40a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z"
        className="fill-primary"
      />
      <g transform="rotate(-7 58 22)">
        <Paper d={rr(34, 8, 46, 30, 4)} className="fill-surface" />
        <path d="M52 16v12l10-6z" className="fill-tertiary" />
      </g>
      <Paper d={rr(18, 26, 78, 28, 6)} className="fill-[#8CC285]" />
      <path
        d="M28 40h22"
        strokeLinecap="round"
        strokeWidth="3"
        className="stroke-[#F3F9F1]"
        opacity="0.7"
      />
      <Dots pink={[108, 12]} water={[10, 48]} />
    </Art>
  )
}

/** Shortcuts: a modifier key plus the stop key. */
export function KeysArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <Paper d={rr(12, 9, 40, 38, 8)} className="fill-surface" />
      <path d={rr(17, 12, 30, 27, 6)} className="fill-surface-raised" />
      <g className="stroke-on-surface-muted" strokeLinecap="round" strokeWidth="2.6" opacity="0.55">
        <path d="M24 21h16M24 29h9" />
      </g>
      <path
        d="M58 28h8M62 24v8"
        strokeLinecap="round"
        strokeWidth="2.4"
        className="stroke-on-surface-muted"
      />
      <Paper d={rr(72, 9, 40, 38, 8)} className="fill-surface" />
      <path d={rr(77, 12, 30, 27, 6)} className="fill-surface-raised" />
      <path d={rr(86, 19.5, 12, 12, 2.5)} className="fill-recording" />
      <Dots pink={[6, 10]} water={[116, 50]} />
    </Art>
  )
}

/** Permissions: a shield with a check and the mouse pointer it lets Kamo follow. */
export function ShieldArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <Paper
        d="M48 4l21 7.5v14c0 13.5-9.5 21.5-21 26-11.5-4.5-21-12.5-21-26v-14z"
        className="fill-surface"
      />
      <path
        d="M48 9.5l15.5 5.5v10.5c0 10-7 16.5-15.5 20-8.5-3.5-15.5-10-15.5-20V15z"
        className="fill-primary"
      />
      <path
        d="M41 27.5l5 5 9.5-10"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
        className="stroke-on-primary"
      />
      <Paper d="M80 16v25l6.5-6 4.5 10 4.5-2-4.5-10 9-.5z" className="fill-surface" />
      <path
        d="M80 16v25l6.5-6 4.5 10 4.5-2-4.5-10 9-.5z"
        fill="none"
        strokeLinejoin="round"
        strokeWidth="1.6"
        className="stroke-on-surface"
      />
      <Dots pink={[16, 10]} water={[110, 14]} />
    </Art>
  )
}

/** Transcription: a recording that captions itself. */
export function CaptionArt({ size, className }: ArtProps) {
  const bars = [6, 12, 16, 9, 14, 7, 11]
  return (
    <Art width={W} height={H} size={size} className={className}>
      <Paper d={rr(18, 6, 66, 44, 6)} className="fill-surface" />
      <g className="stroke-tertiary" strokeLinecap="round" strokeWidth="3">
        {bars.map((height, i) => (
          <path key={i} d={`M${33 + i * 6} ${21 - height / 2}v${height}`} />
        ))}
      </g>
      <path d={rr(25, 33, 52, 11, 3)} className="fill-on-surface" opacity="0.82" />
      <g className="stroke-surface" strokeLinecap="round" strokeWidth="2.4">
        <path d="M31 38.5h22M58 38.5h12" />
      </g>
      <Disc cx={90} cy={14} r={11} className="fill-primary" />
      <path
        d="M90 7l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"
        strokeLinejoin="round"
        className="fill-on-primary"
      />
      <Dots pink={[10, 44]} water={[110, 36]} />
    </Art>
  )
}

/** Connect to an agent: a recording, a dotted line and an agent's bubble. */
export function AgentArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <Paper d={rr(8, 12, 44, 32, 6)} className="fill-surface" />
      <path d="M25 21v14l11-7z" className="fill-tertiary" />
      <path
        d="M56 28h14"
        strokeLinecap="round"
        strokeWidth="2.4"
        strokeDasharray="0.5 5"
        className="stroke-on-surface-muted"
      />
      <Paper
        d="M80 6h28a7 7 0 0 1 7 7v20a7 7 0 0 1-7 7H94l-9 8v-8h-5a7 7 0 0 1-7-7V13a7 7 0 0 1 7-7z"
        className="fill-tertiary-container"
      />
      <path
        d="M94 13.5l2.6 6.4 6.4 2.6-6.4 2.6-2.6 6.4-2.6-6.4-6.4-2.6 6.4-2.6z"
        className="fill-tertiary-strong"
      />
      <Dots pink={[60, 10]} water={[64, 48]} />
    </Art>
  )
}

/** Updates: two arrows chasing each other around a fresh sparkle. */
export function UpdateArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <Disc cx={60} cy={28} r={23} className="fill-surface" />
      <g
        className="stroke-tertiary"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.2"
      >
        <path d="M45.9 22.9A15 15 0 0 1 67.5 15" />
        <path d="M63 12.5l4.5 2.5-2.5 4.5" />
        <path d="M74.1 33.1A15 15 0 0 1 52.5 41" />
        <path d="M57 43.5 52.5 41l2.5-4.5" />
      </g>
      <path
        d="M60 21l1.9 5.1L67 28l-5.1 1.9L60 35l-1.9-5.1L53 28l5.1-1.9z"
        className="fill-primary"
      />
      <Dots pink={[96, 10]} water={[24, 46]} />
    </Art>
  )
}

/** Help: a paper life ring. */
export function HelpArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <circle
        cx="60"
        cy="28"
        r="17"
        fill="none"
        strokeWidth="11"
        transform="translate(1.5 2.5)"
        className={`${SHADOW} stroke-[rgb(43_42_38/0.10)]`}
      />
      <circle cx="60" cy="28" r="17" fill="none" strokeWidth="11" className="stroke-surface" />
      <circle
        cx="60"
        cy="28"
        r="17"
        fill="none"
        strokeWidth="11"
        strokeDasharray="13.35 13.35"
        strokeDashoffset="6.7"
        className="stroke-secondary"
      />
      <circle cx="60" cy="28" r="22.5" fill="none" strokeWidth="1" className="stroke-border" />
      <circle cx="60" cy="28" r="11.5" fill="none" strokeWidth="1" className="stroke-border" />
      <path
        d="M84 12c6 4 9 10 8 18"
        fill="none"
        strokeLinecap="round"
        strokeWidth="2.2"
        strokeDasharray="0.5 5"
        className="stroke-tertiary"
      />
      <Dots pink={[30, 8]} water={[96, 44]} />
    </Art>
  )
}

/** About: a paper heart between code brackets, made in the open. */
export function OpenArt({ size, className }: ArtProps) {
  return (
    <Art width={W} height={H} size={size} className={className}>
      <g
        className="stroke-tertiary"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.2"
      >
        <path d="M36 16 24 28l12 12" />
        <path d="M84 16l12 12-12 12" />
      </g>
      <Paper
        d="M60 46S42 35.5 42 23.5C42 17 46.5 13 51.5 13c4 0 6.75 2.25 8.5 5.5 1.75-3.25 4.5-5.5 8.5-5.5 5 0 9.5 4 9.5 10.5C78 35.5 60 46 60 46z"
        className="fill-secondary"
      />
      <path
        d="M50 20.5c-1.5.5-2.5 2-2.5 3.5"
        fill="none"
        strokeLinecap="round"
        strokeWidth="2.4"
        className="stroke-surface"
        opacity="0.7"
      />
      <Dots pink={[108, 10]} water={[12, 46]} />
    </Art>
  )
}
