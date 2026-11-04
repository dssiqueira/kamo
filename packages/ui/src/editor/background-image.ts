// Wallpaper with your own image (A-04), editor side. The platform copies the picked image into
// the project and serves it back by URL; the editor decodes it once and hands the same object
// to every frame of the preview and the format previews (the export decodes its own copy).
import type { BackgroundImage } from '@kamo/core'
import { useEffect, useState } from 'react'

/** Why picking an image failed; the panel shows `editor.panel.imageErrors.<code>`. */
export type BackgroundImageErrorCode = 'unsupported' | 'too_big' | 'unreadable'

export type BackgroundImagePick =
  | { kind: 'picked'; file: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; code: BackgroundImageErrorCode }

/** What the app gives the editor for A-04; packages/ui never sees a path (rule 1). */
export interface BackgroundImagePlatform {
  /** URL of a project image (`style.background.value`) the page can load. */
  url(file: string): string
  /** Asks the user for an image; the platform checks it and copies it into the project. */
  pick(): Promise<BackgroundImagePick>
}

/** Loads and decodes an image; rejects when it cannot be shown. */
export async function loadBackgroundImage(url: string): Promise<BackgroundImage> {
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  await image.decode()
  if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error('empty image')
  return { source: image, size: { width: image.naturalWidth, height: image.naturalHeight } }
}

/**
 * The decoded image at `url` (null while loading, without a url, or when it cannot be read:
 * the renderer then paints the fallback color).
 */
export function useBackgroundImage(url: string | null): BackgroundImage | null {
  const [loaded, setLoaded] = useState<{ url: string; image: BackgroundImage | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let live = true
    loadBackgroundImage(url).then(
      (image) => live && setLoaded({ url, image }),
      () => live && setLoaded({ url, image: null }),
    )
    return () => {
      live = false
    }
  }, [url])
  return url && loaded?.url === url ? loaded.image : null
}
