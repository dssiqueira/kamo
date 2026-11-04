// What a project looks like at any instant: the camera and cursor tracks plus the style.
// Built once per edit and read per frame by the editor preview AND the export, so both
// paint exactly the same frame for the same time (rule 11).
import { buildCameraTrack, viewportAt, type CameraTrack } from '../camera/camera.ts'
import { buildCursorTrack, cursorAt, type CursorTrack } from '../cursor/cursor.ts'
import type { MouseEventRecord } from '../events/events.ts'
import type { Aspect, Project, Style, Zoom } from '../project/schema.ts'
import type { RenderInput } from './renderer.ts'
import type { ImageSourceLike, Size } from './types.ts'

export interface Scene {
  sourceSize: Size
  style: Style
  camera: CameraTrack
  cursor: CursorTrack
}

export interface SceneInput {
  project: Pick<Project, 'source' | 'durationMs' | 'style' | 'cursor'>
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
  }
}

/** The renderer input for one frame at `timeMs` (raw video time). */
export function sceneFrame(
  scene: Scene,
  source: ImageSourceLike,
  aspect: Aspect,
  output: Size,
  timeMs: number,
): RenderInput {
  return {
    source,
    sourceSize: scene.sourceSize,
    style: scene.style,
    aspect,
    output,
    viewport: viewportAt(scene.camera, timeMs),
    cursor: cursorAt(scene.cursor, timeMs),
    cursorSize: scene.cursor.size,
  }
}
