/**
 * The only API the renderer gets from the preload (`window.kamo`). Keep it small and typed:
 * the renderer never sees `ipcRenderer` or any Node/Electron object.
 */
export interface KamoApi {
  /** The user's preferred languages (BCP 47), most preferred first. */
  getLocale(): Promise<string[]>
}

/** IPC channel names shared by main and preload. */
export const IpcChannel = {
  getLocale: 'kamo:get-locale',
} as const
