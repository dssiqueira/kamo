// What a project looks like at any instant: the camera and cursor tracks plus the style.
// Built once per edit and read per frame by the editor preview AND the export, so both
// paint exactly the same frame for the same time (rule 11).
import { buildCameraTrack, cameraAt, viewportAt, type CameraTrack } from '../camera/camera.ts'
import { buildCursorTrack, cursorAt, type CursorTrack } from '../cursor/cursor.ts'
import type { MouseEventRecord } from '../events/events.ts'
import type { Aspect, Project, Style, WebcamSettings, Zoom } from '../project/schema.ts'
import type { RenderInput } from './renderer.ts'
import type { ImageSourceLike, Size } from './types.ts'
import { webcamBubbleAt } from './webcam.ts'

export interface Scene {
  sourceSize: Size
  style: Style
  camera: CameraTrack
  cursor: CursorTrack
  /** webcam bubble settings (A-03); null = no bubble */
  webcam: WebcamSettings | null
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
 * frame for that instant; without it (or with the bubble off or hidden) no bubble is drawn.
 */
export function sceneFrame(
  scene: Scene,
  source: ImageSourceLike,
  aspect: Aspect,
  output: Size,
  timeMs: number,
  webcam?: WebcamSource | null,
): RenderInput {
  const bubble = webcam
    ? webcamBubbleAt(scene.webcam, output, timeMs, cameraAt(scene.camera, timeMs).scale)
    : null
  return {
    source,
    sourceSize: scene.sourceSize,
    style: scene.style,
    aspect,
    output,
    viewport: viewportAt(scene.camera, timeMs),
    cursor: cursorAt(scene.cursor, timeMs),
    cursorSize: scene.cursor.size,
    webcam: webcam && bubble ? { source: webcam.source, sourceSize: webcam.size, bubble } : null,
  }
}
