import { generateZooms, visibleZooms, type MouseEventRecord, type Project } from '@kamo/core'
import { formatTimecode } from '@kamo/i18n'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n.tsx'
import { Preview } from './Preview.tsx'
import { StylePanel } from './StylePanel.tsx'
import { usePlayback } from './usePlayback.ts'

export interface EditorProps {
  project: Project
  events: readonly MouseEventRecord[]
  videoUrl: string
  /** Every edit; the app autosaves it (F-12: no Save button). */
  onChange(project: Project): void
  onBack(): void
  /** Timeline goes here (step 8). Gets the playback time and a seek function. */
  renderTimeline?(props: { timeMs: number; seek(timeMs: number): void }): ReactNode
}

/** Editor (flows.md §5): preview in the middle, side panel on the right, transport below. */
export function Editor({
  project,
  events,
  videoUrl,
  onChange,
  onBack,
  renderTimeline,
}: EditorProps) {
  const t = useT()
  const video = useRef<HTMLVideoElement | null>(null)
  const draw = useRef<((timeMs: number) => void) | null>(null)
  const [autoZoom, setAutoZoom] = useState(true)
  const fps = project.source.fps
  const playback = usePlayback(video, project.trim, fps, (ms) => draw.current?.(ms))

  const zooms = useMemo(() => visibleZooms(project.zooms, { autoZoom }), [project.zooms, autoZoom])
  const noClicks = useMemo(
    () => !events.some((e) => e.type === 'down' && e.button === 'left'),
    [events],
  )

  // F-10: Space plays/pauses, arrows step one frame (Shift: one second). Keys of Kamo's own
  // window only; nothing system-wide (rule 2).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return
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
  }, [playback, fps])

  const regenerate = () => {
    const { zooms: next } = generateZooms({
      events,
      video: { width: project.source.width, height: project.source.height },
      durationMs: project.durationMs,
      existing: project.zooms,
    })
    onChange({ ...project, zooms: next })
  }

  return (
    <div className="flex h-screen flex-col bg-background font-sans text-on-surface">
      <header className="flex items-center gap-md border-b border-border px-md py-sm">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-sm py-xs text-body text-tertiary-strong hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-tertiary"
        >
          {t('editor.back')}
        </button>
        <h1 className="min-w-0 flex-1 truncate text-title">{project.name}</h1>
        <button
          type="button"
          disabled
          title={t('editor.exportSoon')}
          className="rounded-md bg-primary px-[20px] py-[12px] text-title text-on-primary disabled:opacity-50"
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
            drawRef={draw}
          />
          <Transport
            playing={playback.playing}
            timeMs={playback.timeMs}
            trim={project.trim}
            fps={fps}
            onToggle={playback.toggle}
            onSeek={playback.seek}
          />
          {renderTimeline?.({ timeMs: playback.timeMs, seek: playback.seek })}
        </main>
        <StylePanel
          style={project.style}
          cursor={project.cursor}
          autoZoom={autoZoom}
          noClicks={noClicks}
          onStyle={(style) => onChange({ ...project, style })}
          onCursor={(cursor) => onChange({ ...project, cursor })}
          onAutoZoom={setAutoZoom}
          onRegenerate={regenerate}
        />
      </div>
    </div>
  )
}

interface TransportProps {
  playing: boolean
  timeMs: number
  trim: { startMs: number; endMs: number }
  fps: number
  onToggle(): void
  onSeek(timeMs: number): void
}

function Transport({ playing, timeMs, trim, fps, onToggle, onSeek }: TransportProps) {
  const t = useT()
  return (
    <div className="flex items-center gap-md border-t border-border px-md py-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-[88px] rounded-md bg-surface-raised px-md py-sm text-body hover:bg-border focus-visible:outline-2 focus-visible:outline-tertiary"
      >
        {t(playing ? 'editor.pause' : 'editor.play')}
      </button>
      <span className="font-mono text-timecode tabular-nums">
        {formatTimecode(timeMs - trim.startMs, fps)}
      </span>
      <input
        type="range"
        aria-label={t('editor.scrub')}
        min={trim.startMs}
        max={trim.endMs}
        step={1000 / fps}
        value={Math.min(trim.endMs, Math.max(trim.startMs, timeMs))}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="min-w-0 flex-1 accent-tertiary"
      />
      <span className="font-mono text-timecode text-on-surface-muted tabular-nums">
        {formatTimecode(trim.endMs - trim.startMs, fps)}
      </span>
    </div>
  )
}
