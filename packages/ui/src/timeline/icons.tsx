// Small stroke icons for the timeline controls. Decorative: the buttons carry aria-labels.
import type { ReactNode } from 'react'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="16"
      height="16"
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

export function PlusIcon() {
  return (
    <Icon>
      <path d="M8 3.5v9M3.5 8h9" />
    </Icon>
  )
}

export function MinusIcon() {
  return (
    <Icon>
      <path d="M3.5 8h9" />
    </Icon>
  )
}

export function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <Icon>
      <path d="M2.5 6h2.5l3.5-3v10l-3.5-3H2.5z" />
      {muted ? (
        <path d="M11 6l3 4M14 6l-3 4" />
      ) : (
        <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.75 3.75a6 6 0 0 1 0 8.5" />
      )}
    </Icon>
  )
}
