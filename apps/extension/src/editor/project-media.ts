// The raw files of a project in OPFS, for the editor's preview and the export (E-03, E-04).
// The preview gets object URLs (an extension page cannot fetch OPFS by path); the export gets
// the Blobs themselves (mediabunny reads them in ranges, nothing is loaded whole).
//
//   screen.mp4 / screen.webm  video + tab sound (the "system" track, F-04; D-037)
//   audio.webm   microphone
//   webcam.mp4 / webcam.webm   the bubble (A-03)
//   background-<hash>.<ext>    own-image wallpaper (A-04)
import { isBackgroundImageFile, type Project } from '@kamo/core'
import type { OpfsProjectStore } from '../storage/opfs-store.ts'
import { MICROPHONE_FILE, WEBCAM_FILES, findScreenFile } from '../storage/paths.ts'

export interface ProjectMedia {
  screen: Blob
  mic: Blob | null
  webcam: Blob | null
  /** Background images in the project folder, by file name. */
  images: Map<string, Blob>
}

export interface MediaUrls {
  video: string
  mic: string | undefined
  /** The tab sound lives in the screen file: the preview plays its audio from the same file. */
  system: string | undefined
  webcam: string | undefined
  image(file: string): string
}

export async function loadProjectMedia(
  store: OpfsProjectStore,
  project: Project,
): Promise<ProjectMedia> {
  const id = project.id
  const file = await findScreenFile((name) => store.fileSize(id, name))
  const screen = file === null ? null : await store.readBlob(id, file)
  if (!screen || screen.size === 0) throw new Error('screen file missing')
  const mic = project.audio.mic.enabled ? await store.readBlob(id, MICROPHONE_FILE) : null
  let webcam: Blob | null = null
  if (project.webcam) {
    for (const name of WEBCAM_FILES) {
      webcam = await store.readBlob(id, name)
      if (webcam && webcam.size > 0) break
      webcam = null
    }
  }
  const images = new Map<string, Blob>()
  for (const name of await store.listFiles(id, '')) {
    if (!isBackgroundImageFile(name)) continue
    const blob = await store.readBlob(id, name)
    if (blob) images.set(name, blob)
  }
  return { screen, mic, webcam, images }
}

/** Object URLs for the preview; `revoke` when the page goes away. */
export class MediaUrlCache {
  private readonly urls = new Map<Blob, string>()

  url(blob: Blob): string {
    let url = this.urls.get(blob)
    if (!url) {
      url = URL.createObjectURL(blob)
      this.urls.set(blob, url)
    }
    return url
  }

  revoke(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url)
    this.urls.clear()
  }
}

export function mediaUrls(project: Project, media: ProjectMedia, cache: MediaUrlCache): MediaUrls {
  const video = cache.url(media.screen)
  return {
    video,
    mic: media.mic ? cache.url(media.mic) : undefined,
    system: project.audio.system.enabled ? video : undefined,
    webcam: media.webcam ? cache.url(media.webcam) : undefined,
    image: (file) => {
      const blob = media.images.get(file)
      return blob ? cache.url(blob) : ''
    },
  }
}
