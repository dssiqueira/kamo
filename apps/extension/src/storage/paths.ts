// Project folders in the extension's OPFS (docs/data-model.md "In the extension"): the same
// layout as the desktop's ~/Kamo/projects/<id>/, under an OPFS `projects/` folder.

export const PROJECTS_DIRECTORY = 'projects'

/** Raw tab recording: video (VP9/VP8) and the tab sound (Opus) in one WebM. */
export const SCREEN_FILE = 'screen.webm'

/**
 * Microphone (Opus in WebM), on its own file because Chrome's MediaRecorder writes a single
 * audio track; a separate file keeps the per-track volume of F-04 (see the step 12 report).
 */
export const MICROPHONE_FILE = 'audio.webm'

/**
 * Written when a recording starts and removed after project.json is saved, like the
 * desktop's `recording.lock`: a folder with it and no project.json is an interrupted recording.
 */
export const RECORDING_MARKER = 'recording.lock'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isProjectId(value: string): boolean {
  return UUID.test(value)
}

/**
 * Splits a project-relative path (`frames/0005.jpg`) into its folders and file name. Rejects
 * anything that could leave the project folder.
 */
export function splitProjectPath(path: string): { directories: string[]; name: string } {
  const segments = path.split('/')
  if (segments.some((s) => s === '' || s === '.' || s === '..' || s.includes('\\'))) {
    throw new Error(`invalid project path: ${path}`)
  }
  const name = segments.pop() as string
  return { directories: segments, name }
}

export function assertProjectId(projectId: string): void {
  if (!isProjectId(projectId)) throw new Error(`invalid project id: ${projectId}`)
}
