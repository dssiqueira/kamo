import {
  generateZooms,
  parseEvents,
  type ExportRecord,
  type MouseEventRecord,
  type Project,
} from '@kamo/core'
import { Editor, useT } from '@kamo/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { boot } from './boot.tsx'
import { desktopExportPlatform } from './export-platform.ts'

const AUTOSAVE_DELAY_MS = 400

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; project: Project; events: MouseEventRecord[] }

/** Editor page: loads the project, generates zooms on first open (F-05) and autosaves. */
function DesktopEditor({ projectId }: { projectId: string }) {
  const t = useT()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const pending = useRef<Project | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Export history lives outside the editor's undo history (data-model.md: project.exports);
  // once something is exported, every save carries the up-to-date list.
  const exportsRef = useRef<ExportRecord[] | null>(null)
  const latest = useRef<Project | null>(null)
  const exporting = useRef(false)

  const withExports = (project: Project): Project =>
    exportsRef.current ? { ...project, exports: exportsRef.current } : project

  const flush = async () => {
    clearTimeout(timer.current)
    const project = pending.current
    pending.current = null
    if (project) await window.kamo.saveProject(withExports(project))
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [loaded, text] = await Promise.all([
          window.kamo.loadProject(projectId),
          window.kamo.loadEvents(projectId),
        ])
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
  const exportPlatform = useMemo(
    () =>
      desktopExportPlatform({
        projectId,
        micEnabled,
        systemEnabled,
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
    [projectId, micEnabled, systemEnabled],
  )

  if (state.kind !== 'ready') {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-md bg-background font-sans text-on-surface">
        <p className="text-body text-on-surface-muted">
          {t(state.kind === 'loading' ? 'editor.loading' : 'editor.errors.load')}
        </p>
        {state.kind === 'failed' && (
          <button
            type="button"
            onClick={() => void window.kamo.openHome()}
            className="rounded-md bg-surface-raised px-md py-sm text-body focus-visible:outline-2 focus-visible:outline-tertiary"
          >
            {t('editor.back')}
          </button>
        )}
      </main>
    )
  }

  return (
    <Editor
      project={state.project}
      events={state.events}
      videoUrl={`kamo-media://project/${encodeURIComponent(projectId)}/screen.mp4`}
      exportPlatform={exportPlatform}
      onChange={(project) => {
        latest.current = project
        setState({ ...state, project })
        pending.current = project
        clearTimeout(timer.current)
        timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
      }}
      onBack={() => void flush().then(() => window.kamo.openHome())}
    />
  )
}

const params = new URLSearchParams(location.search)
const projectId = params.get('project') ?? ''
// Smoke test only (main passes it with --smoke-test): drives a real export end to end.
if (params.get('smoke') === 'export') {
  void import('./smoke-export.ts').then((smoke) => smoke.installExportSmoke(projectId))
}
await boot(() => <DesktopEditor projectId={projectId} />)
