import {
  generateZooms,
  parseEvents,
  parseTranscript,
  type ExportRecord,
  type MouseEventRecord,
  type Project,
  type Transcript,
} from '@kamo/core'
import {
  Editor,
  EditorStatus,
  type BackgroundImagePlatform,
  type EditorTranscription,
} from '@kamo/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { boot } from './boot.tsx'
import { ipcErrorCode } from '../../shared/api.ts'
import { desktopExportPlatform } from './export-platform.ts'
import { useHomeTranscription } from './transcription/useHomeTranscription.tsx'

const AUTOSAVE_DELAY_MS = 400

const mediaUrl = (projectId: string, file: string) =>
  `kamo-media://project/${encodeURIComponent(projectId)}/${encodeURIComponent(file)}`

/** A-04: main shows the dialog and copies the image into the project. */
function desktopBackgroundImage(projectId: string): BackgroundImagePlatform {
  return {
    url: (file) => mediaUrl(projectId, file),
    async pick() {
      try {
        const file = await window.kamo.pickBackgroundImage(projectId)
        return file ? { kind: 'picked', file } : { kind: 'cancelled' }
      } catch (error) {
        const code = ipcErrorCode(error)
        return {
          kind: 'error',
          code:
            code === 'image_unsupported'
              ? 'unsupported'
              : code === 'image_too_big'
                ? 'too_big'
                : 'unreadable',
        }
      }
    },
  }
}

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; project: Project; events: MouseEventRecord[] }

/** transcript.json (A-05), or null when there is none or it cannot be read. */
async function loadTranscript(projectId: string): Promise<Transcript | null> {
  const text = await window.kamo.loadTranscript(projectId).catch(() => null)
  return text === null ? null : parseTranscript(text)
}

/**
 * Editor page: loads the project and its transcript, generates zooms on first open (F-05) and
 * autosaves both (caption edits correct transcript.json, A-06).
 */
function DesktopEditor({ projectId }: { projectId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const pending = useRef<Project | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // A-06: the transcript the editor started with or a transcription replaced; caption edits
  // are saved on their own timer and never handed back (that would reset the undo steps).
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const pendingTranscript = useRef<Transcript | null>(null)
  const transcriptTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const transcription = useHomeTranscription()
  // Export history lives outside the editor's undo history (data-model.md: project.exports);
  // once something is exported, every save carries the up-to-date list.
  const exportsRef = useRef<ExportRecord[] | null>(null)
  const latest = useRef<Project | null>(null)
  const exporting = useRef(false)

  const withExports = (project: Project): Project =>
    exportsRef.current ? { ...project, exports: exportsRef.current } : project

  const flushTranscript = async () => {
    clearTimeout(transcriptTimer.current)
    const next = pendingTranscript.current
    pendingTranscript.current = null
    if (next) {
      await window.kamo.saveTranscript(projectId, next).catch((error: unknown) => {
        console.error('kamo: transcript save failed', error)
      })
    }
  }

  const flush = async () => {
    clearTimeout(timer.current)
    const project = pending.current
    pending.current = null
    await flushTranscript()
    if (project) await window.kamo.saveProject(withExports(project))
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [loaded, text, transcriptOnDisk] = await Promise.all([
          window.kamo.loadProject(projectId),
          window.kamo.loadEvents(projectId),
          loadTranscript(projectId),
        ])
        if (!cancelled) setTranscript(transcriptOnDisk)
        const { events } = parseEvents(text)
        let project = loaded
        // First open: turn the clicks into zooms and keep them (data-model.md rules).
        if (project.zooms.length === 0 && events.length > 0) {
          const { zooms } = generateZooms({
            events,
            video: { width: project.source.width, height: project.source.height },
            durationMs: project.durationMs,
          })
          if (zooms.length > 0) {
            project = { ...project, zooms }
            await window.kamo.saveProject(project)
          }
        }
        latest.current = project
        if (!cancelled) setState({ kind: 'ready', project, events })
      } catch {
        if (!cancelled) setState({ kind: 'failed' })
      }
    })()
    const onUnload = (event: BeforeUnloadEvent) => {
      // F-11: closing mid-export asks first (main shows the question and decides).
      void flush()
      if (exporting.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [projectId])

  const ready = state.kind === 'ready'
  const micEnabled = ready && state.project.audio.mic.enabled
  const systemEnabled = ready && state.project.audio.system.enabled
  const webcamEnabled = ready && state.project.webcam !== null
  const exportPlatform = useMemo(
    () =>
      desktopExportPlatform({
        projectId,
        micEnabled,
        systemEnabled,
        webcamEnabled,
        onExported: (record) => {
          const project = latest.current
          if (!project) return
          exportsRef.current = [...(exportsRef.current ?? project.exports), record]
          pending.current = project
          void flush()
        },
        onBusyChange: (busy) => {
          exporting.current = busy
          void window.kamo.setExportInProgress(busy)
        },
      }),
    // flush only reads refs, so the platform is rebuilt only when the media changes.
    [projectId, micEnabled, systemEnabled, webcamEnabled],
  )

  const backgroundImagePlatform = useMemo(() => desktopBackgroundImage(projectId), [projectId])

  // A transcription of this recording finished while the editor is open (started here or on
  // Home): its text becomes the captions'. Unsaved caption edits go: replacing them was agreed.
  const jobState = transcription.jobs.find((j) => j.projectId === projectId)?.state
  const lastJobState = useRef(jobState)
  useEffect(() => {
    const before = lastJobState.current
    lastJobState.current = jobState
    const ran = before === 'queued' || before === 'preparing' || before === 'transcribing'
    if (jobState !== 'done' || !ran) return
    let live = true
    pendingTranscript.current = null
    clearTimeout(transcriptTimer.current)
    void loadTranscript(projectId).then((next) => {
      if (live && next) setTranscript(next)
    })
    return () => {
      live = false
    }
  }, [jobState, projectId])

  const projectTranscript = state.kind === 'ready' ? state.project.transcript.status : 'none'
  const editorTranscription: EditorTranscription = {
    state: transcription.stateOf({ id: projectId, transcript: projectTranscript }),
    hasPack: transcription.hasPack,
    pack: transcription.lightPack,
    onTranscribe: (options) => transcription.onTranscribe(projectId, options),
    onCancel: () => transcription.onCancelTranscription(projectId),
  }

  if (state.kind !== 'ready') {
    return <EditorStatus state={state.kind} onBack={() => void window.kamo.openHome()} />
  }

  return (
    <>
      <Editor
        project={state.project}
        events={state.events}
        videoUrl={`kamo-media://project/${encodeURIComponent(projectId)}/screen.mp4`}
        webcamUrl={
          webcamEnabled
            ? `kamo-media://project/${encodeURIComponent(projectId)}/webcam.mp4`
            : undefined
        }
        audioUrls={{
          mic: micEnabled ? mediaUrl(projectId, 'audio.m4a') : undefined,
          system: systemEnabled ? mediaUrl(projectId, 'system.m4a') : undefined,
        }}
        exportPlatform={exportPlatform}
        backgroundImage={backgroundImagePlatform}
        onChange={(project) => {
          latest.current = project
          setState({ ...state, project })
          pending.current = project
          clearTimeout(timer.current)
          timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
        }}
        onBack={() => void flush().then(() => window.kamo.openHome())}
        transcript={transcript}
        onTranscriptChange={(next) => {
          pendingTranscript.current = next
          clearTimeout(transcriptTimer.current)
          transcriptTimer.current = setTimeout(() => void flushTranscript(), AUTOSAVE_DELAY_MS)
        }}
        transcription={editorTranscription}
      />
      {transcription.offer}
    </>
  )
}

const params = new URLSearchParams(location.search)
const projectId = params.get('project') ?? ''
// Smoke test only (main passes it with --smoke-test): drives a real export end to end.
if (params.get('smoke') === 'export') {
  void import('./smoke-export.ts').then((smoke) => smoke.installExportSmoke(projectId))
}
await boot(() => <DesktopEditor projectId={projectId} />)
