// Undo/redo keys inside Kamo's own editor window. This is not keyboard capture (rule 2 is
// about recording system-wide input): it is the window reacting to its own shortcuts.

export type HistoryAction = 'undo' | 'redo'

export interface ShortcutKeys {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** ⌘Z / Ctrl+Z undo; ⌘⇧Z / Ctrl+⇧Z / Ctrl+Y redo (F-09). */
export function historyShortcut(event: ShortcutKeys): HistoryAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  // Non-Latin layouts report another character in `key`; fall back to the physical key.
  const letter = /^[a-z]$/i.test(event.key)
    ? event.key.toLowerCase()
    : event.code.replace(/^Key/, '').toLowerCase()
  if (letter === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (letter === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) return 'redo'
  return null
}

const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

/** Text fields keep their own native undo (e.g. renaming the project). */
export function isTextEditingTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false
  const element = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown }
  if (element.isContentEditable === true) return true
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type = typeof element.type === 'string' ? element.type.toLowerCase() : 'text'
  return !NON_TEXT_INPUTS.has(type)
}
