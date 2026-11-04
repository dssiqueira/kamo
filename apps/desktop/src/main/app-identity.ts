// Kamo's name and app-data folder, fixed before anything reads a path (imported first by
// index.ts). Electron derives both from package.json; started without it (for example
// `electron out/main/index.js`) it would call itself "Electron" and keep its settings and log
// in %APPDATA%\Electron instead of the documented app-data folder (docs/data-model.md).
import { app } from 'electron'
import { join } from 'node:path'

export const APP_NAME = 'Kamo'

/** An explicit `--user-data-dir` (a test that wants its own folder) is left alone. */
export function needsIdentityFix(name: string, customUserData: boolean): boolean {
  return name !== APP_NAME && !customUserData
}

if (needsIdentityFix(app.getName(), app.commandLine.hasSwitch('user-data-dir'))) {
  app.setName(APP_NAME)
  app.setPath('userData', join(app.getPath('appData'), APP_NAME))
}
