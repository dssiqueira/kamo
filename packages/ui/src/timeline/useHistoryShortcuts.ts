import type { History } from '@kamo/core'
import { useEffect, useRef } from 'react'
import { historyShortcut, isTextEditingTarget } from './shortcuts.ts'

export type HistoryLike<T> = Pick<History<T>, 'undo' | 'redo' | 'canUndo' | 'canRedo'>

/**
 * Undo/redo for the editor window: ⌘Z / ⌘⇧Z on Mac, Ctrl+Z / Ctrl+Y elsewhere (F-09).
 * `onChange` receives the new present state (save it and re-render). Text fields keep
 * their native undo.
 */
export function useHistoryShortcuts<T>(
  history: HistoryLike<T>,
  onChange: (present: T) => void,
  options: { enabled?: boolean } = {},
): void {
  const latest = useRef({ history, onChange })
  latest.current = { history, onChange }
  const enabled = options.enabled ?? true

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextEditingTarget(event.target)) return
      const action = historyShortcut(event)
      if (!action) return
      event.preventDefault()
      const { history, onChange } = latest.current
      if (action === 'undo' && history.canUndo()) onChange(history.undo())
      else if (action === 'redo' && history.canRedo()) onChange(history.redo())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
