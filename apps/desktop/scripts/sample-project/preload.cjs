// The page runs sandboxed without Node; these are the only calls it can make. Every file is
// written by the main process.
// Sandboxed preloads must be CommonJS.
// eslint-disable-next-line no-undef, @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sample', {
  plan: () => ipcRenderer.invoke('sample:plan'),
  begin: (mimeType) => ipcRenderer.invoke('sample:begin', mimeType),
  writeVideo: (chunk) => ipcRenderer.invoke('sample:video', chunk),
  writeFrame: (second, jpeg) => ipcRenderer.invoke('sample:frame', second, jpeg),
  finish: (result) => ipcRenderer.invoke('sample:finish', result),
  fail: (message) => ipcRenderer.invoke('sample:fail', message),
})
