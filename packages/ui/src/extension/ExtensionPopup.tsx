// The extension popup (flows.md → Chrome extension → Popup, 360px wide). It knows nothing about
// Chrome: the extension passes the state in and gets the user's choices back (rule 1).
//
// Hierarchy: small mascot + the tab to record → Record → microphone and tab sound → latest
// projects. While recording it becomes the control: timecode, pause, stop.
import { formatDate, formatDuration, formatTimecode, resolveLocale } from '@kamo/i18n'
import { useEffect, useState, type ReactNode } from 'react'
import {
  InterruptedRecordings,
  type InterruptedRecordingData,
  type RecoveryOutcome,
} from '../home/InterruptedRecordings.tsx'
import { useLocale, useT } from '../i18n.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { FOCUS_RING, IconButton, Switch } from '../primitives/controls.tsx'
import { CloseIcon, PauseIcon, PlayIcon, StopIcon } from '../primitives/icons.tsx'
import type { RecordingClock } from '../recording/RecordingBar.tsx'
import { useSpring } from '../motion/useSpring.ts'

export type PopupPhase =
  | { kind: 'idle' }
  | { kind: 'countdown'; value: number }
  | { kind: 'starting' }
  | { kind: 'recording'; clock: RecordingClock }
  | { kind: 'saving' }

export interface PopupTab {
  /** The page title, shown as-is (user content). */
  title: string
  /** False for `chrome://` pages and the Web Store, which Chrome doesn't let anyone record. */
  recordable: boolean
}

export interface PopupProject {
  id: string
  name: string
  /** ISO date */
  createdAt: string
  durationMs: number
  /** Object URL of the first reference thumbnail, if any. */
  thumbnailUrl: string | null
}

export interface PopupNotice {
  /** i18n key */
  key: string
  tone: 'success' | 'warning' | 'error'
}

export interface ExtensionPopupProps {
  phase: PopupPhase
  /** null while the active tab is still being read. */
  tab: PopupTab | null
  microphone: boolean
  tabAudio: boolean
  onMicrophoneChange(on: boolean): void
  onTabAudioChange(on: boolean): void
  onRecord(): void
  /** Cancels the countdown. */
  onCancel(): void
  onPause(): void
  onResume(): void
  onStop(): void
  /** The stop shortcut as the browser shows it (e.g. "Ctrl+Shift+2"), when one is set. */
  stopShortcut?: string | undefined
  notices: readonly PopupNotice[]
  onDismissNotices(): void
  /** Latest projects, newest first (at most 3). */
  recent: readonly PopupProject[]
  interrupted: readonly InterruptedRecordingData[]
  onRecover(projectId: string): Promise<RecoveryOutcome>
  onDiscard(projectId: string): Promise<RecoveryOutcome>
}

export function ExtensionPopup(props: ExtensionPopupProps) {
  const { phase } = props
  return (
    <main className="flex w-[360px] flex-col gap-md bg-background p-md font-sans text-on-surface">
      <Header tab={props.tab} />
      {props.notices.length > 0 && (
        <Notices notices={props.notices} onDismiss={props.onDismissNotices} />
      )}
      {phase.kind === 'idle' && <Ready {...props} />}
      {phase.kind === 'countdown' && <CountingDown value={phase.value} onCancel={props.onCancel} />}
      {(phase.kind === 'starting' || phase.kind === 'saving') && (
        <Busy
          label={phase.kind === 'starting' ? 'extension.popup.starting' : 'extension.popup.saving'}
        />
      )}
      {phase.kind === 'recording' && (
        <Recording
          clock={phase.clock}
          onPause={props.onPause}
          onResume={props.onResume}
          onStop={props.onStop}
          stopShortcut={props.stopShortcut}
        />
      )}
    </main>
  )
}

function Header({ tab }: { tab: PopupTab | null }) {
  const t = useT()
  return (
    <header className="flex items-center gap-sm">
      <Mascot pose="head-look" size={36} />
      <div className="flex min-w-0 flex-col">
        <span className="text-label text-on-surface-muted">{t('extension.popup.tabToRecord')}</span>
        <span className="truncate text-title" title={tab?.title}>
          {tab?.title || ' '}
        </span>
      </div>
    </header>
  )
}

function Ready(props: ExtensionPopupProps) {
  const t = useT()
  const recordable = props.tab?.recordable ?? false
  return (
    <>
      <div className="flex flex-col gap-sm">
        <button
          type="button"
          disabled={!recordable}
          onClick={props.onRecord}
          aria-describedby={recordable ? undefined : 'unrecordable'}
          className={`flex items-center justify-center gap-sm rounded-md bg-primary px-[20px] py-[12px] text-title text-on-primary transition-colors duration-[120ms] hover:bg-[#97CB90] disabled:opacity-50 disabled:hover:bg-primary ${FOCUS_RING}`}
        >
          <span aria-hidden className="size-[10px] rounded-full bg-recording" />
          {t('extension.popup.record')}
        </button>
        {props.tab && !recordable && (
          <p id="unrecordable" className="text-label text-on-surface-muted">
            {t('extension.popup.unrecordable')}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-sm rounded-lg bg-surface p-md">
        <Switch
          label={t('home.audio.microphone')}
          checked={props.microphone}
          onChange={props.onMicrophoneChange}
        />
        <Switch
          label={t('extension.popup.tabSound')}
          checked={props.tabAudio}
          onChange={props.onTabAudioChange}
        />
      </div>
      <InterruptedRecordings
        recordings={props.interrupted}
        onRecover={props.onRecover}
        onDiscard={props.onDiscard}
        discardTo="deletion"
      />
      <Recent projects={props.recent} />
    </>
  )
}

function Recent({ projects }: { projects: readonly PopupProject[] }) {
  const t = useT()
  const locale = resolveLocale([useLocale()])
  return (
    <section className="flex flex-col gap-sm" aria-labelledby="recent-title">
      <h2 id="recent-title" className="text-label text-on-surface-muted">
        {t('extension.popup.recent')}
      </h2>
      {projects.length === 0 ? (
        <p className="text-body text-on-surface-muted">{t('extension.popup.noRecent')}</p>
      ) : (
        <ul className="flex flex-col gap-xs">
          {projects.map((project) => (
            <li key={project.id} className="flex items-center gap-sm">
              <span className="flex h-[36px] w-[64px] shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-raised">
                {project.thumbnailUrl && (
                  <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body">{project.name}</span>
                <span className="font-mono text-label text-on-surface-muted">
                  {t('extension.popup.projectMeta', {
                    duration: formatDuration(locale, project.durationMs),
                    date: formatDate(locale, new Date(project.createdAt), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }),
                  })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CountingDown({ value, onCancel }: { value: number; onCancel(): void }) {
  const t = useT()
  const locale = resolveLocale([useLocale()])
  const scale = useSpring(1, 1.2, value)
  return (
    <div className="flex flex-col items-center gap-md py-sm">
      <div className="flex size-[120px] items-center justify-center rounded-full bg-surface shadow-[0_8px_24px_rgb(0_0_0/0.12)]">
        <span
          aria-live="assertive"
          className="font-serif text-[72px] leading-none"
          style={{ transform: `scale(${scale})` }}
        >
          {new Intl.NumberFormat(locale).format(value)}
        </span>
      </div>
      <p className="text-label text-on-surface-muted">{t('countdown.cancelHint')}</p>
      <button
        type="button"
        onClick={onCancel}
        className={`rounded-md bg-surface-raised px-[14px] py-[7px] text-body font-semibold transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`}
      >
        {t('common.cancel')}
      </button>
    </div>
  )
}

function Busy({ label }: { label: string }) {
  const t = useT()
  return (
    <p role="status" className="py-lg text-center text-body text-on-surface-muted">
      {t(label)}
    </p>
  )
}

function Recording({
  clock,
  onPause,
  onResume,
  onStop,
  stopShortcut,
}: {
  clock: RecordingClock
  onPause(): void
  onResume(): void
  onStop(): void
  stopShortcut?: string | undefined
}) {
  const t = useT()
  const paused = clock.state === 'paused'
  const timecode = formatTimecode(useElapsed(clock), clock.fps)
  const split = timecode.lastIndexOf(':')
  return (
    <div className="flex flex-col items-center gap-md py-sm">
      <span className="flex items-center gap-[10px]">
        <span
          aria-hidden
          className={`size-[10px] rounded-full ${paused ? 'bg-on-surface-muted' : 'kamo-motion animate-[kamo-rec-pulse_1.2s_ease-in-out_infinite_alternate] bg-recording'}`}
        />
        <span
          aria-live="polite"
          className={`text-label uppercase tracking-[0.08em] ${paused ? 'text-on-surface-muted' : ''}`}
        >
          {t(paused ? 'recording.paused' : 'recording.rec')}
        </span>
      </span>
      <span className="font-mono text-[28px] tabular-nums" aria-hidden>
        {timecode.slice(0, split)}
        <span className="text-on-surface-muted">{timecode.slice(split)}</span>
      </span>
      <div className="flex items-center gap-sm">
        <RoundButton
          label={t(paused ? 'recording.resume' : 'recording.pause')}
          onClick={paused ? onResume : onPause}
        >
          {paused ? <PlayIcon size={20} /> : <PauseIcon size={20} />}
        </RoundButton>
        <RoundButton label={t('recording.stop')} onClick={onStop} strong>
          <StopIcon size={20} />
        </RoundButton>
      </div>
      {stopShortcut && (
        <p className="text-label text-on-surface-muted">
          {t('countdown.stopHint', { shortcut: stopShortcut })}
        </p>
      )}
    </div>
  )
}

function RoundButton({
  label,
  onClick,
  strong = false,
  children,
}: {
  label: string
  onClick(): void
  strong?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex size-[48px] items-center justify-center rounded-full transition-colors duration-[120ms] ${FOCUS_RING} ${
        strong
          ? 'bg-on-surface text-surface-raised hover:opacity-85'
          : 'bg-surface text-on-surface hover:bg-border'
      }`}
    >
      {children}
    </button>
  )
}

function Notices({ notices, onDismiss }: { notices: readonly PopupNotice[]; onDismiss(): void }) {
  const t = useT()
  const color = { success: 'text-success', warning: 'text-warning', error: 'text-error' }
  return (
    <div className="flex items-start gap-sm rounded-md bg-surface px-md py-sm">
      <ul className="flex flex-1 flex-col gap-xs">
        {notices.map((notice, index) => (
          <li
            key={`${notice.key}-${index}`}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`text-body ${color[notice.tone]}`}
          >
            {t(notice.key)}
          </li>
        ))}
      </ul>
      <IconButton label={t('common.close')} onClick={onDismiss}>
        <CloseIcon />
      </IconButton>
    </div>
  )
}

function useElapsed(clock: RecordingClock): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (clock.state !== 'recording') return
    let frame = requestAnimationFrame(function tick() {
      setNow(Date.now())
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [clock])
  return clock.state === 'recording'
    ? clock.elapsedMs + Math.max(0, now - clock.at)
    : clock.elapsedMs
}
