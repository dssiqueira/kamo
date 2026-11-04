// Checks the stop shortcut with the OS before Settings saves it (F-15). Rule 2: see accelerator.ts.
import { globalShortcut } from 'electron'
import { isValidAccelerator } from './accelerator.ts'

export type ShortcutCheck = 'ok' | 'invalid_shortcut' | 'shortcut_taken'

/**
 * Checks that the OS lets Kamo have this shortcut, by registering it for a moment and letting
 * it go right away. `active` is the shortcut Kamo itself holds now (during a recording): it is
 * already ours, so it counts as free.
 */
export function checkStopShortcut(stopShortcut: string, active: string | null): ShortcutCheck {
  if (!isValidAccelerator(stopShortcut)) return 'invalid_shortcut'
  if (stopShortcut === active) return 'ok'
  let registered: boolean
  try {
    registered = globalShortcut.register(stopShortcut, () => {})
  } catch {
    return 'invalid_shortcut'
  }
  if (!registered) return 'shortcut_taken'
  globalShortcut.unregister(stopShortcut)
  return 'ok'
}
