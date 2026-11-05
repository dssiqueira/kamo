// editor.html?project=<id> (E-03): the same editor as the desktop (packages/ui), on a project in
// OPFS. Loads the project, its clicks and its media, generates the zooms on first open (F-05),
// autosaves every edit (F-12) and exports to the downloads folder (E-04). Transcription is
// desktop-only: the Captions section points there.
import {
  generateZooms,
  loadProject,
  parseEvents,
  saveProject,
  type ExportRecord,
  type MouseEventRecord,
  type Project,
} from '@kamo/core'
import { formatTimecode } from '@kamo/i18n'
import {
  DesktopAppProvider,
  Editor,
  EditorStatus,
  FloatingNotices,
  useT,
  type ExportPlatform,
  type FloatingNoticeItem,
} from '@kamo/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { boot } from '../shared/boot.tsx'
import { DESKTOP_DOWNLOAD_URL } from '../shared/links.ts'
import { PROJECTS_PAGE } from '../shared/pages.ts'
import { OpfsProjectStore } from '../storage/opfs-store.ts'
import { extensionBackgroundImage, pruneBackgroundImages } from './background-image.ts'
import { downloadsSink, removeStaleExports, type FinishedDownload } from './downloads-sink.ts'
import { MediaUrlCache, loadProjectMedia, mediaUrls, type ProjectMedia } from './project-media.ts'

const AUTOSAVE_DELAY_MS = 400
const EVENTS_FILE = 'events.jsonl'
const store = new OpfsProjectStore()

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; project: Project; events: MouseEventRecord[]; media: ProjectMedia }

async function open(projectId: string): Promise<Extract<State, { kind: 'ready' }>> {
  let project = await loadProject(store, projectId)
  const text = (await store.readText(projectId, EVENTS_FILE)) ?? ''
  const { events } = parseEvents(text)
  // First open: turn the clicks into zooms and keep them (data-model.md rules), as on desktop.
  if (project.zooms.length === 0 && events.length > 0) {
    const { zooms } = generateZooms({
      events,
      video: { width: project.source.width, height: project.source.height },
      durationMs: project.durationMs,
    })
    if (zooms.length > 0) {
      project = { ...project, zooms }
      await saveProject(store, project)
    }
  }
  await pruneBackgroundImages(store, project).catch(() => undefined)
  const media = await loadProjectMedia(store, project)
  return { kind: 'ready', project, events, media }
}

/** "1:05" for the clicks-lost notice: the timecode without frames or empty hours. */
function clockTime(ms: number): string {
  const timecode = formatTimecode(ms, 30)
  return timecode
    .slice(0, timecode.lastIndexOf(':'))
    .replace(/^00:/, '')
    .replace(/^0(\d)/, '$1')
}

function backToProjects(): void {
  location.href = chrome.runtime.getURL(PROJECTS_PAGE)
}

function ExtensionEditor({ projectId }: { projectId: string }) {
  const t = useT()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [notices, setNotices] = useState<FloatingNoticeItem[]>([])
  const [imageVersion, setImageVersion] = useState(0)
  const cache = useMemo(() => new MediaUrlCache(), [])
  const pending = useRef<Project | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Export history lives outside the undo history (data-model.md: project.exports).
  const exportsRef = useRef<ExportRecord[] | null>(null)
  const latest = useRef<Project | null>(null)
  const exporting = useRef(false)

  const withExports = (project: Project): Project =>
    exportsRef.current ? { ...project, exports: exportsRef.current } : project

  const flush = async () => {
    clearTimeout(timer.current)
    const project = pending.current
    pending.current = null
    if (project) {
      await saveProject(store, withExports(project)).catch((error: unknown) => {
        console.error('kamo: save failed', error)
      })
    }
  }

  const addNotice = (notice: FloatingNoticeItem) =>
    setNotices((current) => [...current.filter((n) => n.id !== notice.id), notice])
  const dismiss = (id: string) => setNotices((current) => current.filter((n) => n.id !== id))

  useEffect(() => {
    let cancelled = false
    void removeStaleExports().catch(() => undefined)
    void open(projectId).then(
      (ready) => {
        if (cancelled) return
        latest.current = ready.project
        setState(ready)
        document.title = ready.project.name
      },
      () => !cancelled && setState({ kind: 'failed' }),
    )
    const onUnload = (event: BeforeUnloadEvent) => {
      void flush()
      // E-04: closing the tab mid-export asks first.
      if (exporting.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', onUnload)
      cache.revoke()
    }
    // flush only reads refs.
  }, [projectId, cache])

  // E-02: the tab went where Kamo couldn't follow; say from when clicks are missing.
  const lostAt = state.kind === 'ready' ? state.project.eventsLostAtMs : undefined
  useEffect(() => {
    if (lostAt === undefined) return
    addNotice({
      id: 'clicks-lost',
      tone: 'warning',
      text: t('extension.editor.clicksLost', {
        time: clockTime(lostAt),
      }),
      action: {
        label: t('extension.editor.allowSites'),
        onClick: () => {
          void chrome.permissions.request({ origins: ['<all_urls>'] }).then((granted) => {
            if (!granted) return
            addNotice({
              id: 'clicks-lost',
              tone: 'success',
              text: t('extension.editor.allowedSites'),
            })
          })
        },
      },
    })
    // t is stable per language
  }, [lostAt])

  const ready = state.kind === 'ready' ? state : null
  const media = ready?.media ?? null
  const urls = useMemo(
    () => (ready && media ? mediaUrls(ready.project, media, cache) : null),
    // the urls only depend on the files, not on the edits
    [media, cache, imageVersion],
  )

  const exportPlatform = useMemo<ExportPlatform | undefined>(() => {
    if (!ready || !media) return undefined
    const onBlocked = (download: FinishedDownload) =>
      addNotice({
        id: `download-${download.id}`,
        tone: 'error',
        text: t('extension.editor.downloadBlocked', { name: download.name }),
        action: {
          label: t('extension.editor.downloadAgain'),
          onClick: () => {
            dismiss(`download-${download.id}`)
            void download.retry()
          },
        },
      })
    return {
      sink: downloadsSink({ onBlocked }),
      media: {
        video: media.screen,
        mic: media.mic,
        // The tab sound is the audio track of screen.webm.
        system: ready.project.audio.system.enabled ? media.screen : null,
        webcam: media.webcam,
        backgroundImage: (file) => media.images.get(file) ?? null,
      },
      showInFolder: (path) => {
        const id = Number(path)
        if (Number.isInteger(id)) chrome.downloads.show(id)
      },
      onExported: (record) => {
        const project = latest.current
        if (!project) return
        exportsRef.current = [...(exportsRef.current ?? project.exports), record]
        pending.current = project
        void flush()
      },
      onBusyChange: (busy) => {
        exporting.current = busy
      },
    }
    // rebuilt only when the media changes; flush and t read refs or are stable
  }, [media])

  const backgroundImage = useMemo(
    () =>
      urls && media
        ? extensionBackgroundImage({
            store,
            projectId,
            url: urls.image,
            onImported: (name, blob) => {
              media.images.set(name, blob)
              setImageVersion((v) => v + 1)
            },
          })
        : undefined,
    [urls, media, projectId],
  )

  if (state.kind !== 'ready' || !urls) {
    return (
      <EditorStatus
        state={state.kind === 'failed' ? 'failed' : 'loading'}
        onBack={backToProjects}
      />
    )
  }

  return (
    <DesktopAppProvider url={DESKTOP_DOWNLOAD_URL}>
      <Editor
        project={state.project}
        events={state.events}
        videoUrl={urls.video}
        webcamUrl={urls.webcam}
        audioUrls={{ mic: urls.mic, system: urls.system }}
        {...(exportPlatform ? { exportPlatform } : {})}
        backgroundImage={backgroundImage}
        onChange={(project) => {
          latest.current = project
          pending.current = project
          clearTimeout(timer.current)
          timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
        }}
        onBack={() => void flush().then(backToProjects)}
      />
      <FloatingNotices notices={notices} onDismiss={dismiss} />
    </DesktopAppProvider>
  )
}

const projectId = new URLSearchParams(location.search).get('project') ?? ''
await boot(() => <ExtensionEditor projectId={projectId} />, 'app.name')
