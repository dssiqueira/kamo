import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type KamoApi } from '../shared/api.ts'

// Each method wraps one fixed channel; ipcRenderer itself is never exposed.
const api: KamoApi = {
  getLocale: () => ipcRenderer.invoke(IpcChannel.getLocale) as Promise<string[]>,
}

contextBridge.exposeInMainWorld('kamo', api)
