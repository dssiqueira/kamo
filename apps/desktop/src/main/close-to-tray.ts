// Close to tray (F-15): what closing the main window does. Pure, so it is tested without
// Electron; index.ts and app-tray.ts apply it.

/**
 * Default when the user never changed the setting. Windows and Linux apps that keep working
 * in the background live in the tray; on Mac the app already stays alive in the Dock when its
 * last window closes, so closing just closes the window there unless the user asks for the
 * menu bar icon.
 */
export function closeToTrayDefault(platform: NodeJS.Platform): boolean {
  return platform !== 'darwin'
}

/** The setting in effect: the saved choice, or the platform default. */
export function closeToTrayEnabled(
  setting: boolean | undefined,
  platform: NodeJS.Platform,
): boolean {
  return setting ?? closeToTrayDefault(platform)
}

export interface CloseState {
  /** A real quit is under way (tray Quit, Cmd+Q, shutdown or logoff, installing an update). */
  quitting: boolean
  /** The setting in effect (closeToTrayEnabled). */
  closeToTray: boolean
  /** The tray icon exists, so the hidden window can be brought back. */
  trayAvailable: boolean
  /** `--smoke-test` runs must exit, never linger hidden. */
  smokeTest: boolean
}

/** True when closing the main window should hide it instead of closing it. */
export function shouldHideOnClose(state: CloseState): boolean {
  return !state.quitting && !state.smokeTest && state.closeToTray && state.trayAvailable
}

/**
 * The app tray icon is shown while the setting is on, except during a recording: the
 * recording tray icon (pause, stop) takes its place, so there is only ever one Kamo icon.
 */
export function shouldShowAppTray(state: {
  closeToTray: boolean
  recording: boolean
  smokeTest: boolean
}): boolean {
  return state.closeToTray && !state.recording && !state.smokeTest
}

/**
 * The first time the window goes to the tray on Windows, a balloon says Kamo is still running
 * (people expect X to quit there). Mac users find the menu bar icon on their own.
 */
export function shouldShowTrayNotice(state: {
  platform: NodeJS.Platform
  noticeShown: boolean
}): boolean {
  return state.platform === 'win32' && !state.noticeShown
}
