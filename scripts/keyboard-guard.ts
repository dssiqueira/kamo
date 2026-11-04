// Rule 2 / D-003: Kamo never captures the keyboard. This guard fails CI when the code
// contains a way to read keys system-wide. Key handling inside Kamo's own focused windows
// (Esc on the countdown, Space in the editor) is UI, not capture, and is allowed.

export interface Violation {
  file: string
  line: number
  rule: string
  text: string
}

interface Rule {
  name: string
  /** Which files the rule applies to (forward slashes). */
  files: RegExp
  pattern: RegExp
  /** Lines matching this are fine (e.g. the one allowed global shortcut). */
  allow?: RegExp
}

const NATIVE = /\.(swift|rs|c|cc|cpp|h|hpp|m|mm)$/
const SCRIPT = /\.(ts|tsx|js|mjs|cjs)$/

const RULES: Rule[] = [
  {
    name: 'Windows low-level or global keyboard hook',
    files: /./,
    pattern:
      /WH_KEYBOARD(_LL)?\b|GetAsyncKeyState|GetKeyboardState|RegisterHotKey|RIDEV_NOLEGACY|HID_USAGE_GENERIC_KEYBOARD/,
  },
  {
    name: 'macOS keyboard events in an event tap or global monitor',
    files: NATIVE,
    pattern:
      /\b(kCGEventKeyDown|kCGEventKeyUp|kCGEventFlagsChanged|\.keyDown|\.keyUp|\.flagsChanged|NSEvent\.addGlobalMonitorForEvents)\b/,
  },
  {
    name: 'Keyboard hook libraries',
    files: /./,
    pattern: /\b(uiohook|iohook|node-global-key-listener|global-keyboard-listener)\b/,
  },
  {
    name: 'Global shortcuts other than the stop shortcut',
    files: SCRIPT,
    pattern: /globalShortcut\.register(All)?\s*\(/,
    // The stop shortcut is editable in Settings (F-15): the constant, or a `stopShortcut`
    // variable holding the user's choice (validated in apps/desktop/src/main/accelerator.ts).
    allow: /globalShortcut\.register\(\s*(STOP_SHORTCUT|stopShortcut)\s*,/,
  },
  {
    name: 'Key listeners in the extension content script (it runs inside the recorded page)',
    files: /^apps\/extension\/src\/content\//,
    pattern: /['"`](keydown|keyup|keypress)['"`]|\.onkey(down|up|press)\b/,
  },
]

/** Files the guard reads: app and native sources, not docs, tests or build output. */
export function isScanned(file: string): boolean {
  if (/(^|\/)(node_modules|dist|out|build|release|\.build|coverage)\//.test(file)) return false
  if (/\.test\.(ts|tsx)$/.test(file) || file.startsWith('scripts/')) return false
  return /^(apps|packages)\//.test(file) && (NATIVE.test(file) || SCRIPT.test(file))
}

export function findKeyboardCapture(file: string, text: string): Violation[] {
  const violations: Violation[] = []
  const lines = text.split('\n')
  for (const rule of RULES) {
    if (!rule.files.test(file)) continue
    lines.forEach((line, index) => {
      if (rule.pattern.test(line) && !(rule.allow && rule.allow.test(line))) {
        violations.push({ file, line: index + 1, rule: rule.name, text: line.trim() })
      }
    })
  }
  return violations
}
