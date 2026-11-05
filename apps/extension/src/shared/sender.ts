// Who may talk to whom inside the extension (E-01). `chrome.runtime` messages and ports also
// reach the extension from its content script, which runs inside the recorded web page: a
// page that took over its own renderer could then pretend to be the popup or the recorder.
// Chrome fills `sender` in the browser process, so its id and URL can be trusted.

/** The service worker's script (manifest `background.service_worker`). */
export const SERVICE_WORKER_PAGE = 'service-worker.js'
/** The offscreen recorder's page. */
export const OFFSCREEN_PAGE = 'offscreen.html'

/** Just what the checks read from `chrome.runtime.MessageSender`. */
export interface SenderLike {
  id?: string | undefined
  url?: string | undefined
}

/**
 * True for this extension's own pages (popup, editor, projects, permission, welcome,
 * offscreen) and its service worker; false for content scripts, web pages and other
 * extensions.
 */
export function fromExtensionPage(
  sender: SenderLike | undefined,
  extensionId: string = chrome.runtime.id,
): boolean {
  if (!sender || sender.id !== extensionId || !sender.url) return false
  try {
    const url = new URL(sender.url)
    return url.protocol === 'chrome-extension:' && url.host === extensionId
  } catch {
    return false
  }
}

/** True when the sender is this extension's `page` (e.g. `offscreen.html`). */
export function fromPage(
  sender: SenderLike | undefined,
  page: string,
  extensionId: string = chrome.runtime.id,
): boolean {
  return fromExtensionPage(sender, extensionId) && new URL(sender!.url!).pathname === `/${page}`
}
