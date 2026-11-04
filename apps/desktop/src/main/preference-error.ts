/** Errors from Settings, onboarding and updates that the renderer explains (stable codes). */
export type PreferenceErrorCode =
  | 'busy'
  | 'invalid_argument'
  | 'invalid_shortcut'
  | 'shortcut_taken'
  | 'folder_not_writable'
  | 'notices_missing'

export class PreferenceError extends Error {
  constructor(readonly code: PreferenceErrorCode) {
    super(code)
    this.name = 'PreferenceError'
  }
}
