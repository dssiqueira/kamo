// Whether a real quit is under way, so closing the main window quits instead of hiding it to
// the tray (F-15). Set by `before-quit`, shutdown/logoff and the update installer, which on Mac
// closes the windows before `before-quit` fires.
let quitting = false

export function markQuitting(): void {
  quitting = true
}

/** A quit was cancelled (the user kept an export running): closing hides again. */
export function clearQuitting(): void {
  quitting = false
}

export function isQuitting(): boolean {
  return quitting
}
