import {
  type CaptionPosition,
  type CaptionSettings,
  type CaptionSize,
  type Transcript,
} from '@kamo/core'
import { formatFileSize, resolveLocale } from '@kamo/i18n'
import type { ReactNode, RefObject } from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { DesktopAppCard, useDesktopAppUrl } from '../extension/DesktopAppCard.tsx'
import { TranscriptStatus } from '../packs/CardTranscription.tsx'
import type { CardTranscriptState, PackView } from '../packs/types.ts'
import { FOCUS_RING, Switch } from '../primitives/controls.tsx'
import { CaptionStyleGallery } from './CaptionStyleGallery.tsx'

/**
 * The editor's door to local transcription (A-05) for the captions (A-06). The app decides
 * what Transcribe does: with no pack installed it shows the download offer.
 */
export interface EditorTranscription {
  /** this recording's transcription, like a project card shows it */
  state: CardTranscriptState
  /** a transcription pack is installed */
  hasPack: boolean
  /** the lighter pack, to say its size before any download; null until known */
  pack: Pick<PackView, 'sizeBytes' | 'sizeExact'> | null
  /** `replaceEdited`: the user agreed to lose the caption fixes (A-06) */
  onTranscribe(options?: { replaceEdited?: boolean }): void
  onCancel(): void
}

export interface CaptionsSectionProps {
  settings: CaptionSettings
  /** null: no transcript yet */
  transcript: Transcript | null
  transcription?: EditorTranscription | undefined
  onCaptions(patch: Partial<CaptionSettings>): void
  /** "Transcribe again": the editor asks first when the transcript was corrected */
  onTranscribeAgain(): void
  /** the editor's video, for the style gallery's thumbnails (the frame at the playhead) */
  video?: RefObject<HTMLVideoElement | null> | undefined
  /** the playhead, ms of video time: the gallery samples the caption there */
  timeMs?: number | undefined
}
const POSITIONS: readonly CaptionPosition[] = ['bottom', 'middle']
const POSITION_KEY: Record<CaptionPosition, string> = {
  bottom: 'editor.captions.bottom',
  middle: 'editor.captions.middle',
}
const SIZES: readonly CaptionSize[] = ['small', 'medium', 'large']
const SIZE_KEY: Record<CaptionSize, string> = {
  small: 'editor.captions.small',
  medium: 'editor.captions.medium',
  large: 'editor.captions.large',
}

const option = (selected: boolean) =>
  `rounded-md border text-label transition-colors duration-[120ms] disabled:opacity-50 ${FOCUS_RING} ${
    selected
      ? 'border-tertiary bg-tertiary-container text-on-surface'
      : 'border-border bg-surface text-on-surface-muted hover:bg-surface-raised'
  }`

/**
 * Captions (A-06) in the side panel: before a transcript, what captions need (the pack and
 * its size, or the Transcribe button); after, on/off, the style gallery, position and size.
 */
export function CaptionsSection({
  settings,
  transcript,
  transcription,
  onCaptions,
  onTranscribeAgain,
  video,
  timeMs,
}: CaptionsSectionProps) {
  const t = useT()
  const locale = resolveLocale([useLocale()])
  const running =
    transcription?.state.state === 'running' || transcription?.state.state === 'queued'
  const pack = transcription?.pack
  const packSize = pack
    ? pack.sizeExact
      ? formatFileSize(locale, pack.sizeBytes)
      : t('packs.sizeApprox', { size: formatFileSize(locale, pack.sizeBytes) })
    : null

  if (!transcript) {
    if (!transcription) return null
    return (
      <Section title={t('editor.captions.title')}>
        <p className="text-body text-on-surface-muted">{t('editor.captions.fromTranscript')}</p>
        {!transcription.hasPack && !running && packSize && (
          <p className="text-label text-on-surface-muted" data-testid="captions-needs-pack">
            {t('editor.captions.needsPack', { size: packSize })}
          </p>
        )}
        {/* "Transcribed" without a transcript file says nothing useful: leave it out. */}
        {transcription.state.state !== 'done' && (
          <TranscriptStatus transcript={transcription.state} />
        )}
        <TranscribeAction transcription={transcription} onTranscribe={transcription.onTranscribe} />
      </Section>
    )
  }

  const hasSpeech = transcript.segments.length > 0
  return (
    <Section title={t('editor.captions.title')}>
      {hasSpeech ? (
        <>
          <Switch
            label={t('editor.captions.show')}
            checked={settings.enabled}
            onChange={(enabled) => onCaptions({ enabled })}
          />
          <CaptionStyleGallery
            value={settings.preset}
            onChange={(preset) => onCaptions({ preset })}
            disabled={!settings.enabled}
            transcript={transcript}
            position={settings.position}
            video={video}
            timeMs={timeMs}
          />
          <Group label={t('editor.captions.position')}>
            <div className="grid grid-cols-2 gap-xs">
              {POSITIONS.map((position) => (
                <button
                  key={position}
                  type="button"
                  role="radio"
                  aria-checked={settings.position === position}
                  disabled={!settings.enabled}
                  data-testid={`captions-position-${position}`}
                  onClick={() => onCaptions({ position })}
                  className={`flex h-[40px] items-center justify-center gap-sm px-sm ${option(settings.position === position)}`}
                >
                  <PositionIcon position={position} selected={settings.position === position} />
                  <span>{t(POSITION_KEY[position])}</span>
                </button>
              ))}
            </div>
          </Group>
          <Group label={t('editor.captions.size')}>
            <div className="grid grid-cols-3 gap-xs">
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={settings.size === size}
                  disabled={!settings.enabled}
                  data-testid={`captions-size-${size}`}
                  onClick={() => onCaptions({ size })}
                  className={`px-sm py-xs ${option(settings.size === size)}`}
                >
                  {t(SIZE_KEY[size])}
                </button>
              ))}
            </div>
          </Group>
          <p className="text-label text-on-surface-muted">{t('editor.captions.editHint')}</p>
        </>
      ) : (
        <p className="text-body text-on-surface-muted">{t('editor.captions.noSpeech')}</p>
      )}
      {transcription && (
        <>
          <TranscriptStatus
            transcript={
              transcription.state.state === 'done' ? { state: 'none' } : transcription.state
            }
          />
          {running ? (
            <TranscribeAction transcription={transcription} onTranscribe={onTranscribeAgain} />
          ) : (
            <button
              type="button"
              data-testid="captions-transcribe-again"
              onClick={onTranscribeAgain}
              className={`self-start rounded-sm text-label text-tertiary-strong hover:underline ${FOCUS_RING}`}
            >
              {t('transcription.again')}
            </button>
          )}
        </>
      )}
    </Section>
  )
}

/** Transcribe (or download and transcribe), or Stop while it runs. */
function TranscribeAction({
  transcription,
  onTranscribe,
}: {
  transcription: EditorTranscription
  onTranscribe(): void
}) {
  const t = useT()
  const { state } = transcription.state
  if (state === 'no_audio') return null
  if (state === 'running' || state === 'queued') {
    return (
      <button
        type="button"
        data-testid="captions-cancel"
        onClick={transcription.onCancel}
        className={`self-start rounded-md bg-surface-raised px-md py-sm text-body transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`}
      >
        {t('transcription.cancel')}
      </button>
    )
  }
  return (
    <button
      type="button"
      data-testid="captions-transcribe"
      onClick={() => onTranscribe()}
      className={`self-start rounded-md bg-surface-raised px-md py-sm text-body transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`}
    >
      {t(transcription.hasPack ? 'transcription.action' : 'editor.captions.download')}
    </button>
  )
}

/** A tiny frame with a bar at the bottom or in the middle. */
function PositionIcon({ position, selected }: { position: CaptionPosition; selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative flex h-[16px] w-[22px] justify-center rounded-[3px] border-[1.5px] ${
        selected ? 'border-tertiary' : 'border-current'
      } ${position === 'bottom' ? 'items-end pb-[2px]' : 'items-center'}`}
    >
      <span
        className={`h-[3px] w-[12px] rounded-full ${selected ? 'bg-tertiary' : 'bg-current'}`}
      />
    </span>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-xs">
      <span className="text-body">{label}</span>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-sm" data-testid="captions-section">
      <h2 className="text-title">{title}</h2>
      {children}
    </section>
  )
}

/**
 * The Captions section where the app cannot transcribe (the extension): the same section, with
 * the pointer to the desktop app instead of the controls. Nothing when the app set no address.
 */
export function CaptionsElsewhere() {
  const t = useT()
  const url = useDesktopAppUrl()
  if (!url) return null
  return (
    <Section title={t('editor.captions.title')}>
      <DesktopAppCard url={url} variant="section" />
    </Section>
  )
}
