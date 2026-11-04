import {
  buildCameraTrack,
  buildCursorTrack,
  createRenderer,
  outputSize,
  sceneFrame,
  type MouseEventRecord,
  type Project,
  type Renderer,
  type Scene,
  type Zoom,
} from '@kamo/core'
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { correctWebcamDrift, syncWebcam, webcamSourceOf } from './webcam-sync.ts'

export interface PreviewProps {
  project: Project
  events: readonly MouseEventRecord[]
  /** Zooms the camera uses (auto-zoom toggle already applied). */
  zooms: readonly Zoom[]
  videoUrl: string
  video: RefObject<HTMLVideoElement | null>
  /** webcam.mp4 (A-03); without it, or with project.webcam null, there is no bubble */
  webcamUrl?: string | undefined
  /** the hidden webcam element, kept on the screen video's clock */
  webcamVideo: RefObject<HTMLVideoElement | null>
  /** Exposes `draw(timeMs)` so playback can redraw exactly on each presented frame. */
  drawRef: RefObject<((timeMs: number) => void) | null>
}

const ASPECT = '16:9' as const

/**
 * The editor preview (F-10): the same core renderer as the export (rule 11), drawing the
 * raw video with style, camera, cursor and webcam bubble into a 1080p canvas scaled to fit.
 */
export function Preview({
  project,
  events,
  zooms,
  videoUrl,
  video,
  webcamUrl,
  webcamVideo,
  drawRef,
}: PreviewProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const renderer = useRef<Renderer | null>(null)
  const output = useMemo(() => outputSize(ASPECT, '1080p'), [])
  const { width, height } = project.source
  const webcam = webcamUrl ? project.webcam : null
  const webcamRef = useRef(webcam)
  webcamRef.current = webcam

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
      // The export builds the same scene in one go (buildScene); here the tracks are
      // memoized apart so a style edit does not rebuild the camera.
      const scene: Scene = {
        sourceSize: { width, height },
        style: project.style,
        camera,
        cursor,
        webcam,
      }
      const camElement = webcam ? webcamVideo.current : null
      if (webcam && camElement) correctWebcamDrift(element, camElement, webcam)
      renderer.current.render(
        sceneFrame(scene, element, ASPECT, output, timeMs, webcamSourceOf(camElement)),
      )
    },
    [video, webcamVideo, width, height, project.style, output, camera, cursor, webcam],
  )

  // Style, zooms, cursor or webcam changed: redraw the current frame right away (F-08).
  useEffect(() => {
    drawRef.current = draw
    const element = video.current
    if (element) draw(element.currentTime * 1000)
  }, [draw, drawRef, video])

  // The webcam element follows the screen element (play, pause, seek, rate).
  const hasWebcam = webcam !== null
  useEffect(() => {
    const screen = video.current
    const cam = webcamVideo.current
    if (!hasWebcam || !screen || !cam) return
    return syncWebcam(
      screen,
      cam,
      () => webcamRef.current,
      () => drawRef.current?.(screen.currentTime * 1000),
    )
  }, [hasWebcam, webcamUrl, video, webcamVideo, drawRef])

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
      {webcamUrl && project.webcam && (
        <video
          ref={webcamVideo}
          src={webcamUrl}
          preload="auto"
          playsInline
          muted
          className="hidden"
          data-testid="webcam-video"
        />
      )}
    </div>
  )
}
