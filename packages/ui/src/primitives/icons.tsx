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

export function FolderIcon() {
  return (
    <Icon>
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
export function MonitorIcon() {
  return (
    <Icon>
      <rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1.25" />
      <path d="M8 11v2.5M5.25 13.5h5.5" />
    </Icon>
  )
}

export function AppWindowIcon() {
  return (
    <Icon>
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
