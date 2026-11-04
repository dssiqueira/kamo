import {
  addWebcamHidden,
  createHistory,
  deleteWebcamHidden,
  createZoomAt,
  deleteZoom,
  generateZooms,
  moveWebcamHidden,
  moveZoom,
  resizeWebcamHidden,
  resizeZoom,
  setTrim,
  setWebcam,
  setZoomScale,
  visibleZooms,
  type MouseEventRecord,
  type Project,
} from '@kamo/core'
import { formatTimecode } from '@kamo/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { ArrowBackIcon, PauseIcon, PlayIcon } from '../primitives/icons.tsx'
import { Timeline, type TimelineAudioTrack } from '../timeline/Timeline.tsx'
import { useHistoryShortcuts } from '../timeline/useHistoryShortcuts.ts'
import { ExportSheet } from '../export/ExportSheet.tsx'
import type { ExportPlatform } from '../export/useExportRun.ts'
import { Preview } from './Preview.tsx'
import { StylePanel } from './StylePanel.tsx'
import { usePlayback } from './usePlayback.ts'

export interface EditorProps {
  /** Starting point; from then on the editor owns the project through its undo history. */
  project: Project
  events: readonly MouseEventRecord[]
  videoUrl: string
  /** webcam.mp4 (A-03), when the project has one; the app resolves it like videoUrl */
  webcamUrl?: string | undefined
  /** Every edit, undo and redo; the app autosaves it (F-12: no Save button). */
  onChange(project: Project): void
  onBack(): void
  /** Files, media and folders for the export (F-11); without it, Export stays disabled. */
  exportPlatform?: ExportPlatform
}

/** Editor (flows.md §5): preview in the middle, side panel on the right, timeline below. */
export function Editor({
  project: initial,
  events,
  videoUrl,
  webcamUrl,
  onChange,
  onBack,
  exportPlatform,
}: EditorProps) {
  const t = useT()
  const video = useRef<HTMLVideoElement | null>(null)
  const webcamVideo = useRef<HTMLVideoElement | null>(null)
  const draw = useRef<((timeMs: number) => void) | null>(null)
  const [autoZoom, setAutoZoom] = useState(true)
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null)
  const [selectedHidden, setSelectedHidden] = useState<number | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  // Every edit (timeline and side panel) goes through one history: Ctrl/⌘+Z undoes any of
  // them, ≥ 50 steps, a whole drag is one step (F-09).
  // The page remounts the editor per project, so the history is created once.
  const [history] = useState(() => createHistory(initial))
  const [project, setProject] = useState(initial)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(
    () =>
      history.subscribe(() => {
        setProject(history.present)
        onChangeRef.current(history.present)
      }),
    [history],
  )
  useHistoryShortcuts(history, () => {})

  const edit = (next: (p: Project) => Project) => history.push(next(history.present))
  const fromBase = (next: (p: Project) => Project) => history.push(next(history.base))

  const fps = project.source.fps
  const playback = usePlayback(video, project.trim, fps, (ms) => draw.current?.(ms))

  const zooms = useMemo(() => visibleZooms(project.zooms, { autoZoom }), [project.zooms, autoZoom])
  const noClicks = useMemo(
    () => !events.some((e) => e.type === 'down' && e.button === 'left'),
    [events],
  )

  // F-10: Space plays/pauses, arrows step one frame (Shift: one second). Keys of Kamo's own
  // window only; nothing system-wide (rule 2). Focused controls keep their own keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (exportOpen) return
      const target = event.target as HTMLElement | null
      if (
        target?.closest(
          'input, textarea, select, button, [role="slider"], [contenteditable="true"]',
        )
      )
        return
      if (event.key === ' ') {
        event.preventDefault()
        playback.toggle()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const frames = event.shiftKey ? fps : 1
        playback.step(event.key === 'ArrowLeft' ? -frames : frames)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playback, fps, exportOpen])

  const regenerate = () =>
    edit((p) => ({
      ...p,
      zooms: generateZooms({
        events,
        video: { width: p.source.width, height: p.source.height },
        durationMs: p.durationMs,
        existing: p.zooms,
      }).zooms,
    }))

  /** F-09: a new zoom centers on where the pointer was at that instant. */
  const pointerAt = (tMs: number) => {
    let point = { x: project.source.width / 2, y: project.source.height / 2 }
    for (const e of events) {
      if (e.t > tMs) break
      if (!(e.type === 'move' && e.outside)) point = { x: e.x, y: e.y }
    }
    return point
  }

  const audioTrack = (track: 'mic' | 'system'): TimelineAudioTrack | undefined =>
    project.audio[track].enabled
      ? { volume: project.audio[track].volume, muted: project.audio[track].volume === 0 }
      : undefined
  const mic = audioTrack('mic')
  const system = audioTrack('system')
  const setVolume = (track: 'mic' | 'system', volume: number) =>
    edit((p) => ({ ...p, audio: { ...p.audio, [track]: { ...p.audio[track], volume } } }))

  return (
    <div className="flex h-screen flex-col bg-background font-sans text-on-surface">
      <header className="flex items-center gap-md border-b border-border px-md py-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-xs rounded-md px-sm py-xs text-body text-tertiary-strong hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-tertiary"
        >
          <ArrowBackIcon />
          {t('editor.back')}
        </button>
        <h1 className="min-w-0 flex-1 truncate text-title">{project.name}</h1>
        <button
          type="button"
          data-testid="export-open"
          disabled={!exportPlatform}
          onClick={() => {
            if (playback.playing) playback.toggle()
            setExportOpen(true)
          }}
          className={`rounded-md bg-primary px-[20px] py-[12px] text-title text-on-primary transition-colors duration-[120ms] hover:bg-[#97CB90] disabled:opacity-50 ${FOCUS_RING}`}
        >
          {t('editor.export')}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <Preview
            project={project}
            events={events}
            zooms={zooms}
            videoUrl={videoUrl}
            video={video}
            webcamUrl={webcamUrl}
            webcamVideo={webcamVideo}
            drawRef={draw}
          />
          <div className="flex items-center gap-md border-t border-border px-md py-sm">
            <button
              type="button"
              onClick={playback.toggle}
              aria-label={t(playback.playing ? 'editor.pause' : 'editor.play')}
              title={t(playback.playing ? 'editor.pause' : 'editor.play')}
              className={`flex size-[40px] items-center justify-center rounded-full bg-surface-raised text-on-surface transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`}
            >
              {playback.playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
            </button>
            <span className="font-mono text-timecode tabular-nums">
              {formatTimecode(playback.timeMs - project.trim.startMs, fps)}
              <span className="text-on-surface-muted">
                {' / '}
                {formatTimecode(project.trim.endMs - project.trim.startMs, fps)}
              </span>
            </span>
          </div>
          <Timeline
            durationMs={project.durationMs}
            fps={fps}
            trim={project.trim}
            zooms={project.zooms}
            playheadMs={playback.timeMs}
            selectedZoomId={selectedZoomId}
            tracks={{ ...(mic ? { mic } : {}), ...(system ? { system } : {}) }}
            webcam={
              project.webcam && webcamUrl
                ? {
                    hidden: project.webcam.hidden,
                    off: !project.webcam.visible,
                    selectedIndex: selectedHidden,
                    onSelectHidden: setSelectedHidden,
                    onMoveHidden: (i, d) => fromBase((p) => moveWebcamHidden(p, i, d)),
                    onResizeHidden: (i, edge, d) =>
                      fromBase((p) => resizeWebcamHidden(p, i, edge, d)),
                    onDeleteHidden: (i) => {
                      edit((p) => deleteWebcamHidden(p, i))
                      setSelectedHidden(null)
                    },
                    onAddHidden: (tMs) => edit((p) => addWebcamHidden(p, tMs)),
                  }
                : undefined
            }
            onScrub={playback.seek}
            onSelectZoom={setSelectedZoomId}
            onMoveZoom={(id, d) => fromBase((p) => moveZoom(p, id, d))}
            onResizeZoom={(id, edge, d) => fromBase((p) => resizeZoom(p, id, edge, d))}
            onScaleZoom={(id, scale) => edit((p) => setZoomScale(p, id, scale))}
            onDeleteZoom={(id) => {
              edit((p) => deleteZoom(p, id))
              setSelectedZoomId(null)
            }}
            onCreateZoom={(tMs) => edit((p) => createZoomAt(p, tMs, pointerAt(tMs)))}
            onTrim={(start, end) => fromBase((p) => setTrim(p, start, end))}
            onTrackVolume={setVolume}
            onTrackMute={(track, muted) => setVolume(track, muted ? 0 : 1)}
            onTransactionStart={() => history.begin()}
            onTransactionEnd={() => history.commit()}
          />
        </main>
        <StylePanel
          style={project.style}
          cursor={project.cursor}
          autoZoom={autoZoom}
          noClicks={noClicks}
          onStyle={(style) => edit((p) => ({ ...p, style }))}
          onCursor={(cursor) => edit((p) => ({ ...p, cursor }))}
          onAutoZoom={setAutoZoom}
          onRegenerate={regenerate}
          webcam={webcamUrl ? project.webcam : null}
          onWebcam={(patch) => edit((p) => setWebcam(p, patch))}
        />
      </div>
      {exportOpen && exportPlatform && (
        <ExportSheet
          project={project}
          events={events}
          zooms={zooms}
          autoZoom={autoZoom}
          video={video.current}
          webcamVideo={webcamUrl ? webcamVideo.current : null}
          timeMs={playback.timeMs}
          platform={exportPlatform}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  )
}
