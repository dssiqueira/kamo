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
