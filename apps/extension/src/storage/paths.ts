// Project folders in the extension's OPFS (docs/data-model.md "In the extension"): the same
// layout as the desktop's ~/Kamo/projects/<id>/, under an OPFS `projects/` folder.

export const PROJECTS_DIRECTORY = 'projects'

/**
 * Raw tab recording: video and the tab sound in one file. `screen.mp4` (H.264, the desktop's
 * name) where the browser records MP4, else `screen.webm` (VP9/VP8 + Opus), which is also
 * what every recording made before D-037 has. A project has one or the other.
 */
export const SCREEN_FILES = ['screen.mp4', 'screen.webm'] as const

export type ScreenFile = (typeof SCREEN_FILES)[number]

export function screenFileFor(mimeType: string): ScreenFile {
  return mimeType.startsWith('video/mp4') ? 'screen.mp4' : 'screen.webm'
}

/** The project's screen file with something in it, or null (`fileSize` as in the store). */
export async function findScreenFile(
  fileSize: (name: ScreenFile) => Promise<number | null>,
): Promise<ScreenFile | null> {
  for (const name of SCREEN_FILES) {
    if (((await fileSize(name)) ?? 0) > 0) return name
  }
  return null
}

/**
 * Microphone (Opus in WebM), on its own file because Chrome's MediaRecorder writes a single
 * audio track; a separate file keeps the per-track volume of F-04 (see the step 12 report).
 */
export const MICROPHONE_FILE = 'audio.webm'

/** Webcam (A-03): MP4 like the desktop, or WebM in a browser that records no MP4. */
export const WEBCAM_FILES = ['webcam.mp4', 'webcam.webm'] as const

export function isWebcamFile(name: string): boolean {
  return (WEBCAM_FILES as readonly string[]).includes(name)
}

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
