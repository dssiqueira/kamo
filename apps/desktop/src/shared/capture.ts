// What a recording captures (F-01, A-08): a whole display, one window, or a region of a
// display. Shared by main, preload and the renderer; main validates what the renderer sends
// (capture/targets.ts).

/** Part of a display in DIP (points on Mac), relative to the display's top left. */
export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export type CaptureTarget =
  | { kind: 'display'; displayId: string }
  /**
   * `windowId` from `listWindows`. `displayId` is the display the window was on when listed:
   * the countdown shows there.
   */
  | { kind: 'window'; windowId: string; displayId?: string }
  | { kind: 'region'; displayId: string; rect: CaptureRect }

export type CaptureKind = CaptureTarget['kind']

/** A-08: a region smaller than this, in pixels of the recording, is refused. */
export const MIN_REGION_PIXELS = { width: 320, height: 240 } as const

/** A window Home can record (A-08). */
export interface WindowInfo {
  /** HWND (Windows) or CGWindowID (Mac), in decimal. */
  id: string
  title: string
  /** Executable (Windows) or application name (Mac); may be empty. */
  app: string
  /** The display it is mostly on (Electron `Display.id`), or null if it is on none. */
  displayId: string | null
  /** Size in DIP (points on Mac). */
  width: number
  height: number
  /** JPEG data URL, or null when the OS gave none. */
  thumbnail: string | null
  /** The app's icon as a PNG data URL (32px), or null when the OS gave none. */
  icon: string | null
}
