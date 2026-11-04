import { useEffect, useId, useState, type ReactNode } from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'

/** One source as Home shows it (F-04). */
export interface AudioSourceView {
  /** The toggle. */
  enabled: boolean
  status: 'off' | 'starting' | 'live' | 'denied' | 'unavailable' | 'unsupported'
}

/** Live levels, 0 to 1 (see audioLevel.ts). */
export interface AudioLevelsView {
  mic: number
  system: number
}

export interface MicrophoneOption {
  id: string
  /** OS label; empty when the OS gives none. */
  label: string
}

export interface AudioSourcesProps {
  mic: AudioSourceView
  system: AudioSourceView
  onToggleMic(enabled: boolean): void
  onToggleSystem(enabled: boolean): void
  /** Microphones; the picker only shows with more than one (F-04). */
  microphones: readonly MicrophoneOption[]
  /** null: the system default. */
  microphoneId: string | null
  onSelectMicrophone(id: string | null): void
  /**
   * Levels arrive 10 to 15 times a second; only the meters subscribe, so the rest of Home
   * does not re-render with them. Returns unsubscribe.
   */
  subscribeLevels(listener: (levels: AudioLevelsView) => void): () => void
}

/** Home toggles for the microphone and the computer sound, with live level meters (F-04). */
export function AudioSources(props: AudioSourcesProps) {
  const t = useT()
  const titleId = useId()
  const selectId = useId()
  const { mic, system, microphones, microphoneId, subscribeLevels } = props
  const [levels, setLevels] = useState<AudioLevelsView>({ mic: 0, system: 0 })
  useEffect(() => subscribeLevels(setLevels), [subscribeLevels])
  // A remembered microphone that is not plugged in reads as the default.
  const selected = microphones.some((m) => m.id === microphoneId) ? (microphoneId ?? '') : ''

  return (
    <section className="flex flex-col gap-md" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-title">
        {t('home.audio.title')}
      </h2>
      <div className="flex flex-wrap gap-md">
        <SourceCard
          label={t('home.audio.microphone')}
          source={mic}
          level={levels.mic}
          onToggle={props.onToggleMic}
          message={micMessage(mic, t)}
        >
          {mic.enabled && microphones.length > 1 && (
            <>
              <label htmlFor={selectId} className="sr-only">
                {t('home.audio.chooseMicrophone')}
              </label>
              <select
                id={selectId}
                value={selected}
                onChange={(event) => props.onSelectMicrophone(event.target.value || null)}
                className={`w-full truncate rounded-md border border-border bg-surface px-sm py-xs text-body ${FOCUS_RING}`}
              >
                <option value="">{t('home.audio.defaultMicrophone')}</option>
                {microphones.map((m, index) => (
                  <option key={m.id} value={m.id}>
                    {m.label || t('home.audio.microphoneName', { index: index + 1 })}
                  </option>
                ))}
              </select>
            </>
          )}
        </SourceCard>
        <SourceCard
          label={t('home.audio.system')}
          source={system}
          level={levels.system}
          onToggle={props.onToggleSystem}
          disabled={system.status === 'unsupported'}
          message={systemMessage(system, t)}
        />
      </div>
    </section>
  )
}

type Message = { tone: 'muted' | 'warning'; text: string } | null

function micMessage(source: AudioSourceView, t: (key: string) => string): Message {
  if (!source.enabled) return null
  if (source.status === 'denied') return { tone: 'warning', text: t('home.audio.micDenied') }
  if (source.status === 'unavailable') {
    return { tone: 'warning', text: t('home.audio.micUnavailable') }
  }
  return null
}

function systemMessage(source: AudioSourceView, t: (key: string) => string): Message {
  // Mac: computer sound needs ScreenCaptureKit audio, not built yet (D-024).
  if (source.status === 'unsupported') return { tone: 'muted', text: t('home.audio.systemSoon') }
  if (source.enabled && (source.status === 'unavailable' || source.status === 'denied')) {
    return { tone: 'warning', text: t('home.audio.systemUnavailable') }
  }
  return null
}

interface SourceCardProps {
  label: string
  source: AudioSourceView
  level: number
  onToggle(enabled: boolean): void
  disabled?: boolean
  message: Message
  children?: ReactNode
}

function SourceCard({
  label,
  source,
  level,
  onToggle,
  disabled,
  message,
  children,
}: SourceCardProps) {
  const t = useT()
  const labelId = useId()
  const on = source.enabled && !disabled
  return (
    <div className="flex w-[240px] flex-col gap-sm rounded-lg border-2 border-border bg-surface p-sm">
      <div className="flex items-center justify-between gap-sm">
        <span id={labelId} className="truncate text-title">
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          disabled={disabled}
          onClick={() => onToggle(!source.enabled)}
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
      </div>
      <LevelMeter
        label={t('home.audio.level', { source: label })}
        level={on && source.status === 'live' ? level : 0}
        active={on && source.status === 'live'}
      />
      {children}
      {message && (
        <p
          role={message.tone === 'warning' ? 'alert' : undefined}
          className={`text-label ${message.tone === 'warning' ? 'text-warning' : 'text-on-surface-muted'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}

/** Horizontal bar, redrawn 10 to 15 times a second; no transition, the data is the motion. */
function LevelMeter({ label, level, active }: { label: string; level: number; active: boolean }) {
  const value = Math.round(Math.min(1, Math.max(0, level)) * 100)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={`h-[6px] w-full overflow-hidden rounded-full bg-surface-raised ${active ? '' : 'opacity-50'}`}
    >
      <div
        className="h-full origin-left rounded-full bg-primary rtl:origin-right"
        style={{ transform: `scaleX(${value / 100})` }}
      />
    </div>
  )
}
