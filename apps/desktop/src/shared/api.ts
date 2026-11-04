/**
 * The only API the renderer gets from the preload (`window.kamo`). Keep it small and typed:
 * the renderer never sees `ipcRenderer` or any Node/Electron object.
 */
export interface KamoApi {
  /** The user's preferred languages (BCP 47), most preferred first. */
  getLocale(): Promise<string[]>
  /** Connected displays with a fresh thumbnail each call (F-01). */
  listDisplays(): Promise<DisplayInfo[]>
  /** Called when a display is connected, removed or changes resolution. Returns unsubscribe. */
  onDisplaysChanged(listener: () => void): () => void
  /** Screen recording permission (only ever not `granted` on Mac). */
  getScreenAccess(): Promise<ScreenAccess>
}

export interface DisplayInfo {
  id: string
  /** OS label (e.g. the monitor model); empty when the OS gives none. */
  label: string
  /** Physical pixels (logical size × scale factor), what the recording will have. */
  width: number
  height: number
  scaleFactor: number
  primary: boolean
  /** JPEG data URL, or null when the OS did not return one. */
  thumbnail: string | null
}

export type ScreenAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

/** IPC channel names shared by main and preload. */
export const IpcChannel = {
  getLocale: 'kamo:get-locale',
  listDisplays: 'kamo:list-displays',
  displaysChanged: 'kamo:displays-changed',
  getScreenAccess: 'kamo:get-screen-access',
} as const
