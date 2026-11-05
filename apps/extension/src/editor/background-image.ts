// Wallpaper with your own image in the extension (A-04): the picked file is checked by its bytes
// and copied into the project folder in OPFS as `background-<hash>.<ext>`, the same name the
// desktop uses, so the project keeps working without the original. Earlier images stay until
// the editor opens the project again (pruneBackgroundImages), so undo can go back to them.
import {
  MAX_BACKGROUND_IMAGE_BYTES,
  backgroundImageFile,
  backgroundImageName,
  isBackgroundImageFile,
  sniffImageType,
  type Project,
} from '@kamo/core'
import type { BackgroundImagePick, BackgroundImagePlatform } from '@kamo/ui'
import type { OpfsProjectStore } from '../storage/opfs-store.ts'

export type ImportResult =
  | { ok: true; name: string; blob: Blob }
  | { ok: false; code: 'unsupported' | 'too_big' | 'unreadable' }

/** Checks and names an image the user picked. Pure apart from hashing, so it is unit tested. */
export async function checkBackgroundImage(file: Blob): Promise<ImportResult> {
  if (file.size > MAX_BACKGROUND_IMAGE_BYTES) return { ok: false, code: 'too_big' }
  if (file.size === 0) return { ok: false, code: 'unsupported' }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return { ok: false, code: 'unreadable' }
  }
  const type = sniffImageType(bytes)
  if (!type) return { ok: false, code: 'unsupported' }
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
  )
  const hash = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
  const name = backgroundImageName(type, hash)
  return {
    ok: true,
    name,
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], {
      type: `image/${type === 'jpg' ? 'jpeg' : type}`,
    }),
  }
}

/** Opens the browser's file picker; null when the user closes it. */
function chooseImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp'
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}

export function extensionBackgroundImage(options: {
  store: OpfsProjectStore
  projectId: string
  url(file: string): string
  /** A new image is in the project: the page serves it from now on. */
  onImported(name: string, blob: Blob): void
}): BackgroundImagePlatform {
  return {
    url: options.url,
    async pick(): Promise<BackgroundImagePick> {
      const file = await chooseImage()
      if (!file) return { kind: 'cancelled' }
      const checked = await checkBackgroundImage(file)
      if (!checked.ok) return { kind: 'error', code: checked.code }
      try {
        await options.store.writeBlob(options.projectId, checked.name, checked.blob)
      } catch {
        return { kind: 'error', code: 'unreadable' }
      }
      options.onImported(checked.name, checked.blob)
      return { kind: 'picked', file: checked.name }
    },
  }
}

/** Deletes the images the project no longer uses (on open, like the desktop). */
export async function pruneBackgroundImages(
  store: OpfsProjectStore,
  project: Project,
): Promise<void> {
  const keep = backgroundImageFile(project.style.background)
  for (const name of await store.listFiles(project.id, '')) {
    if (isBackgroundImageFile(name) && name !== keep) {
      await store.removeFile(project.id, name).catch(() => undefined)
    }
  }
}
