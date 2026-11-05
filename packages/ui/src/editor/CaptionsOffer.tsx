// The Captions section before there is a transcript (A-05, A-06): an invitation, not a notice.
// A small "video" with a caption on it shows what you get, three short reasons, one clear
// action, and the pack's download size as a quiet note (rule 6: nothing downloads on its own).
import { formatFileSize, resolveLocale } from '@kamo/i18n'
import { useLocale, useT } from '../i18n.tsx'
import { TranscriptStatus } from '../packs/CardTranscription.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { CheckIcon } from '../primitives/icons.tsx'
import type { EditorTranscription } from './CaptionsSection.tsx'

const POINTS = [
  'editor.captions.offer.local',
  'editor.captions.offer.fix',
  'editor.captions.offer.styles',
] as const

export function CaptionsOffer({ transcription }: { transcription: EditorTranscription }) {
  const t = useT()
  const locale = resolveLocale([useLocale()])
  const { state } = transcription.state
  const running = state === 'running' || state === 'queued'
  const pack = transcription.pack
  const size = pack ? formatFileSize(locale, pack.sizeBytes) : null

  return (
    <div
      data-testid="captions-offer"
      className="flex flex-col gap-md rounded-lg border border-border bg-surface-raised p-md"
    >
      <CaptionPreview sample={t('editor.captions.sample')} />
      <div className="flex flex-col gap-xs">
        <h3 className="text-body font-semibold text-on-surface">
          {t('editor.captions.offer.title')}
        </h3>
        <ul className="flex flex-col gap-[6px]">
          {POINTS.map((key) => (
            <li key={key} className="flex items-start gap-xs text-label text-on-surface-muted">
              <span aria-hidden className="mt-[1px] shrink-0 text-tertiary">
                <CheckIcon size={14} />
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* "Transcribed" without a transcript file says nothing useful: leave it out. */}
      {state !== 'done' && state !== 'none' && (
        <TranscriptStatus transcript={transcription.state} />
      )}

      {state === 'no_audio' ? null : running ? (
        <button
          type="button"
          data-testid="captions-cancel"
          onClick={transcription.onCancel}
          className={`rounded-md bg-surface px-md py-sm text-body transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`}
        >
          {t('transcription.cancel')}
        </button>
      ) : (
        <div className="flex flex-col gap-[6px]">
          <button
            type="button"
            data-testid="captions-transcribe"
            onClick={() => transcription.onTranscribe()}
            className={`rounded-md border border-primary bg-primary-container px-md py-sm text-body font-semibold text-on-surface transition-colors duration-[120ms] hover:bg-primary ${FOCUS_RING}`}
          >
            {t(
              transcription.hasPack
                ? 'editor.captions.offer.transcribe'
                : 'editor.captions.offer.create',
            )}
          </button>
          {!transcription.hasPack && size && (
            <p
              data-testid="captions-needs-pack"
              className="text-center text-label text-on-surface-muted"
            >
              {t(
                pack?.sizeExact
                  ? 'editor.captions.offer.sizeExact'
                  : 'editor.captions.offer.sizeApprox',
                { size },
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** A tiny stand-in video: a screen with a few lines, and a caption on it in Kamo's style. */
function CaptionPreview({ sample }: { sample: string }) {
  return (
    <div
      aria-hidden
      className="relative aspect-video overflow-hidden rounded-md bg-gradient-to-br from-tertiary-container to-primary-container"
    >
      <div className="absolute inset-x-[12%] top-[14%] bottom-[30%] flex flex-col gap-[6px] rounded-sm bg-surface/80 p-[8px] shadow-[0_4px_12px_rgb(0_0_0/0.08)]">
        <span className="h-[6px] w-1/2 rounded-full bg-border" />
        <span className="h-[6px] w-3/4 rounded-full bg-border" />
        <span className="h-[6px] w-2/5 rounded-full bg-border" />
      </div>
      <span className="absolute inset-x-0 bottom-[10%] flex justify-center">
        <span className="rounded-md bg-primary px-[10px] py-[3px] text-label font-semibold text-on-primary shadow-[0_2px_6px_rgb(0_0_0/0.12)]">
          {sample}
        </span>
      </span>
    </div>
  )
}
