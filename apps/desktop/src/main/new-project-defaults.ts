// What a new project starts with (F-08): the last style and cursor the user set. Used by the
// recording backend and by recovery (F-02), so both start projects the same way.
import { DEFAULT_STYLE, backgroundImageFile, type CursorSettings, type Style } from '@kamo/core'
import type { AppSettings } from '../shared/api.ts'

/**
 * The style new recordings start with (F-08). A background image (A-04) lives in its own
 * project's folder, so it never carries over: new projects get the default wallpaper.
 */
export function styleForNewProjects(style: Style): Style {
  return backgroundImageFile(style.background) === null
    ? style
    : { ...style, background: DEFAULT_STYLE.background }
}

/** The saved last style and cursor, as defaults for a new project (missing ones are left out). */
export async function newProjectDefaults(settings: {
  get(): Promise<Pick<AppSettings, 'lastStyle' | 'lastCursor'>>
}): Promise<{ style?: Style; cursor?: CursorSettings }> {
  const { lastStyle, lastCursor } = await settings.get()
  return {
    ...(lastStyle ? { style: styleForNewProjects(lastStyle) } : {}),
    ...(lastCursor ? { cursor: lastCursor } : {}),
  }
}
