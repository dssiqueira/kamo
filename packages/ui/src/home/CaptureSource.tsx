import { useId, useState } from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { SecondaryButton, Segmented } from '../settings/parts.tsx'
import {
  filterWindows,
  type CaptureKind,
  type RegionOption,
  type WindowOption,
} from './captureSource.ts'

/** Home's choice between a display, a window and a region (A-08). */
export interface CaptureSourceProps {
  kind: CaptureKind
  onKindChange(kind: CaptureKind): void
  /** Null while the first list loads. */
  windows: readonly WindowOption[] | null
  selectedWindowId: string | null
  onSelectWindow(id: string): void
  /** The region dragged last time (any display); Record uses it on its own display only. */
  region: RegionOption | null
  /** Opens the overlay on the selected display to drag a rectangle. */
  onPickRegion(): void
}

/** Screen · Window · Region. */
export function CaptureKindSwitch({
  kind,
  onKindChange,
}: Pick<CaptureSourceProps, 'kind' | 'onKindChange'>) {
  const t = useT()
  return (
    <Segmented
      label={t('home.capture.title')}
      value={kind}
      onChange={onKindChange}
      options={[
        { value: 'display', label: t('home.capture.screen') },
        { value: 'window', label: t('home.capture.window') },
        { value: 'region', label: t('home.capture.region') },
      ]}
    />
  )
}

/** Open windows with thumbnails and a search box (A-08). */
export function WindowList({
  windows,
  selectedWindowId,
  onSelectWindow,
  labelledBy,
}: Pick<CaptureSourceProps, 'windows' | 'selectedWindowId' | 'onSelectWindow'> & {
  labelledBy: string
}) {
  const t = useT()
  const searchId = useId()
  const [query, setQuery] = useState('')
  if (windows === null) {
    return <p className="text-body text-on-surface-muted">{t('home.capture.loadingWindows')}</p>
  }
  if (windows.length === 0) {
    return <p className="text-body text-on-surface-muted">{t('home.capture.noWindows')}</p>
  }
  const shown = filterWindows(windows, query)
  return (
    <div className="flex flex-col gap-md">
      <label htmlFor={searchId} className="sr-only">
        {t('home.capture.searchWindows')}
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('home.capture.searchWindows')}
        className={`w-full max-w-[360px] rounded-md border border-border bg-surface px-sm py-xs text-body ${FOCUS_RING}`}
      />
      {shown.length === 0 ? (
        <p className="text-body text-on-surface-muted">
          {t('home.capture.noMatch', { query: query.trim() })}
        </p>
      ) : (
        <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-md">
          {shown.map((window) => (
            <WindowCard
              key={window.id}
              window={window}
              selected={window.id === selectedWindowId}
              onSelect={() => onSelectWindow(window.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function WindowCard({
  window,
  selected,
  onSelect,
}: {
  window: WindowOption
  selected: boolean
  onSelect(): void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      title={window.title}
      className={`flex w-[200px] flex-col gap-xs rounded-lg border-2 bg-surface p-sm text-start transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary ${
        selected ? 'border-tertiary' : 'border-border hover:border-tertiary-container'
      }`}
    >
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-surface-raised">
        {window.thumbnail ? (
          <img src={window.thumbnail} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="truncate px-sm text-label text-on-surface-muted">{window.app}</span>
        )}
      </div>
      <span className="line-clamp-2 text-body font-medium break-words">{window.title}</span>
      {window.app && (
        <span className="truncate font-mono text-label text-on-surface-muted">{window.app}</span>
      )}
    </button>
  )
}

/** Under the display cards in Region mode: the area chosen and the button to drag one. */
export function RegionControls({
  region,
  displayName,
  onPickRegion,
  disabled,
}: {
  /** The region on the selected display, if any. */
  region: RegionOption | null
  displayName: string | null
  onPickRegion(): void
  disabled: boolean
}) {
  const t = useT()
  return (
    <div className="flex flex-wrap items-center gap-md">
      <SecondaryButton onClick={onPickRegion} disabled={disabled}>
        {region ? t('home.capture.pickAgain') : t('home.capture.pickRegion')}
      </SecondaryButton>
      <p className="text-body text-on-surface-muted">
        {region
          ? t('home.capture.regionSize', {
              width: region.width,
              height: region.height,
              display: displayName ?? '',
            })
          : t('home.capture.noRegion')}
      </p>
    </div>
  )
}
