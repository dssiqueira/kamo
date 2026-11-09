import { useId, type ReactNode } from 'react'
import { useT } from '../i18n.tsx'
import { CornerDecor } from '../decor/Decor.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { SettingsButton } from '../settings/SettingsButton.tsx'
import { AudioSources, type AudioSourcesProps } from './AudioSources.tsx'
import type { CameraSourceProps } from './CameraSource.tsx'
import {
  CaptureKindSwitch,
  RegionControls,
  WindowList,
  type CaptureSourceProps,
} from './CaptureSource.tsx'
import { recordTarget, shortTitle } from './captureSource.ts'
import type { DisplayOption } from './pickDisplay.ts'
import { ProjectList, type ProjectListProps } from './ProjectList.tsx'
import { SourceSwitch } from './SourceSwitch.tsx'

export interface HomeProps {
  displays: readonly DisplayOption[]
  selectedId: string | null
  onSelect(id: string): void
  onRecord(): void
  /** Mac without screen recording permission: Record stays disabled (F-01). */
  needsPermission?: boolean
  /**
   * How the last recording ended, already translated. `action` adds a button after the text,
   * e.g. "Open in editor" for a recording saved with warnings (F-02).
   */
  notice?: {
    tone: 'error' | 'warning' | 'success'
    text: string
    action?: { label: string; onClick(): void }
  } | null
  /** Recent projects below the Record button (F-12). Omitted: no list at all. */
  projects?: ProjectListProps
  /** Microphone and computer sound toggles with level meters (F-04). Omitted: none. */
  audio?: AudioSourcesProps
  /** Webcam toggle and preview (A-03), shown with the audio sources. Omitted: none. */
  camera?: CameraSourceProps
  /** Gear in the header (F-15). Omitted: no button. */
  onOpenSettings?(): void
  /** Missing permission: the warning links here (onboarding, F-13). */
  onFixPermission?(): void
  /** Above everything else, e.g. "new version ready" (F-14). */
  banner?: ReactNode
  /**
   * A-08: Screen · Window · Select. Omitted: displays only. `displays`, `selectedId` and
   * `onSelect` stay the display picker (Select records part of the selected display).
   */
  capture?: CaptureSourceProps
  /** A-01: "Record at 60 fps" next to the Record button. Omitted: no switch (30 fps). */
  recordingFps?: { value: 30 | 60; onChange(fps: 30 | 60): void }
}

/** Home (flows.md §2): displays → toggles → Record → recent projects. */
export function Home({
  displays,
  selectedId,
  onSelect,
  onRecord,
  needsPermission,
  notice,
  projects,
  audio,
  camera,
  onOpenSettings,
  onFixPermission,
  banner,
  capture,
  recordingFps,
}: HomeProps) {
  const t = useT()
  const kind = capture?.kind ?? 'display'
  const displayName = (display: DisplayOption, index: number) =>
    display.label || t('home.displayName', { index: index + 1 })
  // The button says what it records: the last choice is remembered (F-01, A-08), so it may not
  // be what the user expects.
  const target = recordTarget({
    kind,
    displays,
    selectedDisplayId: selectedId,
    displayName,
    windows: capture?.windows ?? null,
    selectedWindowId: capture?.selectedWindowId ?? null,
    region: capture?.region ?? null,
  })
  const canRecord = target !== null && !needsPermission
  const recordLabel =
    target === null
      ? t('home.record')
      : target.kind === 'display'
        ? t('home.recordDisplay', { display: target.name })
        : target.kind === 'window'
          ? t('home.recordWindow', { window: shortTitle(target.title) })
          : t('home.recordRegion', { width: target.width, height: target.height })
  const selectedIndex = displays.findIndex((d) => d.id === selectedId)
  const selectedDisplay = displays[selectedIndex]
  const regionHere =
    capture?.region && capture.region.displayId === selectedId ? capture.region : null

  return (
    <main className="relative min-h-screen bg-background font-sans text-on-surface">
      {/* Small leaves in the bottom corners: Home is a rest screen, not a working one. */}
      <CornerDecor scale={0.55} butterfly={false} />
      <div className="relative mx-auto flex w-full max-w-[1040px] flex-col gap-lg p-xl pb-[120px]">
        <header className="flex items-center justify-between gap-md">
          {/* Brand: the app icon next to the name (DESIGN.md → Mascot). */}
          <div className="flex items-center gap-sm">
            <Mascot pose="icon" size={44} />
            <h1 className="font-serif text-headline">{t('app.name')}</h1>
          </div>
          <div className="flex items-center gap-md">
            <p className="text-body text-on-surface-muted">{t('app.tagline')}</p>
            {onOpenSettings && <SettingsButton onClick={onOpenSettings} />}
          </div>
        </header>

        {banner}

        {needsPermission && (
          <p
            role="alert"
            className="rounded-md bg-surface-raised px-md py-sm text-body text-warning"
          >
            {t('home.needsPermission')}
            {onFixPermission && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={onFixPermission}
                  className="font-semibold text-tertiary-strong underline underline-offset-2"
                >
                  {t('home.fixPermission')}
                </button>
              </>
            )}
          </p>
        )}

        {notice && (
          <p
            role="status"
            className={`flex items-center gap-sm rounded-md px-md py-sm text-body ${NOTICE_TONE[notice.tone]}`}
          >
            {/* A saved recording gets Kamo's smile. */}
            {notice.tone === 'success' && <Mascot pose="head-happy" size={36} />}
            <span className="flex-1">{notice.text}</span>
            {notice.action && (
              <button
                type="button"
                onClick={notice.action.onClick}
                className={`shrink-0 rounded-sm font-semibold text-tertiary-strong underline underline-offset-2 ${FOCUS_RING}`}
              >
                {notice.action.label}
              </button>
            )}
          </p>
        )}

        <section className="flex flex-col gap-md" aria-labelledby="displays-title">
          <div className="flex flex-wrap items-center justify-between gap-md">
            <h2 id="displays-title" className="text-title">
              {capture ? t('home.capture.title') : t('home.displays')}
            </h2>
            {capture && <CaptureKindSwitch kind={kind} onKindChange={capture.onKindChange} />}
          </div>
          {capture && kind === 'window' ? (
            <WindowList
              windows={capture.windows}
              selectedWindowId={capture.selectedWindowId}
              onSelectWindow={capture.onSelectWindow}
              labelledBy="displays-title"
            />
          ) : displays.length === 0 ? (
            <p className="text-body text-on-surface-muted">{t('home.noDisplays')}</p>
          ) : (
            <div
              role="radiogroup"
              aria-labelledby="displays-title"
              className="flex flex-wrap gap-md"
            >
              {displays.map((display, index) => (
                <DisplayCard
                  key={display.id}
                  display={display}
                  name={displayName(display, index)}
                  selected={display.id === selectedId}
                  onSelect={() => onSelect(display.id)}
                />
              ))}
            </div>
          )}
          {capture && kind === 'region' && displays.length > 0 && (
            <RegionControls
              region={regionHere}
              displayName={selectedDisplay ? displayName(selectedDisplay, selectedIndex) : null}
              onPickRegion={capture.onPickRegion}
              disabled={selectedId === null || !!needsPermission}
            />
          )}
        </section>

        {audio && <AudioSources {...audio} {...(camera ? { camera } : {})} />}

        <div className="flex flex-wrap items-center gap-lg">
          <button
            type="button"
            disabled={!canRecord}
            onClick={onRecord}
            className="flex items-center gap-sm rounded-md bg-primary px-[20px] py-[12px] text-title text-on-primary transition-colors duration-[120ms] hover:bg-[#97CB90] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary disabled:opacity-50"
          >
            {/* DESIGN.md: coral is reserved for the REC dot. */}
            <span aria-hidden className="size-[10px] rounded-full bg-recording" />
            {recordLabel}
          </button>
          {recordingFps && <RecordingFpsSwitch {...recordingFps} />}
        </div>

        {projects && <ProjectList {...projects} />}
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

/** A-01: 60fps exports need 60fps recordings; the choice is remembered (settings). */
function RecordingFpsSwitch({ value, onChange }: NonNullable<HomeProps['recordingFps']>) {
  const t = useT()
  const labelId = useId()
  const on = value === 60
  return (
    <div className="flex max-w-[360px] items-center gap-sm">
      <SourceSwitch on={on} labelId={labelId} onClick={() => onChange(on ? 30 : 60)} />
      <div className="flex flex-col">
        <span id={labelId} className="text-body">
          {t('home.recordingFps.label')}
        </span>
        <span className="text-label text-on-surface-muted">{t('home.recordingFps.hint')}</span>
      </div>
    </div>
  )
}

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
        <span className="min-w-0 truncate text-title" title={name}>
          {name}
        </span>
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
