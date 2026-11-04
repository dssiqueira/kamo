import {
  buildCameraTrack,
  buildCursorTrack,
  createRenderer,
  cursorAt,
  outputSize,
  viewportAt,
  type MouseEventRecord,
  type Project,
  type Renderer,
  type Zoom,
} from '@kamo/core'
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'

export interface PreviewProps {
  project: Project
  events: readonly MouseEventRecord[]
  /** Zooms the camera uses (auto-zoom toggle already applied). */
  zooms: readonly Zoom[]
  videoUrl: string
  video: RefObject<HTMLVideoElement | null>
  /** Exposes `draw(timeMs)` so playback can redraw exactly on each presented frame. */
  drawRef: RefObject<((timeMs: number) => void) | null>
}

const ASPECT = '16:9' as const

/**
 * The editor preview (F-10): the same core renderer as the export (rule 11), drawing the
 * raw video with style, camera and cursor into a 1080p canvas scaled to fit.
 */
export function Preview({ project, events, zooms, videoUrl, video, drawRef }: PreviewProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const renderer = useRef<Renderer | null>(null)
  const output = useMemo(() => outputSize(ASPECT, '1080p'), [])
  const { width, height } = project.source

  const camera = useMemo(
    () =>
      buildCameraTrack({
        zooms: [...zooms],
        events: [...events],
        video: { width, height },
        durationMs: project.durationMs,
      }),
    [zooms, events, width, height, project.durationMs],
  )
  const cursor = useMemo(
    () =>
      buildCursorTrack({
        events: [...events],
        settings: project.cursor,
        durationMs: project.durationMs,
      }),
    [events, project.cursor, project.durationMs],
  )

  const draw = useCallback(
    (timeMs: number) => {
      const element = video.current
      const ctx = canvas.current?.getContext('2d')
      if (!element || !ctx || element.readyState < 2) return
      renderer.current ??= createRenderer(ctx)
      renderer.current.render({
        source: element,
        sourceSize: { width, height },
        style: project.style,
        aspect: ASPECT,
        output,
        viewport: viewportAt(camera, timeMs),
        cursor: cursorAt(cursor, timeMs),
        cursorSize: cursor.size,
      })
    },
    [video, width, height, project.style, output, camera, cursor],
  )

  // Style, zooms or cursor changed: redraw the current frame right away (F-08: < 100ms).
  useEffect(() => {
    drawRef.current = draw
    const element = video.current
    if (element) draw(element.currentTime * 1000)
  }, [draw, drawRef, video])

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-md">
      <canvas
        ref={canvas}
        width={output.width}
        height={output.height}
        className="max-h-full max-w-full rounded-md"
        style={{ aspectRatio: `${output.width} / ${output.height}` }}
      />
      {/* The source of every frame; never shown itself. */}
      <video ref={video} src={videoUrl} preload="auto" playsInline className="hidden" />
    </div>
  )
}
