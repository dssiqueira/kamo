// A project card's transcription (A-05): the "Transcribe" button and, while it runs or once it
// is done, a one-line status. Discreet: nothing shows until the user asks for it.
import { useT } from '../i18n.tsx'
import { IconButton } from '../primitives/controls.tsx'
import type { CardTranscriptState } from './types.ts'

const FAILURE_KEYS: Record<string, string> = {
  pack_missing: 'transcription.errors.packMissing',
  audio_unreadable: 'transcription.errors.audioUnreadable',
}

/** Lines of text with a speech bubble: "transcribe". */
export function TranscriptIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
      <path d="M5 6h6M5 8.25h4" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width={16} height={16} fill="currentColor">
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />
    </svg>
  )
}

/** The card's icon button: Transcribe / Transcribe again, or Stop while it runs. */
export function TranscribeButton({
  transcript,
  onTranscribe,
  onCancel,
}: {
  transcript: CardTranscriptState
  onTranscribe(): void
  onCancel(): void
}) {
  const t = useT()
  if (transcript.state === 'queued' || transcript.state === 'running') {
    return (
      <IconButton label={t('transcription.cancel')} onClick={onCancel}>
        <StopIcon />
      </IconButton>
    )
  }
  if (transcript.state === 'no_audio') return null
  return (
    <IconButton
      label={t(transcript.state === 'done' ? 'transcription.again' : 'transcription.action')}
      onClick={onTranscribe}
    >
      <TranscriptIcon />
    </IconButton>
  )
}

/** One status line under the card's date; nothing before the first transcription. */
export function TranscriptStatus({ transcript }: { transcript: CardTranscriptState }) {
  const t = useT()
  switch (transcript.state) {
    case 'none':
      return null
    case 'queued':
      return <p className="text-label text-on-surface-muted">{t('transcription.status.queued')}</p>
    case 'running':
      return (
        <p role="status" className="text-label text-on-surface-muted">
          {t('transcription.status.running', { progress: transcript.progress })}
        </p>
      )
    case 'done':
      return <p className="text-label text-success">{t('transcription.status.done')}</p>
    case 'no_audio':
      return <p className="text-label text-on-surface-muted">{t('transcription.status.noAudio')}</p>
    case 'failed':
      return (
        <p role="alert" className="text-label text-error">
          {t((transcript.error && FAILURE_KEYS[transcript.error]) || 'transcription.status.failed')}
        </p>
      )
  }
}
