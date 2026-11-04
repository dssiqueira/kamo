// The global stop shortcut (F-02, F-15). Rule 2: Kamo never captures the keyboard. The stop
// shortcut is the one global shortcut it registers, and only while recording. Users pick it by
// pressing keys inside Kamo's own Settings window; main checks it here before saving.
export const DEFAULT_STOP_SHORTCUT = 'CommandOrControl+Shift+2'

// Electron accelerator modifiers (https://www.electronjs.org/docs/latest/api/accelerator).
const MODIFIERS = new Set([
  'Command',
  'Cmd',
  'Control',
  'Ctrl',
  'CommandOrControl',
  'CmdOrCtrl',
  'Alt',
  'Option',
  'AltGr',
  'Shift',
  'Super',
  'Meta',
])

// Shift alone is not enough: Shift+A would swallow every capital A the user types.
const STRONG_MODIFIERS = new Set([...MODIFIERS].filter((m) => m !== 'Shift'))

const NAMED_KEYS = new Set([
  'Space',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Return',
  'Enter',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Plus',
  'Escape',
  'Esc',
])

const PUNCTUATION = new Set(['-', '=', '[', ']', '\\', ';', "'", ',', '.', '/', '`'])

function isKey(part: string): boolean {
  return (
    /^[A-Z0-9]$/.test(part) ||
    /^F([1-9]|1[0-9]|2[0-4])$/.test(part) ||
    NAMED_KEYS.has(part) ||
    PUNCTUATION.has(part)
  )
}

/**
 * Syntax check: modifiers first, exactly one key last, at least one modifier other than Shift,
 * no repeats. Pure, so it is shared with the settings.json schema.
 */
export function isValidAccelerator(accelerator: unknown): accelerator is string {
  if (typeof accelerator !== 'string' || accelerator.length > 64) return false
  // '+' as a key is spelled 'Plus', so splitting on '+' is safe.
  const parts = accelerator.split('+')
  const key = parts.pop()
  if (!key || !isKey(key)) return false
  if (parts.length === 0 || new Set(parts).size !== parts.length) return false
  if (!parts.every((part) => MODIFIERS.has(part))) return false
  return parts.some((part) => STRONG_MODIFIERS.has(part))
}
