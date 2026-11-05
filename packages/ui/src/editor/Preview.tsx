import {
  buildCameraTrack,
  buildCursorTrack,
  cameraAt,
  CAPTION_LOOKS,
  createRenderer,
  isSplitLayout,
  outputSize,
  paddedArea,
  projectAspect,
  sceneFrame,
  splitDividerY,
  splitRatioAt,
  webcamBubbleAt,
  webcamBubbleContains,
  webcamPlacementAt,
  webcamVisibility,
  type BackgroundImage,
  type CaptionTrack,
  type MouseEventRecord,
  type Project,
  type Renderer,
  type Scene,
  type Zoom,
} from '@kamo/core'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
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
  /** the decoded image of an image background (A-04); null = the fallback color */
  backgroundImage?: BackgroundImage | null
  /** the captions burned in (A-06); null = none */
  captions?: CaptionTrack | null
  /** Exposes `draw(timeMs)` so playback can redraw exactly on each presented frame. */
  drawRef: RefObject<((timeMs: number) => void) | null>
  /** Dragging the bubble in the preview (A-03): one undo step from start to end. */
  onWebcamDragStart?(): void
  onWebcamDrag?(placement: WebcamPlacement): void
  onWebcamDragEnd?(): void
  /** Dragging the split layout's divider (9:16, A-02): one undo step from start to end. */
  onSplitDragStart?(): void
  onSplitDrag?(ratio: number): void
  onSplitDragEnd?(): void
  /** tooltip of the divider handle */
  splitHandleLabel?: string
}

type WebcamPlacement = ReturnType<typeof webcamPlacementAt>

type Drag = { kind: 'bubble'; dx: number; dy: number } | { kind: 'divider' }

/** Half the height of the divider's grab zone, in output pixels (1080p). */
const DIVIDER_GRAB = 40

/**
 * The editor preview (F-10): the same core renderer as the export (rule 11), drawing the
 * raw video with style, camera, cursor and webcam into a 1080p canvas of the project's
 * format (16:9, 1:1 or 9:16, A-02), scaled to fit the space.
 */
export function Preview({
  project,
  events,
  zooms,
  videoUrl,
  video,
  webcamUrl,
  webcamVideo,
  backgroundImage = null,
  captions = null,
  drawRef,
  onWebcamDragStart,
  onWebcamDrag,
  onWebcamDragEnd,
  onSplitDragStart,
  onSplitDrag,
  onSplitDragEnd,
  splitHandleLabel,
}: PreviewProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const renderer = useRef<Renderer | null>(null)
  const aspect = projectAspect(project)
  const output = useMemo(() => outputSize(aspect, '1080p'), [aspect])
  const fit = useFitSize(box, output.width / output.height)
  const { width, height } = project.source
  const { padding } = project.style
  const webcam = webcamUrl ? project.webcam : null
  const webcamRef = useRef(webcam)
  webcamRef.current = webcam
  const split = isSplitLayout(webcam, aspect)

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
        backgroundImage,
        captions,
      }
      const camElement = webcam ? webcamVideo.current : null
      if (webcam && camElement) correctWebcamDrift(element, camElement, webcam)
      renderer.current.render(
        sceneFrame(scene, element, aspect, output, timeMs, webcamSourceOf(camElement)),
      )
    },
    [
      video,
      webcamVideo,
      width,
      height,
      project.style,
      aspect,
      output,
      camera,
      cursor,
      webcam,
      backgroundImage,
      captions,
    ],
  )

  // Style (or its decoded image), zooms, cursor, webcam or format changed: redraw the current frame right away
  // (F-08). A new format also resizes the canvas, which clears it.
  useEffect(() => {
    drawRef.current = draw
    const element = video.current
    if (element) draw(element.currentTime * 1000)
  }, [draw, drawRef, video])

  // The canvas draws captions only with a loaded font: load the caption font, then redraw.
  const captionFont = captions
    ? `${CAPTION_LOOKS[captions.settings.preset].weight} 48px ${captions.fontFamily}`
    : null
  useEffect(() => {
    if (!captionFont || typeof document === 'undefined' || !document.fonts) return
    let live = true
    void document.fonts.load(captionFont).then(
      () => {
        const element = video.current
        if (live && element) drawRef.current?.(element.currentTime * 1000)
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [captionFont, video, drawRef])

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

  // Leaving the editor stops the hidden elements: a detached <video> that was playing keeps
  // decoding (and firing frame callbacks) until it is collected.
  useEffect(() => {
    const screen = video.current
    const cam = webcamVideo.current
    return () => {
      screen?.pause()
      cam?.pause()
    }
  }, [video, webcamVideo, hasWebcam])

  // Drag the bubble anywhere (A-03): the grab offset keeps it from jumping under the
  // pointer; near a corner it snaps there (webcamPlacementAt). In the split layout there is
  // no bubble: the divider between the two cards is dragged instead (splitRatioAt).
  const drag = useRef<Drag | null>(null)
  const [cursorStyle, setCursorStyle] = useState<'grab' | 'grabbing' | 'row-resize' | undefined>(
    undefined,
  )
  const [dividerActive, setDividerActive] = useState(false)
  const toOutput = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * output.width) / rect.width,
      y: ((event.clientY - rect.top) * output.height) / rect.height,
    }
  }
  const bubbleUnder = (point: { x: number; y: number }) => {
    const element = video.current
    if (!webcam || split || !webcamVideo.current || !element || !onWebcamDrag) return null
    const timeMs = element.currentTime * 1000
    const bubble = webcamBubbleAt(webcam, output, timeMs, cameraAt(camera, timeMs).scale)
    if (!bubble) return null
    return webcamBubbleContains(bubble, point) ? bubble : null
  }
  /** Divider position (output pixels), or null while it cannot be dragged. */
  const dividerY = () => {
    const element = video.current
    if (!webcam || !split || !webcamVideo.current || !element || !onSplitDrag) return null
    // Inside a hidden stretch (or fading) the camera card is not all there to resize.
    if (webcamVisibility(webcam.hidden, element.currentTime * 1000) < 1) return null
    return splitDividerY(output, padding, webcam.split)
  }
  const onDivider = (point: { x: number; y: number }) => {
    const y = dividerY()
    if (y === null) return false
    const area = paddedArea(output, padding)
    return (
      Math.abs(point.y - y) <= DIVIDER_GRAB && point.x >= area.x && point.x <= area.x + area.width
    )
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    const point = toOutput(event)
    if (onDivider(point)) {
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { kind: 'divider' }
      setDividerActive(true)
      onSplitDragStart?.()
      return
    }
    const bubble = bubbleUnder(point)
    if (!bubble) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { kind: 'bubble', dx: bubble.x - point.x, dy: bubble.y - point.y }
    setCursorStyle('grabbing')
    onWebcamDragStart?.()
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = toOutput(event)
    const current = drag.current
    if (!current) {
      const divider = onDivider(point)
      setDividerActive(divider)
      setCursorStyle(divider ? 'row-resize' : bubbleUnder(point) ? 'grab' : undefined)
      return
    }
    if (!webcam) return
    if (current.kind === 'divider') {
      const cameraFirst = webcam.split?.cameraFirst === true
      onSplitDrag?.(splitRatioAt(output, padding, cameraFirst, point.y))
      return
    }
    const center = { x: point.x + current.dx, y: point.y + current.dy }
    onWebcamDrag?.(webcamPlacementAt(center, webcam.size, output, webcam.shape))
  }
  const endDrag = () => {
    const current = drag.current
    if (!current) return
    drag.current = null
    if (current.kind === 'divider') {
      onSplitDragEnd?.()
      return
    }
    setCursorStyle('grab')
    onWebcamDragEnd?.()
  }
  const handleY = split && webcam ? splitDividerY(output, padding, webcam.split) : null

  return (
    <div ref={box} className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-md">
      {/* The largest box of the format that fits; the divider handle sits over it in %. */}
      <div
        className="relative shrink-0"
        style={fit ? { width: fit.width, height: fit.height } : { visibility: 'hidden' }}
      >
        <canvas
          ref={canvas}
          width={output.width}
          height={output.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => {
            if (drag.current) return
            setCursorStyle(undefined)
            setDividerActive(false)
          }}
          data-testid="preview-canvas"
          data-aspect={aspect}
          className="block h-full w-full touch-none rounded-md"
          style={{ cursor: cursorStyle }}
        />
        {handleY !== null && dividerActive && (
          <span
            aria-hidden
            title={splitHandleLabel}
            data-testid="split-handle"
            className="pointer-events-none absolute left-1/2 h-[6px] w-[64px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface shadow-[0_2px_8px_rgb(43_42_38/0.3)]"
            style={{ top: `${(handleY / output.height) * 100}%` }}
          />
        )}
      </div>
      {/* The source of every frame; never shown itself. Muted: PreviewAudio owns the sound,
          and only unmutes it (at the track's volume) when a recorded track lives in this
          same file, like the extension's tab sound in its screen file. */}
      <video ref={video} src={videoUrl} preload="auto" playsInline muted className="hidden" />
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

/**
 * Largest size of `aspect` (width / height) inside the element's content box, in CSS
 * pixels, kept up to date as the window or the panels resize. Null until measured.
 */
function useFitSize(
  element: RefObject<HTMLElement | null>,
  aspect: number,
): { width: number; height: number } | null {
  const [space, setSpace] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    const node = element.current
    if (!node) return
    const measure = () => {
      const style = getComputedStyle(node)
      const width =
        node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const height =
        node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      setSpace((old) =>
        old && old.width === width && old.height === height ? old : { width, height },
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [element])
  if (!space || space.width <= 0 || space.height <= 0) return null
  const width = Math.min(space.width, space.height * aspect)
  return { width: Math.floor(width), height: Math.floor(width / aspect) }
}
