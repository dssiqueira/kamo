// Small building blocks for Settings and the onboarding (DESIGN.md components).
import { useEffect, useRef, type ReactNode } from 'react'
import { FOCUS_RING, Switch } from '../primitives/controls.tsx'
import { AlertIcon, CheckIcon, CloseIcon } from '../primitives/icons.tsx'
import type { PermissionStatus } from './types.ts'

/** DESIGN.md button-secondary, in a compact size for settings rows. */
export function SecondaryButton({
  children,
  onClick,
  disabled,
  raised = false,
}: {
  children: ReactNode
  onClick(): void
  disabled?: boolean
  /** On a surface-raised panel: a surface fill with a border, so the button still shows. */
  raised?: boolean
}) {
  const fill = raised
    ? 'border border-border bg-surface hover:bg-background disabled:hover:bg-surface'
    : 'bg-surface-raised hover:bg-border disabled:hover:bg-surface-raised'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex shrink-0 items-center gap-xs rounded-md px-[14px] py-[7px] text-body font-semibold text-on-surface transition-colors duration-[120ms] disabled:opacity-50 ${fill} ${FOCUS_RING}`}
    >
      {children}
    </button>
  )
}

/** DESIGN.md button-primary: one per screen at most. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick(): void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex shrink-0 items-center gap-sm rounded-md bg-primary px-[20px] py-[12px] text-title text-on-primary transition-colors duration-[120ms] hover:bg-[#97CB90] disabled:opacity-50 disabled:hover:bg-primary ${FOCUS_RING}`}
    >
      {children}
    </button>
  )
}

/** DESIGN.md link: tertiary-strong text, used for quiet actions ("Skip for now"). */
export function LinkButton({ children, onClick }: { children: ReactNode; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-xs rounded-sm text-body text-tertiary-strong underline-offset-2 hover:underline ${FOCUS_RING}`}
    >
      {children}
    </button>
  )
}

/**
 * The friendly top of a settings section: a small paper-cut scene, a serif headline and one line
 * under it, on a soft water tint (DESIGN.md typography: Instrument Serif for large headings).
 */
export interface SectionHero {
  /** Decorative: hidden from assistive tech; the headline says what it means. */
  art: ReactNode
  headline: ReactNode
  description?: ReactNode
}

/**
 * A settings panel (DESIGN.md panel: surface, large corners, 16px inside): its title, the hero,
 * its cards and, last, a quiet note.
 */
export function Section({
  id,
  title,
  hero,
  note,
  children,
}: {
  id: string
  title: string
  hero?: SectionHero
  /** A footnote under the cards (e.g. "nothing leaves this computer"), with its icon. */
  note?: { icon: ReactNode; text: ReactNode }
  children?: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-md flex-col gap-md rounded-lg border border-border bg-surface p-md"
    >
      <h2 id={`${id}-title`} className="text-title">
        {title}
      </h2>
      {hero && <HeroBand hero={hero} />}
      {children}
      {note && <SectionNote icon={note.icon}>{note.text}</SectionNote>}
    </section>
  )
}

function HeroBand({ hero }: { hero: SectionHero }) {
  return (
    <div className="flex items-center gap-md rounded-lg bg-tertiary-container/35 p-md">
      <span aria-hidden className="flex w-[112px] shrink-0 justify-center">
        {hero.art}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-xs">
        <p className="font-serif text-[24px] leading-tight text-pretty">{hero.headline}</p>
        {hero.description && (
          <p className="text-body text-pretty text-on-surface-muted">{hero.description}</p>
        )}
      </div>
    </div>
  )
}

/** A quiet footnote with a small icon at the start ("stays on your computer"). */
export function SectionNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-xs text-label text-on-surface-muted">
      <span aria-hidden className="flex shrink-0 pt-[2px]">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/**
 * One setting as a card (the pattern of the pack cards): an icon tile, the name with its chips,
 * one line about it, the controls at the end, and anything that follows (progress, a notice,
 * a confirmation) under it. Wraps the controls below the text when narrow.
 */
export function SettingCard({
  icon,
  art,
  title,
  chips,
  description,
  controls,
  children,
  notice,
  footer,
  testId,
  state,
}: {
  /** A 16px-grid stroke icon, drawn in water on a small tile. */
  icon?: ReactNode
  /** A larger illustration on a bigger tile (the pack art); used instead of `icon`. */
  art?: ReactNode
  title?: ReactNode
  chips?: ReactNode
  description?: ReactNode
  controls?: ReactNode
  /** More of the text column: a switch, meters. */
  children?: ReactNode
  /** A message about this setting, under the row and lined up with the text. */
  notice?: ReactNode
  /** Full width, under the card's row (a progress bar, a confirmation). */
  footer?: ReactNode
  testId?: string
  /** Exposed as data-state (tests read it). */
  state?: string
}) {
  return (
    <div
      className="flex flex-col gap-sm rounded-md border border-border p-sm"
      data-testid={testId}
      data-state={state}
    >
      <div className="flex flex-wrap items-center gap-x-md gap-y-sm">
        <div className="flex min-w-[240px] flex-1 items-center gap-md">
          {art ? (
            <span
              aria-hidden
              className="flex size-[56px] shrink-0 items-center justify-center self-start rounded-md bg-surface-raised"
            >
              {art}
            </span>
          ) : icon ? (
            <span
              aria-hidden
              className="flex size-[40px] shrink-0 items-center justify-center self-start rounded-md bg-surface-raised text-tertiary-strong"
            >
              {icon}
            </span>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-xs">
            {(title || chips) && (
              <div className="flex min-h-[20px] flex-wrap items-center gap-x-sm gap-y-xs">
                {title && <div className="text-body font-medium">{title}</div>}
                {chips}
              </div>
            )}
            {description && <div className="text-label text-on-surface-muted">{description}</div>}
            {children}
          </div>
        </div>
        {controls && <div className="ms-auto flex flex-wrap items-center gap-sm">{controls}</div>}
      </div>
      {notice && (
        <div className={`flex flex-col gap-xs ${art ? 'ps-[72px]' : icon ? 'ps-[56px]' : ''}`}>
          {notice}
        </div>
      )}
      {footer}
    </div>
  )
}

/** A card whose setting is one on/off switch, with the hint under it. */
export function SwitchCard({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: ReactNode
  label: string
  hint?: ReactNode
  checked: boolean
  onChange(checked: boolean): void
}) {
  return (
    <SettingCard icon={icon}>
      <div className="font-medium">
        <Switch label={label} checked={checked} onChange={onChange} />
      </div>
      {hint && <p className="text-label text-on-surface-muted">{hint}</p>}
    </SettingCard>
  )
}

/** A native select drawn like the other fields (DESIGN.md: medium corners, a thin border). */
export const SELECT_CLASS = `min-w-[200px] max-w-full rounded-md border border-border bg-surface px-[12px] py-[7px] text-body text-on-surface ${FOCUS_RING}`

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Optional decorative icon before the label (hidden from assistive tech; the label names it). */
  icon?: ReactNode
}

/** Radio group drawn as chips (DESIGN.md chip-selected). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange(value: T): void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = options.findIndex((option) => option.value === value)
  const move = (delta: number) => {
    const next = (index + delta + options.length) % options.length
    const option = options[next]
    if (!option) return
    onChange(option.value)
    refs.current[next]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-xs rounded-full bg-surface-raised p-xs"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(1)
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(-1)
        else return
        event.preventDefault()
      }}
    >
      {options.map((option, i) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[i] = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`rounded-full py-[5px] text-body transition-colors duration-[120ms] ${
              option.icon ? 'inline-flex items-center gap-[6px] ps-[11px] pe-[14px]' : 'px-[14px]'
            } ${
              selected
                ? 'bg-tertiary-container font-semibold text-on-surface'
                : 'text-on-surface-muted hover:text-on-surface'
            } ${FOCUS_RING}`}
          >
            {option.icon && (
              <span aria-hidden className="flex shrink-0">
                {option.icon}
              </span>
            )}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export type ChipTone = 'neutral' | 'success' | 'error' | 'warning' | 'active'

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: 'bg-surface-raised text-on-surface-muted',
  success: 'bg-primary-container text-success',
  error: 'bg-surface-raised text-error',
  warning: 'bg-surface-raised text-warning',
  active: 'bg-tertiary-container text-on-surface',
}

/** A small pill next to a card's name: a size, a status (DESIGN.md: pill corners). */
export function Chip({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: ChipTone
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-xs rounded-full px-[10px] py-[3px] text-label tabular-nums ${CHIP_TONE[tone]}`}
    >
      {icon && (
        <span aria-hidden className="flex">
          {icon}
        </span>
      )}
      {children}
    </span>
  )
}

const STATUS_TONE: Record<PermissionStatus, ChipTone> = {
  granted: 'success',
  denied: 'error',
  pending: 'warning',
  unknown: 'neutral',
}

/** Permission status pill: green check when granted (flows.md §1). */
export function StatusPill({ status, label }: { status: PermissionStatus; label: string }) {
  return (
    <Chip
      tone={STATUS_TONE[status]}
      icon={
        status === 'granted' ? (
          <CheckIcon size={14} />
        ) : status === 'unknown' ? undefined : (
          <AlertIcon size={14} />
        )
      }
    >
      {label}
    </Chip>
  )
}

/** Inline message under a control (DESIGN.md toast colors, not a popup). */
export function InlineNotice({
  tone,
  children,
}: {
  tone: 'error' | 'warning' | 'success' | 'info'
  children: ReactNode
}) {
  const style = {
    error: 'text-error',
    warning: 'text-warning',
    success: 'text-success',
    info: 'text-on-surface-muted',
  }[tone]
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`text-label ${style}`}>
      {children}
    </p>
  )
}

/** A friendlier dialog header: art, a serif headline and one line under it. */
export interface DialogHero {
  /** Decorative (mascot, illustration): beside the title, or above it when centered. */
  art?: ReactNode
  subtitle?: ReactNode
  /** Centered: an empty-state moment (art on top, buttons centered). */
  align?: 'start' | 'center'
}

/**
 * Modal dialog on the native <dialog> (focus trap, Esc to close, inert page behind). Floating,
 * so it gets the soft shadow (DESIGN.md elevation). With `hero`, the title is a serif headline
 * with art and a subtitle (DESIGN.md typography: Instrument Serif for large headings).
 */
export function Dialog({
  open,
  title,
  closeLabel,
  onClose,
  children,
  footer,
  hero,
}: {
  open: boolean
  title: string
  closeLabel: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  hero?: DialogHero
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  const centered = hero?.align === 'center'
  const close = (
    <button
      type="button"
      aria-label={closeLabel}
      title={closeLabel}
      onClick={onClose}
      className={`flex size-[28px] shrink-0 items-center justify-center rounded-md text-on-surface-muted hover:bg-surface-raised hover:text-on-surface ${FOCUS_RING}`}
    >
      <CloseIcon />
    </button>
  )
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto max-h-[calc(100vh-64px)] w-[min(680px,calc(100vw-48px))] rounded-lg border border-border bg-surface p-0 text-on-surface shadow-[0_8px_24px_rgb(0_0_0/0.12)] backdrop:bg-[rgb(0_0_0/0.35)]"
    >
      {open && (
        <div
          className={`relative flex max-h-[calc(100vh-64px)] flex-col overflow-y-auto ${
            hero ? 'gap-lg px-xl pt-xl pb-lg' : 'gap-md p-lg'
          }`}
        >
          {!hero ? (
            <div className="flex items-start justify-between gap-md">
              <h2 id="dialog-title" className="text-title">
                {title}
              </h2>
              {close}
            </div>
          ) : centered ? (
            <>
              <div className="absolute end-md top-md">{close}</div>
              <div className="flex flex-col items-center gap-sm pt-sm text-center">
                {hero.art}
                <h2 id="dialog-title" className="pt-xs font-serif text-headline">
                  {title}
                </h2>
                {hero.subtitle && (
                  <p className="max-w-[440px] text-body text-pretty text-on-surface-muted">
                    {hero.subtitle}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-start gap-md">
              {hero.art}
              <div className="flex min-w-0 flex-1 flex-col gap-xs self-center">
                <h2 id="dialog-title" className="font-serif text-headline">
                  {title}
                </h2>
                {hero.subtitle && (
                  <p className="text-body text-pretty text-on-surface-muted">{hero.subtitle}</p>
                )}
              </div>
              {close}
            </div>
          )}
          {children}
          {footer && (
            <div
              className={`flex flex-wrap items-center gap-sm ${centered ? 'justify-center' : 'justify-end'}`}
            >
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}
