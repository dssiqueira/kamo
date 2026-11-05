// Projects IPC (F-12): Home's list and actions, the editor's loads and saves, the background
// image picker (A-04) and the transcript the captions read (A-06). Ids and data come from the
// renderer: the store and the schema check them.
import { app, dialog, shell, type BrowserWindow } from 'electron'
import { lstat } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { PROJECT_FILES, backgroundImageFile } from '@kamo/core'
import { createI18n } from '@kamo/i18n'
import { IpcChannel } from '../shared/api.ts'
import {
  BACKGROUND_IMAGE_FILTER_EXTENSIONS,
  importBackgroundImage,
  pruneBackgroundImages,
} from './background-image.ts'
import { debugHooksAllowed } from './build-flags.ts'
import { styleForNewProjects } from './new-project-defaults.ts'
import { notifyPlaylistsChanged } from './playlists-ipc.ts'
import type { PlaylistStore } from './playlists.ts'
import { uiLocale } from './preferences.ts'
import {
  ProjectActionError,
  listProjectSummaries,
  loadProjectById,
  renameProject,
  saveProjectData,
} from './projects.ts'
import { rawVideoPath } from './raw-video.ts'
import { getServices } from './services.ts'
import { assertProjectId } from './storage/index.ts'
import { loadTranscriptText, saveEditedTranscript } from './transcript-file.ts'
import { loadPage } from './windows.ts'

type Handle = (channel: string, listener: (...args: unknown[]) => unknown) => void

export interface ProjectsIpcOptions {
  mainWindow(): BrowserWindow | undefined
  /** Home refreshes its project list (F-12). */
  notifyProjectsChanged(): void
  /** Local playlists (`<projects>/playlists.json`): a deleted recording leaves them. */
  playlists: PlaylistStore
}

export function registerProjects(handle: Handle, options: ProjectsIpcOptions): void {
  const { notifyProjectsChanged, playlists } = options

  handle(IpcChannel.listProjects, () => listProjectSummaries(getServices().store))
  handle(IpcChannel.loadProject, (projectId) => loadProjectById(getServices().store, projectId))

  handle(IpcChannel.saveProject, async (data) => {
    const { store, settings } = getServices()
    const { project, previous } = await saveProjectData(store, data)
    notifyProjectsChanged()
    // F-08: the last style and cursor the user set become the defaults of new recordings.
    // Only real changes count, so merely opening an old project does not change the default.
    const update = {
      ...(previous && !isDeepStrictEqual(previous.style, project.style)
        ? { lastStyle: styleForNewProjects(project.style) }
        : {}),
      ...(previous && !isDeepStrictEqual(previous.cursor, project.cursor)
        ? { lastCursor: project.cursor }
        : {}),
    }
    if (Object.keys(update).length) await settings.update(update)
  })
  handle(IpcChannel.renameProject, async (projectId, name) => {
    const summary = await renameProject(getServices().store, projectId, name)
    notifyProjectsChanged()
    return summary
  })
  handle(IpcChannel.deleteProject, async (projectId) => {
    assertProjectId(projectId as string)
    await getServices().store.deleteProject(projectId as string)
    getServices().log.info('project.deleted')
    notifyProjectsChanged()
    // A deleted recording leaves every playlist it was in.
    if (await playlists.forgetProject(projectId as string)) notifyPlaylistsChanged()
  })
  // F-12: a damaged project's recording opens in the system's video player.
  handle(IpcChannel.openRawVideo, async (projectId) => {
    const path = await rawVideoPath(getServices().store, projectId)
    const error = await shell.openPath(path)
    if (error) {
      getServices().log.warn('project.raw_video.failed', { error })
      throw new ProjectActionError('project_not_found')
    }
  })
  handle(IpcChannel.showProjectInFolder, async (projectId) => {
    assertProjectId(projectId as string)
    const { store } = getServices()
    // Only a real project folder: openPath on a file (or a link) would open it with its
    // default app, which for an extensionless executable on a Mac means running it.
    const ids = await store.listProjectIds()
    if (!ids.includes(projectId as string)) throw new ProjectActionError('project_not_found')
    const dir = store.projectDir(projectId as string)
    const info = await lstat(dir).catch(() => null)
    if (!info?.isDirectory()) throw new ProjectActionError('project_not_found')
    const error = await shell.openPath(dir)
    if (error) {
      getServices().log.warn('project.show.failed', { error })
      throw new ProjectActionError('project_not_found')
    }
  })
  handle(IpcChannel.openEditor, async (projectId) => {
    // Only checks the folder: a damaged project also opens, so the editor can offer the raw
    // video and recreate the edit (F-12).
    assertProjectId(projectId as string)
    const ids = await getServices().store.listProjectIds()
    if (!ids.includes(projectId as string)) throw new ProjectActionError('project_not_found')
    const mainWindow = options.mainWindow()
    if (!mainWindow) return
    // A-04: background images replaced in an earlier session go; the one in use stays.
    const { store } = getServices()
    const current = await loadProjectById(store, projectId)
      .then((project) => backgroundImageFile(project.style.background))
      .catch(() => undefined)
    if (current !== undefined) {
      await pruneBackgroundImages(store.projectDir(projectId as string), current).catch(
        (error: unknown) => getServices().log.warn('background.prune.failed', { error }),
      )
    }
    await loadPage(mainWindow, 'editor', { project: projectId as string })
  })

  // A-04: wallpaper with your own image. The renderer never sees the original path: main shows
  // the dialog, checks the file and copies it into the project.
  handle(IpcChannel.pickBackgroundImage, async (projectId) => {
    assertProjectId(projectId as string)
    const { store, log } = getServices()
    const ids = await store.listProjectIds()
    if (!ids.includes(projectId as string)) throw new ProjectActionError('project_not_found')
    const source = await chooseBackgroundImage(options.mainWindow)
    if (!source) return null
    const name = await importBackgroundImage(store.projectDir(projectId as string), source)
    log.info('background.image.imported')
    return name
  })

  handle(IpcChannel.loadEvents, async (projectId) => {
    assertProjectId(projectId as string)
    return (await getServices().store.readText(projectId as string, PROJECT_FILES.events)) ?? ''
  })
  // A-06: the captions read transcript.json, and caption edits correct it.
  handle(IpcChannel.loadTranscript, async (projectId) => {
    assertProjectId(projectId as string)
    return loadTranscriptText(getServices().store, projectId as string)
  })
  handle(IpcChannel.saveTranscript, async (projectId, transcript) => {
    assertProjectId(projectId as string)
    await saveEditedTranscript(getServices().store, projectId as string, transcript)
  })
}

/** The picked image's path, or null when cancelled. */
async function chooseBackgroundImage(
  mainWindowOf: () => BrowserWindow | undefined,
): Promise<string | null> {
  // Dev builds (and CI smoke builds) only: KAMO_SMOKE_BACKGROUND_IMAGE=<file> stands in for the native dialog, which
  // automated checks cannot drive. A packaged app always shows the dialog.
  const smoke = process.env['KAMO_SMOKE_BACKGROUND_IMAGE']
  if (smoke && debugHooksAllowed(app.isPackaged)) return smoke
  const i18n = await createI18n(await uiLocale())
  const options = {
    title: i18n.t('editor.panel.imagePickTitle'),
    properties: ['openFile'] as Array<'openFile'>,
    filters: [
      { name: i18n.t('editor.panel.imageFilter'), extensions: BACKGROUND_IMAGE_FILTER_EXTENSIONS },
    ],
  }
  const mainWindow = mainWindowOf()
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}
