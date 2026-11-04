// What gets recorded. Each app implements these with its own APIs (desktop: native
// capture helpers; extension: tabCapture in an offscreen document). Shapes are the minimum
// the engine needs today and grow with steps 2–3 and 12–13.
import type { MouseEventRecord } from '../events/events.ts'
import type { Fps, Source } from '../project/schema.ts'

export interface CaptureTarget {
  id: string
  kind: Source['kind']
  /** Display name, window title or tab title; shown as-is (it is user content). */
  name: string
  width: number
  height: number
  scaleFactor: number
  primary?: boolean
}

export interface CaptureOptions {
  targetId: string
  fps: Fps
  /** Microphone device id, or null for no microphone (F-04). */
  microphone: string | null
  systemAudio: boolean
}

export interface CaptureSource {
  listTargets(): Promise<CaptureTarget[]>
  start(projectId: string, options: CaptureOptions): Promise<CaptureSession>
}

export interface CaptureSession {
  readonly source: Source
  pause(): Promise<void>
  resume(): Promise<void>
  /** Stops and flushes every file to the ProjectStore. Duration excludes pauses (F-02). */
  stop(): Promise<{ durationMs: number }>
}

/**
 * Mouse events, never keyboard (rule 2). Times are relative to the start of the video
 * with pauses removed, and coordinates are in video pixels (F-03).
 */
export interface EventSource {
  start(onEvent: (event: MouseEventRecord) => void): Promise<void>
  pause(): void
  resume(): void
  stop(): Promise<void>
}
