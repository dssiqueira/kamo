// "Open raw video" for a project whose project.json can't be read (F-12 in the extension): the
// edits are lost, so a fresh project is made around the screen file, keeping the clicks, the
// microphone and the camera that are still in the folder. The size and length come from the
// video itself (a <video> element: the extension page plays MP4 and WebM natively).
import { DEFAULT_WEBCAM, PROJECT_FILES, createProject, saveProject, type Source } from '@kamo/core'
import type { OpfsProjectStore } from './opfs-store.ts'
import { MICROPHONE_FILE, WEBCAM_FILES, findScreenFile } from './paths.ts'

/** Size and length of a recorded WebM. MediaRecorder files carry no duration: seek to find it. */
function probe(blob: Blob): Promise<{ width: number; height: number; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(blob)
    const done = (result: { width: number; height: number; durationMs: number } | null) => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      if (result) resolve(result)
      else reject(new Error('unreadable video'))
    }
    video.muted = true
    video.preload = 'metadata'
    video.addEventListener('error', () => done(null), { once: true })
    video.addEventListener(
      'loadedmetadata',
      () => {
        const finish = () =>
          done({
            width: video.videoWidth,
            height: video.videoHeight,
            durationMs: Math.round(video.duration * 1000),
          })
        if (Number.isFinite(video.duration)) return finish()
        video.addEventListener('durationchange', function wait() {
          if (!Number.isFinite(video.duration)) return
          video.removeEventListener('durationchange', wait)
          finish()
        })
        video.currentTime = Number.MAX_SAFE_INTEGER
      },
      { once: true },
    )
    video.src = url
  })
}

/** `nameFor` names the new project (project.defaultName with the file's date). */
export async function rebuildFromVideo(
  store: OpfsProjectStore,
  projectId: string,
  nameFor: (createdAt: Date) => string,
): Promise<void> {
  const file = await findScreenFile((name) => store.fileSize(projectId, name))
  const screen = file === null ? null : await store.readBlob(projectId, file)
  if (!screen || screen.size === 0) throw new Error('no video')
  const { width, height, durationMs } = await probe(screen)
  if (!(width > 0 && height > 0 && durationMs > 0)) throw new Error('unreadable video')
  const source: Source = { kind: 'tab', width, height, scaleFactor: 1, fps: 30 }
  const created = new Date((screen as File).lastModified || Date.now())
  const project = createProject({
    id: projectId,
    name: nameFor(created),
    source,
    durationMs,
    createdAt: created,
    audio: {
      mic: ((await store.fileSize(projectId, MICROPHONE_FILE)) ?? 0) > 0,
      // The tab sound, if any, is inside the screen file; the export skips a missing track.
      system: true,
    },
  })
  for (const name of WEBCAM_FILES) {
    if (((await store.fileSize(projectId, name)) ?? 0) > 0) {
      project.webcam = structuredClone(DEFAULT_WEBCAM)
      break
    }
  }
  // The damaged file is set aside, never silently lost.
  const damaged = await store.readText(projectId, PROJECT_FILES.project)
  if (damaged !== null) await store.writeText(projectId, 'project.broken.json', damaged)
  await saveProject(store, project)
}
