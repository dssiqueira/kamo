// Home's side of local transcription (A-05): the project cards' "Transcribe" button and status,
// and the offer to download a pack when none is installed. The list of packs is fetched only
// when that offer opens (a user click), never on its own.
import { TranscribeOffer, type CardTranscriptState } from '@kamo/ui'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ProjectSummary } from '../../../shared/api.ts'
import type { TranscriptionJob } from '../../../shared/packs.ts'
import { usePacks } from './usePacks.ts'

export interface HomeTranscription {
  /** A card's state: this session's job first, then project.json. */
  stateOf(project: Pick<ProjectSummary, 'id' | 'transcript'>): CardTranscriptState
  onTranscribe(projectId: string): void
  onCancelTranscription(projectId: string): void
  /** The download offer (a dialog; renders nothing while closed). */
  offer: ReactNode
}

export function useHomeTranscription(): HomeTranscription {
  const [jobs, setJobs] = useState<TranscriptionJob[]>([])
  const [autoTranscribe, setAutoTranscribe] = useState<boolean | undefined>(undefined)
  const [offerFor, setOfferFor] = useState<string | null>(null)
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

  const transcribe = useCallback((projectId: string) => {
    void window.kamo.transcribeProject(projectId).catch(() => {})
  }, [])

  const { refresh } = packs
  const onTranscribe = useCallback(
    (projectId: string) => {
      if (hasPack) return transcribe(projectId)
      // No pack yet: explain it and offer the download (flows.md §5).
      setOfferFor(projectId)
      refresh()
    },
    [hasPack, transcribe, refresh],
  )

  const onReady = useCallback(() => {
    if (offerFor) transcribe(offerFor)
    setOfferFor(null)
  }, [offerFor, transcribe])

  const offer = packs.status ? (
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
      onClose={() => setOfferFor(null)}
    />
  ) : null

  return {
    stateOf,
    onTranscribe,
    onCancelTranscription: (projectId) =>
      void window.kamo.cancelTranscription(projectId).catch(() => {}),
    offer,
  }
}
