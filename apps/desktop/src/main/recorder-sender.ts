// IPC sender check for the hidden recorder pages (audio, camera). Only the page the service
// opened may report and stream chunks. A page it opened earlier can still have messages in
// flight after it was destroyed (Home turned the meters off, the page crashed): those used to
// be rejected as "Untrusted IPC sender" and logged as errors; now they are dropped quietly.
// Any other sender (another app page, anything else) is still rejected.

export type RecorderSenderKind = 'current' | 'stale' | 'foreign'

/** True: handle the message. False: drop it. Throws for a sender that is not a recorder. */
export function acceptRecorderSender(kind: RecorderSenderKind): boolean {
  if (kind === 'foreign') throw new Error('Untrusted IPC sender')
  return kind === 'current'
}
