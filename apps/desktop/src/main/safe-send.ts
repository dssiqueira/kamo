// Sending to a renderer that may be gone. A BrowserWindow outlives its web contents for a
// moment while it closes (quit, a window closed while a status arrives), and `send` on a
// destroyed web contents throws "Object has been destroyed". In main that is an uncaught
// exception, which quits the app (index.ts), so every forwarder goes through here.

/** What `sendTo` needs from a BrowserWindow (structural, so it is tested without Electron). */
export interface SendTarget {
  isDestroyed(): boolean
  readonly webContents: {
    isDestroyed(): boolean
    send(channel: string, ...args: unknown[]): void
  }
}

/** Sends when the window and its page are still there; false when it was skipped or failed. */
export function sendTo(
  target: SendTarget | null | undefined,
  channel: string,
  ...args: unknown[]
): boolean {
  if (!target || target.isDestroyed()) return false
  const contents = target.webContents
  if (contents.isDestroyed()) return false
  try {
    contents.send(channel, ...args)
    return true
  } catch {
    // destroyed between the check and the send: nobody is listening any more
    return false
  }
}
