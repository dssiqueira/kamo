import type { ReactNode, Ref } from 'react'

export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary'

export interface IconButtonProps {
  /** Accessible name and tooltip (already translated). */
  label: string
  onClick(): void
  children: ReactNode
  tone?: 'default' | 'danger'
  buttonRef?: Ref<HTMLButtonElement>
  expanded?: boolean
}

/** Square icon-only button; the label is both the tooltip and the accessible name. */
export function IconButton({
  label,
  onClick,
  children,
  tone = 'default',
  buttonRef,
  expanded,
}: IconButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
      className={`flex size-[32px] items-center justify-center rounded-md text-on-surface-muted transition-colors duration-[120ms] hover:bg-surface-raised ${
        tone === 'danger' ? 'hover:text-error' : 'hover:text-on-surface'
      } ${FOCUS_RING}`}
    >
      {children}
    </button>
  )
}

export interface SwitchProps {
  label: string
  checked: boolean
  onChange(checked: boolean): void
}

/** On/off switch (role=switch) with its label; water when on, like selected chips. */
export function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-sm text-body">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-[120ms] ${
          checked ? 'bg-tertiary' : 'bg-border'
        } ${FOCUS_RING}`}
      >
        <span
          aria-hidden
          className={`absolute top-[3px] size-[16px] rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-[inset-inline-start] duration-[120ms] ${
            checked ? 'start-[19px]' : 'start-[3px]'
          }`}
        />
      </button>
    </label>
  )
}
