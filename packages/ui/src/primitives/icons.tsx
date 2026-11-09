// Stroke icons shared across screens (same 16px grid and stroke as the timeline's).
// Decorative: the controls that use them carry the label.
import type { ReactNode } from 'react'

function Icon({ children, size = 16 }: { children: ReactNode; size?: number | undefined }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export function PlayIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
    </Icon>
  )
}

export function PauseIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth="2.25" />
    </Icon>
  )
}

export function StopIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <rect x="4" y="4" width="8" height="8" rx="1.75" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function PencilIcon() {
  return (
    <Icon>
      <path d="M10.5 3l2.5 2.5-7 7H3.5V10z M9 4.5l2.5 2.5" />
    </Icon>
  )
}

export function FolderIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
    </Icon>
  )
}

export function TrashIcon() {
  return (
    <Icon>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5M7 7v4M9 7v4" />
    </Icon>
  )
}

export function ArrowBackIcon() {
  return (
    <Icon>
      <path d="M12.5 8h-9M7 4.5L3.5 8 7 11.5" />
    </Icon>
  )
}

// Settings, onboarding and help (F-13, F-15, F-17).
export function GearIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.42 3.58l-1.06 1.06M4.64 11.36l-1.06 1.06M12.42 12.42l-1.06-1.06M4.64 4.64L3.58 3.58" />
      <circle cx="8" cy="8" r="4.25" />
    </Icon>
  )
}

export function CheckIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M3.5 8.5l3 3 6-7" />
    </Icon>
  )
}

export function AlertIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5M8 11h.01" />
    </Icon>
  )
}

export function ExternalIcon() {
  return (
    <Icon>
      <path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </Icon>
  )
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  )
}

// Local playlists (Home).
export function PlaylistAddIcon() {
  return (
    <Icon>
      <path d="M2.5 4h8M2.5 7.5h8M2.5 11h4.5M11.5 9v5M9 11.5h5" />
    </Icon>
  )
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M8 3.5v9M3.5 8h9" />
    </Icon>
  )
}

export function ArrowUpIcon() {
  return (
    <Icon>
      <path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7" />
    </Icon>
  )
}

export function ArrowDownIcon() {
  return (
    <Icon>
      <path d="M8 3.5v9M4.5 9L8 12.5 11.5 9" />
    </Icon>
  )
}

export function MinusCircleIcon() {
  return (
    <Icon>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.5 8h5" />
    </Icon>
  )
}

/** Three dots in a row: "more actions". */
export function MoreIcon() {
  return (
    <Icon>
      <circle cx="3.75" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12.25" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  )
}

// Home's Screen · Window · Select switch (A-08).
export function MonitorIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1.25" />
      <path d="M8 11v2.5M5.25 13.5h5.5" />
    </Icon>
  )
}

export function AppWindowIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.25" />
      <path d="M1.75 5.75h12.5" />
      <circle cx="3.75" cy="4.25" r="0.65" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="4.25" r="0.65" fill="currentColor" stroke="none" />
      <circle cx="7.25" cy="4.25" r="0.65" fill="currentColor" stroke="none" />
    </Icon>
  )
}

/** A dashed selection rectangle with corner handles. */
export function SelectionIcon() {
  return (
    <Icon>
      <path d="M6 3h4M6 13h4M3 6v4M13 6v4" strokeDasharray="1.5 1.5" />
      <rect x="1.75" y="1.75" width="2.5" height="2.5" rx="0.5" />
      <rect x="11.75" y="1.75" width="2.5" height="2.5" rx="0.5" />
      <rect x="1.75" y="11.75" width="2.5" height="2.5" rx="0.5" />
      <rect x="11.75" y="11.75" width="2.5" height="2.5" rx="0.5" />
    </Icon>
  )
}

/** A padlock: "stays on your computer" notes. */
export function LockIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
    </Icon>
  )
}

// Home's sound and camera cards (F-04, A-03).
export function MicIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <rect x="5.75" y="1.75" width="4.5" height="7.5" rx="2.25" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.25" />
    </Icon>
  )
}

export function SpeakerWavesIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M2 6.25v3.5h2.5L8 12.5v-9L4.5 6.25H2Z" />
      <path d="M10.5 6a2.75 2.75 0 0 1 0 4M12.5 4a5.5 5.5 0 0 1 0 8" />
    </Icon>
  )
}

export function VideoCameraIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <rect x="1.75" y="4" width="9" height="8" rx="1.5" />
      <path d="m10.75 7 3.5-2v6l-3.5-2" />
    </Icon>
  )
}

/** Two sliders: "settings" of one thing (Home's audio settings). */
export function SlidersIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M2 5h3.5M9 5h5M2 11h7.5M13 11h1" />
      <circle cx="7.25" cy="5" r="1.75" />
      <circle cx="11.25" cy="11" r="1.75" />
    </Icon>
  )
}

/** Points to the end of the line ("opens more"). */
export function ChevronEndIcon() {
  return (
    <Icon>
      <path d="m6.25 3.5 4.5 4.5-4.5 4.5" />
    </Icon>
  )
}

export function ChevronDownIcon() {
  return (
    <Icon>
      <path d="m3.5 6.25 4.5 4.5 4.5-4.5" />
    </Icon>
  )
}

// Settings cards and the theme switch (flows.md §7).
export function SunIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.25M8 13v1.25M14.25 8H13M3 8H1.75M12.42 3.58l-.88.88M4.46 11.54l-.88.88M12.42 12.42l-.88-.88M4.46 4.46l-.88-.88" />
    </Icon>
  )
}

export function MoonIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M13.25 9.75A5.5 5.5 0 0 1 6.25 2.75a5.5 5.5 0 1 0 7 7z" />
    </Icon>
  )
}

/** Half light, half dark: the theme of every window. */
export function ThemeIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 2.25a5.75 5.75 0 0 1 0 11.5z" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function GlobeIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.75 1.6 2.5 3.6 2.5 6S9.75 12.4 8 14C6.25 12.4 5.5 10.4 5.5 8S6.25 3.6 8 2z" />
    </Icon>
  )
}

/** A stopwatch: the 3-2-1 countdown. */
export function TimerIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <circle cx="8" cy="9" r="5" />
      <path d="M6.5 1.75h3M8 4v-2.25M8 9V6.5M12 4.5l.75-.75" />
    </Icon>
  )
}

/** A tray with an arrow leaving it: where exported videos go. */
export function ExportIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M8 10V2.25M5 5l3-3 3 3M2.75 9.5v3a1.25 1.25 0 0 0 1.25 1.25h8a1.25 1.25 0 0 0 1.25-1.25v-3" />
    </Icon>
  )
}

/** One key of a shortcut. */
export function KeycapIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M5 10.25h6M4.75 6h.01M8 6h.01M11.25 6h.01" />
    </Icon>
  )
}

export function MouseIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <rect x="4" y="1.75" width="8" height="12.5" rx="4" />
      <path d="M8 4.25v2" />
    </Icon>
  )
}

/** A caption under a frame: transcripts and captions. */
export function CaptionsIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <rect x="1.75" y="3" width="12.5" height="10" rx="1.75" />
      <path d="M4.5 10h4M10.5 10h1M4.5 7.5h1.5M8 7.5h3.5" />
    </Icon>
  )
}

/** Two arrows chasing each other: check for updates. */
export function RefreshIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M13 6.5A5.25 5.25 0 0 0 3.6 4.75M3 9.5a5.25 5.25 0 0 0 9.4 1.75" />
      <path d="M3.25 2.25v2.75H6M12.75 13.75V11H10" />
    </Icon>
  )
}

export function ClipboardIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M5.5 3h-1a1.25 1.25 0 0 0-1.25 1.25v8.5A1.25 1.25 0 0 0 4.5 14h7a1.25 1.25 0 0 0 1.25-1.25v-8.5A1.25 1.25 0 0 0 11.5 3h-1" />
      <rect x="5.5" y="1.75" width="5" height="2.5" rx="0.75" />
      <path d="M5.75 7.5h4.5M5.75 10.25h3" />
    </Icon>
  )
}

/** A prompt and a cursor: a command to paste in a terminal. */
export function TerminalIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.75" />
      <path d="m4.5 6.25 2 1.75-2 1.75M8 10.25h3" />
    </Icon>
  )
}

/** Curly braces: a JSON snippet. */
export function BracesIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M5.5 2.5c-1.5 0-2 .75-2 2v1.5c0 1-.5 2-1.5 2 1 0 1.5 1 1.5 2v1.5c0 1.25.5 2 2 2M10.5 2.5c1.5 0 2 .75 2 2v1.5c0 1 .5 2 1.5 2-1 0-1.5 1-1.5 2v1.5c0 1.25-.5 2-2 2" />
    </Icon>
  )
}

/** A page with a folded corner: notices and licenses. */
export function DocumentIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <path d="M9.25 1.75H4.5A1.25 1.25 0 0 0 3.25 3v10a1.25 1.25 0 0 0 1.25 1.25h7A1.25 1.25 0 0 0 12.75 13V5.25z" />
      <path d="M9.25 1.75v3.5h3.5M5.75 8.5h4.5M5.75 11h3" />
    </Icon>
  )
}

export function InfoIcon({ size }: { size?: number | undefined }) {
  return (
    <Icon size={size}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.25V11M8 5h.01" />
    </Icon>
  )
}
