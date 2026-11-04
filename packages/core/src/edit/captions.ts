// Caption look in the side panel (A-06). Same contract as the other project edits: pure, the
// result passes the Project schema, and the same reference comes back when nothing changes.
import { DEFAULT_CAPTIONS, type CaptionSettings, type Project } from '../project/schema.ts'

/**
 * Updates the caption settings. A project that never had captions starts from the defaults
 * (turned off), so the first change keeps the user's choice and the rest are the defaults.
 */
export function setCaptions(project: Project, patch: Partial<CaptionSettings>): Project {
  const current = project.captions ?? { ...DEFAULT_CAPTIONS, enabled: false }
  const next: CaptionSettings = { ...current }
  for (const key of Object.keys(patch) as (keyof CaptionSettings)[]) {
    if (patch[key] !== undefined) Object.assign(next, { [key]: patch[key] })
  }
  const changed = (Object.keys(next) as (keyof CaptionSettings)[]).some(
    (key) => next[key] !== project.captions?.[key],
  )
  return changed ? { ...project, captions: next } : project
}
