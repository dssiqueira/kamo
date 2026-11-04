import { useT } from '../i18n.tsx'
import type { DisplayOption } from './pickDisplay.ts'

export interface HomeProps {
  displays: readonly DisplayOption[]
  selectedId: string | null
  onSelect(id: string): void
  onRecord(): void
  /** Mac without screen recording permission: Record stays disabled (F-01). */
  needsPermission?: boolean
  /** How the last recording ended, already translated. */
  notice?: { tone: 'error' | 'warning' | 'success'; text: string } | null
}

/** Home (flows.md §2): displays → Record. Toggles and recent projects arrive in steps 3–4. */
export function Home({
  displays,
  selectedId,
  onSelect,
  onRecord,
  needsPermission,
  notice,
}: HomeProps) {
  const t = useT()
  const canRecord = selectedId !== null && !needsPermission

  return (
    <main className="flex min-h-screen flex-col gap-lg bg-background p-xl font-sans text-on-surface">
      <header className="flex items-baseline justify-between gap-md">
        <h1 className="font-serif text-headline">{t('app.name')}</h1>
        <p className="text-body text-on-surface-muted">{t('app.tagline')}</p>
      </header>

      {needsPermission && (
        <p role="alert" className="rounded-md bg-surface-raised px-md py-sm text-body text-warning">
          {t('home.needsPermission')}
        </p>
      )}

      {notice && (
        <p role="status" className={`rounded-md px-md py-sm text-body ${NOTICE_TONE[notice.tone]}`}>
          {notice.text}
        </p>
      )}

      <section className="flex flex-col gap-md" aria-labelledby="displays-title">
        <h2 id="displays-title" className="text-title">
          {t('home.displays')}
        </h2>
        {displays.length === 0 ? (
          <p className="text-body text-on-surface-muted">{t('home.noDisplays')}</p>
        ) : (
          <div role="radiogroup" aria-labelledby="displays-title" className="flex flex-wrap gap-md">
            {displays.map((display, index) => (
              <DisplayCard
                key={display.id}
                display={display}
                name={display.label || t('home.displayName', { index: index + 1 })}
                selected={display.id === selectedId}
                onSelect={() => onSelect(display.id)}
              />
            ))}
          </div>
        )}
      </section>

      <div>
        <button
          type="button"
          disabled={!canRecord}
          onClick={onRecord}
          className="rounded-md bg-primary px-[20px] py-[12px] text-title text-on-primary transition-colors duration-[120ms] hover:bg-[#97CB90] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary disabled:opacity-50"
        >
          {t('home.record')}
        </button>
      </div>
    </main>
  )
}

// DESIGN.md toasts: success on primary-container, warning and error on surface-raised.
const NOTICE_TONE = {
  success: 'bg-primary-container text-success',
  warning: 'bg-surface-raised text-warning',
  error: 'bg-surface-raised text-error',
} as const

interface DisplayCardProps {
  display: DisplayOption
  name: string
  selected: boolean
  onSelect(): void
}

function DisplayCard({ display, name, selected, onSelect }: DisplayCardProps) {
  const t = useT()
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-[240px] flex-col gap-sm rounded-lg border-2 bg-surface p-sm text-start transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary ${
        selected ? 'border-tertiary' : 'border-border hover:border-tertiary-container'
      }`}
    >
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-surface-raised">
        {display.thumbnail && (
          <img src={display.thumbnail} alt="" className="h-full w-full object-contain" />
        )}
      </div>
      <div className="flex items-center justify-between gap-sm">
        <span className="truncate text-title">{name}</span>
        {display.primary && (
          <span className="shrink-0 rounded-full bg-tertiary-container px-[12px] py-xs text-label">
            {t('home.primary')}
          </span>
        )}
      </div>
      <span className="font-mono text-label text-on-surface-muted">
        {t('home.displaySize', { width: display.width, height: display.height })}
      </span>
    </button>
  )
}
