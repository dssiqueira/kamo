// Pieces shared by Home's sound and camera cards (F-04, A-03): the card itself, its header with
// the toggle, the device picker and the status line.
import { useId, type ReactNode } from 'react'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { ChevronDownIcon } from '../primitives/icons.tsx'
import { SourceSwitch } from './SourceSwitch.tsx'

/** Soft surface, large corners, a thin border and the faintest shadow (one of a row of three). */
export const SOURCE_CARD =
  'relative flex min-w-0 flex-col gap-sm rounded-lg border border-border bg-surface p-md shadow-[0_1px_2px_rgb(43_42_38/0.04),0_4px_14px_rgb(43_42_38/0.05)]'

export function SourceCardHeader(props: {
  icon: ReactNode
  title: string
  on: boolean
  disabled?: boolean | undefined
  onToggle(): void
}) {
  const labelId = useId()
  return (
    <div className="flex items-center gap-sm">
      <span aria-hidden className="shrink-0 text-primary-strong">
        {props.icon}
      </span>
      <span id={labelId} className="min-w-0 flex-1 truncate text-title" title={props.title}>
        {props.title}
      </span>
      <SourceSwitch
        on={props.on}
        labelId={labelId}
        disabled={props.disabled}
        onClick={props.onToggle}
      />
    </div>
  )
}

export interface DeviceOption {
  id: string
  /** OS label; empty when the OS gives none. */
  label: string
}

/**
 * The device to record. With one device there is nothing to choose: its name shows instead,
 * so the card still says what it records (F-04: the choice only with more than one).
 */
export function DevicePicker(props: {
  devices: readonly DeviceOption[]
  /** null: the system default. */
  selectedId: string | null
  /** Accessible name of the picker. */
  label: string
  defaultLabel: string
  nameOf(index: number): string
  onSelect(id: string | null): void
}) {
  const selectId = useId()
  const { devices } = props
  const nameAt = (index: number) => devices[index]?.label || props.nameOf(index + 1)
  if (devices.length === 0) return null
  if (devices.length === 1) {
    const name = nameAt(0)
    return (
      <p
        className="truncate rounded-md border border-border bg-surface px-sm py-xs text-body"
        title={name}
      >
        <span className="sr-only">{props.label}: </span>
        {name}
      </p>
    )
  }
  // A remembered device that is not plugged in reads as the default.
  const index = devices.findIndex((d) => d.id === props.selectedId)
  const selected = index >= 0 ? (props.selectedId ?? '') : ''
  const shown = index >= 0 ? nameAt(index) : props.defaultLabel
  return (
    <div className="relative">
      <label htmlFor={selectId} className="sr-only">
        {props.label}
      </label>
      <select
        id={selectId}
        value={selected}
        title={shown}
        onChange={(event) => props.onSelect(event.target.value || null)}
        className={`w-full cursor-pointer appearance-none truncate rounded-md border border-border bg-surface py-xs ps-sm pe-[32px] text-body transition-colors duration-[120ms] hover:border-tertiary-container ${FOCUS_RING}`}
      >
        <option value="">{props.defaultLabel}</option>
        {devices.map((d, i) => (
          <option key={d.id} value={d.id}>
            {nameAt(i)}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 end-sm flex items-center text-on-surface-muted"
      >
        <ChevronDownIcon />
      </span>
    </div>
  )
}

export type SourceMessage = { tone: 'muted' | 'warning'; text: string } | null

export function SourceMessageLine({ message }: { message: SourceMessage }) {
  if (!message) return null
  return (
    <p
      role={message.tone === 'warning' ? 'alert' : undefined}
      className={`text-label ${message.tone === 'warning' ? 'text-warning' : 'text-on-surface-muted'}`}
    >
      {message.text}
    </p>
  )
}
