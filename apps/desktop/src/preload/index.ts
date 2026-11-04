import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type DisplayInfo, type KamoApi, type ScreenAccess } from '../shared/api.ts'

// Each method wraps one fixed channel; ipcRenderer itself is never exposed.
const api: KamoApi = {
  getLocale: () => ipcRenderer.invoke(IpcChannel.getLocale) as Promise<string[]>,
  listDisplays: () => ipcRenderer.invoke(IpcChannel.listDisplays) as Promise<DisplayInfo[]>,
  onDisplaysChanged: (listener) => {
    // Wrapped so the renderer never receives the IPC event object.
    const handler = () => listener()
    ipcRenderer.on(IpcChannel.displaysChanged, handler)
    return () => ipcRenderer.off(IpcChannel.displaysChanged, handler)
  },
  getScreenAccess: () => ipcRenderer.invoke(IpcChannel.getScreenAccess) as Promise<ScreenAccess>,
}

contextBridge.exposeInMainWorld('kamo', api)
