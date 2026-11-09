// Local transcription (A-05) for Home's project cards and the editor's Captions section
// (A-06): the "Transcribe" button and status, the offer to download a pack when none is
// installed, and the question before replacing a transcript corrected through the captions.
// Nothing is fetched to show the offer: a model downloads only from its Download click.
import {
  ReplaceTranscriptDialog,
  TranscribeOffer,
  type CardTranscriptState,
  type PackView,
} from '@kamo/ui'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ipcErrorCode, type ProjectSummary } from '../../../shared/api.ts'
import type { TranscriptionJob } from '../../../shared/packs.ts'
import { usePacks } from './usePacks.ts'

export interface TranscribeOptions {
  /** A-06: the user agreed to replace the caption fixes */
  replaceEdited?: boolean
}

export interface HomeTranscription {
  /** A card's state: this session's job first, then project.json. */
  stateOf(project: Pick<ProjectSummary, 'id' | 'transcript'>): CardTranscriptState
  onTranscribe(projectId: string, options?: TranscribeOptions): void
  onCancelTranscription(projectId: string): void
  /** A transcription pack is installed. */
  hasPack: boolean
  /** The lighter pack (its size); null before main answered. */
  lightPack: PackView | null
  /** This session's jobs, live. */
  jobs: TranscriptionJob[]
  /** The download offer and the replace question (dialogs; nothing shows while closed). */
  offer: ReactNode
}

export function useHomeTranscription(): HomeTranscription {
  const [jobs, setJobs] = useState<TranscriptionJob[]>([])
  const [autoTranscribe, setAutoTranscribe] = useState<boolean | undefined>(undefined)
  const [offerFor, setOfferFor] = useState<string | null>(null)
  /** The offer's pack is in and its project is transcribing: the offer follows it. */
  const [following, setFollowing] = useState(false)
  const [replaceFor, setReplaceFor] = useState<string | null>(null)
  const packs = usePacks()

  useEffect(() => {
    let alive = true
    void window.kamo.getTranscriptionJobs().then((next) => alive && setJobs(next))
    void window.kamo.getSettings().then((s) => alive && setAutoTranscribe(s.autoTranscribe))
    const offJobs = window.kamo.onTranscriptionChanged(setJobs)
    const offSettings = window.kamo.onSettingsChanged((s) => setAutoTranscribe(s.autoTranscribe))
    return () => {
      alive = false
      offJobs()
      offSettings()
    }
  }, [])

  const hasPack = packs.status?.packs.some((pack) => pack.installedVersion !== null) ?? false
  const lightPack = packs.status?.packs.find((pack) => pack.quality === 'light') ?? null

  const stateOf = useCallback(
    (project: Pick<ProjectSummary, 'id' | 'transcript'>): CardTranscriptState => {
      const job = jobs.find((j) => j.projectId === project.id)
      switch (job?.state) {
        case 'queued':
          return { state: 'queued' }
        case 'preparing':
        case 'transcribing':
          return { state: 'running', progress: job.progress }
        case 'failed':
          return { state: 'failed', error: job.error }
        case 'no_audio':
          return { state: 'no_audio' }
        default:
          break
      }
      if (project.transcript === 'done') return { state: 'done' }
      if (project.transcript === 'failed') return { state: 'failed', error: null }
      // Pending without a job: the app closed mid-way; it starts again with the pack.
      if (project.transcript === 'pending') return { state: 'queued' }
      return { state: 'none' }
    },
    [jobs],
  )

  const transcribe = useCallback((projectId: string, options: TranscribeOptions = {}) => {
    void window.kamo.transcribeProject(projectId, options).catch((error: unknown) => {
      // Corrected through the captions (A-06): ask before replacing the fixes (and close the
      // download offer, if it was following this transcript, so one dialog shows at a time).
      if (ipcErrorCode(error) === 'transcript_edited') {
        setOfferFor(null)
        setReplaceFor(projectId)
      }
    })
  }, [])

  const onTranscribe = useCallback(
    (projectId: string, options?: TranscribeOptions) => {
      if (hasPack) return transcribe(projectId, options)
      // No pack yet: explain it and offer the download (flows.md §5).
      setFollowing(false)
      setOfferFor(projectId)
    },
    [hasPack, transcribe],
  )

  // The pack is in: transcribe, and keep the offer open to follow it to "All set".
  const onReady = useCallback(() => {
    if (!offerFor) return
    transcribe(offerFor)
    setFollowing(true)
  }, [offerFor, transcribe])

  const offerJob = following ? jobs.find((job) => job.projectId === offerFor) : undefined
  const offerTranscript: CardTranscriptState | undefined = !following
    ? undefined
    : offerJob?.state === 'done'
      ? { state: 'done' }
      : offerJob?.state === 'failed'
        ? { state: 'failed', error: offerJob.error }
        : offerJob?.state === 'no_audio'
          ? { state: 'no_audio' }
          : offerJob?.state === 'preparing' || offerJob?.state === 'transcribing'
            ? { state: 'running', progress: offerJob.progress }
            : { state: 'queued' }
  const closeOffer = () => {
    setOfferFor(null)
    setFollowing(false)
  }

  const offer = (
    <>
      {packs.status && (
        <TranscribeOffer
          open={offerFor !== null}
          packs={packs.status}
          {...packs.actions}
          autoTranscribe={autoTranscribe}
          onAutoTranscribeChange={(value) => {
            setAutoTranscribe(value)
            void window.kamo.updateSettings({ autoTranscribe: value }).catch(() => {})
          }}
          onReady={onReady}
          {...(offerTranscript ? { transcript: offerTranscript } : {})}
          onClose={closeOffer}
        />
      )}
      <ReplaceTranscriptDialog
        open={replaceFor !== null}
        onReplace={() => {
          if (replaceFor) transcribe(replaceFor, { replaceEdited: true })
          setReplaceFor(null)
        }}
        onKeep={() => setReplaceFor(null)}
      />
    </>
  )

  return {
    stateOf,
    onTranscribe,
    onCancelTranscription: (projectId) =>
      void window.kamo.cancelTranscription(projectId).catch(() => {}),
    hasPack,
    lightPack,
    jobs,
    offer,
  }
}
