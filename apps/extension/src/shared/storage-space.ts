// Space the projects take in the browser (E-03): the total shown on "All projects", the 2GB
// warning, and the "almost out of space" check before recording. Pure, so it is unit tested.

/** E-03: warn when the projects pass 2GB (decimal, like the sizes the UI shows). */
export const PROJECTS_WARNING_BYTES = 2_000_000_000

/**
 * Below this much free quota a recording could stop early: about 5 minutes of 1080p30 at the
 * recorder's bitrate (shared/capture.ts videoBitrate, ~6 Mbps) plus the microphone.
 */
export const LOW_SPACE_BYTES = 250 * 1024 ** 2

export function hasLowSpace(estimate: { quota?: number; usage?: number }): boolean {
  const { quota, usage } = estimate
  if (quota === undefined || usage === undefined) return false
  return quota - usage < LOW_SPACE_BYTES
}

export function isOverWarning(bytes: number): boolean {
  return bytes > PROJECTS_WARNING_BYTES
}
