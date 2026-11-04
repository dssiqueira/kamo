import { FOCUS_RING } from '../primitives/controls.tsx'

/** The on/off switch of a source card (the camera card uses it too). */
export function SourceSwitch(props: {
  on: boolean
  labelId: string
  disabled?: boolean | undefined
  onClick(): void
}) {
  const { on, labelId, disabled, onClick } = props
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelId}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-[120ms] disabled:opacity-50 ${
        on ? 'bg-tertiary' : 'bg-border'
      } ${FOCUS_RING}`}
    >
      <span
        aria-hidden
        className={`absolute top-[3px] size-[16px] rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-[inset-inline-start] duration-[120ms] ${
          on ? 'start-[19px]' : 'start-[3px]'
        }`}
      />
    </button>
  )
}
