// "Is Kamo in the middle of something that must not be interrupted?" (F-14: never restart for
// an update during a recording or an export). Anything long-running registers a check here;
// the updater asks before restarting.
const checks = new Set<() => boolean>()

/** Registers a check (e.g. `() => exporter.isExporting()`). Returns unregister. */
export function registerBusyCheck(isBusy: () => boolean): () => void {
  checks.add(isBusy)
  return () => checks.delete(isBusy)
}

export function isBusy(): boolean {
  for (const check of checks) {
    try {
      if (check()) return true
    } catch {
      // A broken check counts as busy: better a late update than a lost recording.
      return true
    }
  }
  return false
}
