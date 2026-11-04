// What a project looks like at any instant: the camera and cursor tracks plus the style.
// Built once per edit and read per frame by the editor preview AND the export, so both
// paint exactly the same frame for the same time (rule 11).
import { buildCameraTrack, cameraAt, viewportAt, type CameraTrack } from '../camera/camera.ts'
import { buildCursorTrack, cursorAt, type CursorTrack } from '../cursor/cursor.ts'
import type { MouseEventRecord } from '../events/events.ts'
import type { Aspect, Project, Style, WebcamSettings, Zoom } from '../project/schema.ts'
import { framingAt, framingFor } from './framing.ts'
import { paddedArea } from './layout.ts'
import type { RenderInput } from './renderer.ts'
import { isSplitLayout, splitRegions } from './split.ts'
import type { ImageSourceLike, Point, Size } from './types.ts'
import type { BackgroundImage } from './wallpapers.ts'
import { webcamBubbleAt, webcamVisibility } from './webcam.ts'

export interface Scene {
  sourceSize: Size
  style: Style
  camera: CameraTrack
  cursor: CursorTrack
  /** webcam bubble settings (A-03); null = no bubble */
  webcam: WebcamSettings | null
  /**
   * the decoded picture of an image background (A-04), when the style has one and the app
   * has decoded it; missing = the fallback color. Keep the same object for every frame.
   */
  backgroundImage?: BackgroundImage | null
}

/** The webcam frame on screen at this instant (picked with webcamTimeMs) and its size. */
export interface WebcamSource {
  source: ImageSourceLike
  size: Size
}

export interface SceneInput {
  project: Pick<Project, 'source' | 'durationMs' | 'style' | 'cursor'> &
    Partial<Pick<Project, 'webcam'>>
  events: readonly MouseEventRecord[]
  /** zooms the camera uses: `visibleZooms(project.zooms, { autoZoom })` */
  zooms: readonly Zoom[]
}

export function buildScene({ project, events, zooms }: SceneInput): Scene {
  const sourceSize = { width: project.source.width, height: project.source.height }
  return {
    sourceSize,
    style: project.style,
    camera: buildCameraTrack({
      zooms,
      events,
      video: sourceSize,
      durationMs: project.durationMs,
    }),
    cursor: buildCursorTrack({
      events,
      settings: project.cursor,
      durationMs: project.durationMs,
    }),
    webcam: project.webcam ?? null,
  }
}

/**
 * The renderer input for one frame at `timeMs` (raw video time). `webcam` is the camera
 * frame for that instant; without it (or with the webcam off or hidden) no camera is drawn.
 *
 * Crop formats (1:1, 9:16) follow the camera and the cursor (framing.ts). In 9:16 with the
 * split layout (split.ts) the screen goes in its own card and the camera fills the other;
 * without a camera frame (e.g. an unreadable webcam.mp4) it falls back to a plain 9:16 crop.
 */
export function sceneFrame(
  scene: Scene,
  source: ImageSourceLike,
  aspect: Aspect,
  output: Size,
  timeMs: number,
  webcam?: WebcamSource | null,
): RenderInput {
  const cursor = cursorAt(scene.cursor, timeMs)
  const base: RenderInput = {
    source,
    sourceSize: scene.sourceSize,
    style: scene.style,
    aspect,
    output,
    viewport: viewportAt(scene.camera, timeMs),
    cursor,
    cursorSize: scene.cursor.size,
    webcam: null,
    backgroundImage: scene.backgroundImage ?? null,
  }
  const keep: Point | null =
    aspect !== '16:9' && scene.cursor.rawT.length > 0 ? { x: cursor.x, y: cursor.y } : null
  const settings = scene.webcam

  if (webcam && settings && isSplitLayout(settings, aspect)) {
    const visibility = webcamVisibility(settings.hidden, timeMs)
    const { padding } = scene.style
    const regions = splitRegions(output, padding, settings.split, visibility)
    // The framing for the card's shape: shown and hidden shapes blended by visibility, so
    // the crop moves continuously while the card grows or shrinks.
    const shown = splitRegions(output, padding, settings.split, 1).screen
    const focus = blendPoints(
      framingAt(
        framingFor(scene.camera, scene.cursor, aspectOf(paddedArea(output, padding))),
        timeMs,
      ),
      framingAt(framingFor(scene.camera, scene.cursor, aspectOf(shown)), timeMs),
      visibility,
    )
    return {
      ...base,
      region: regions.screen,
      focus,
      keep,
      webcam:
        visibility > 0 && regions.camera.height > 0
          ? {
              source: webcam.source,
              sourceSize: webcam.size,
              card: { ...regions.camera, opacity: visibility },
            }
          : null,
    }
  }

  const focus =
    aspect === '16:9'
      ? null
      : framingAt(
          framingFor(scene.camera, scene.cursor, aspectOf(paddedArea(output, scene.style.padding))),
          timeMs,
        )
  const bubble = webcam
    ? webcamBubbleAt(settings, output, timeMs, cameraAt(scene.camera, timeMs).scale)
    : null
  return {
    ...base,
    focus,
    keep,
    webcam: webcam && bubble ? { source: webcam.source, sourceSize: webcam.size, bubble } : null,
  }
}

function aspectOf(box: { width: number; height: number }): number {
  return box.width / box.height
}

/** `a` at weight 0, `b` at weight 1; either alone when the other is missing. */
function blendPoints(a: Point | null, b: Point | null, weight: number): Point | null {
  if (!a || !b) return a ?? b
  return { x: a.x + (b.x - a.x) * weight, y: a.y + (b.y - a.y) * weight }
}
