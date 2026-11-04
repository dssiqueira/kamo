// Turns a key press inside Kamo's own Settings window into an Electron accelerator, and an
// accelerator into what the user reads (⌘⇧2 on Mac, Ctrl+Shift+2 elsewhere). Rule 2: these are
// keys pressed in Kamo's focused window while the user records a shortcut, never global input.

export type ShortcutPlatform = 'mac' | 'windows' | 'linux'

/** The part of a KeyboardEvent this needs (testable without a DOM). */
export interface KeyPress {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type KeyPressResult =
  /** Only modifiers so far: keep listening. */
  | { kind: 'pending' }
  /** A key without Ctrl/⌘/Alt (Shift alone does not count: it would swallow typing). */
  | { kind: 'needs_modifier' }
  /** A key Kamo cannot use as a shortcut. */
  | { kind: 'unsupported' }
  | { kind: 'shortcut'; accelerator: string }

const MODIFIER_CODES = /^(Control|Meta|Alt|Shift|OS)(Left|Right)?$/

const NAMED: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Enter: 'Return',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
}

/** Physical key (layout-independent `code`) → accelerator key name. */
export function keyFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1] ?? null
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  if (digit) return digit[1] ?? null
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  return NAMED[code] ?? null
}

export function acceleratorFromKeyPress(
  press: KeyPress,
  platform: ShortcutPlatform,
): KeyPressResult {
  if (MODIFIER_CODES.test(press.code) || MODIFIER_CODES.test(press.key)) return { kind: 'pending' }
  const key = keyFromCode(press.code)
  if (!key) return { kind: 'unsupported' }
  const mac = platform === 'mac'
  // The platform's main modifier (⌘ on Mac, Ctrl elsewhere) becomes CommandOrControl, like
  // the default, so a settings.json copied between machines still makes sense.
  const parts = [
    ...((mac ? press.metaKey : press.ctrlKey) ? ['CommandOrControl'] : []),
    ...(mac && press.ctrlKey ? ['Control'] : []),
    ...(!mac && press.metaKey ? ['Super'] : []),
    ...(press.altKey ? ['Alt'] : []),
    ...(press.shiftKey ? ['Shift'] : []),
  ]
  if (!parts.some((part) => part !== 'Shift')) return { kind: 'needs_modifier' }
  return { kind: 'shortcut', accelerator: [...parts, key].join('+') }
}

const MAC_SYMBOLS: Record<string, string> = {
  CommandOrControl: '⌘',
  CmdOrCtrl: '⌘',
  Command: '⌘',
  Cmd: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
  Super: '⌘',
  Meta: '⌘',
}

const OTHER_NAMES: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  CmdOrCtrl: 'Ctrl',
  Control: 'Ctrl',
  Ctrl: 'Ctrl',
  Command: 'Win',
  Cmd: 'Win',
  Super: 'Win',
  Meta: 'Win',
  Alt: 'Alt',
  Option: 'Alt',
  Shift: 'Shift',
}

const KEY_LABELS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Return: 'Enter',
  Plus: '+',
}

/** What the user reads: `⌘⇧2` on Mac, `Ctrl+Shift+2` on Windows. */
export function formatAccelerator(accelerator: string, platform: ShortcutPlatform): string {
  const parts = accelerator.split('+')
  const key = parts.pop() ?? ''
  const keyLabel = KEY_LABELS[key] ?? key
  if (platform === 'mac') {
    return `${parts.map((part) => MAC_SYMBOLS[part] ?? part).join('')}${keyLabel}`
  }
  return [...parts.map((part) => OTHER_NAMES[part] ?? part), keyLabel].join('+')
}
