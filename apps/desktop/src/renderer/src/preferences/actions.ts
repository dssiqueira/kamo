import { ipcErrorCode } from '../../../shared/api.ts'

/** Runs an IPC call for the UI: null when it worked, the error code (or 'failed') when not. */
export async function attempt(action: () => Promise<unknown>): Promise<string | null> {
  try {
    await action()
    return null
  } catch (error) {
    return ipcErrorCode(error) ?? 'failed'
  }
}
