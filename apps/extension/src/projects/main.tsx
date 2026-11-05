// projects.html: "All projects" (E-03, flows.md → Projects in the extension). The desktop Home's
// list (ProjectList) with its local playlists, on OPFS: open, rename, delete for good, the space
// the projects take with the 2GB warning, and the notice that projects live in this browser.
import {
  listProjects,
  loadProject,
  saveProject,
  type Playlist,
  type ProjectList as CoreProjectList,
} from '@kamo/core'
import { formatProjectDate, resolveLocale } from '@kamo/i18n'
import {
  ExtensionProjects,
  useT,
  type BrokenProjectData,
  type PlaylistsProps,
  type ProjectCardData,
} from '@kamo/ui'
import { useCallback, useEffect, useState } from 'react'
import { boot } from '../shared/boot.tsx'
import { editorPath } from '../shared/pages.ts'
import { PROJECTS_WARNING_BYTES } from '../shared/storage-space.ts'
import { OpfsProjectStore } from '../storage/opfs-store.ts'
import { findScreenFile } from '../storage/paths.ts'
import { PlaylistStore, opfsPlaylistIo } from '../storage/playlists.ts'
import { rebuildFromVideo } from '../storage/rebuild.ts'
import { recordError } from '../shared/error-log.ts'
import { collectDiagnostics, copyDiagnostics, openIssue } from './diagnostics.ts'

const store = new OpfsProjectStore()
const playlistStore = new PlaylistStore(opfsPlaylistIo())
const FIRST_FRAME = 'frames/0000.jpg'

const PLAYLIST_ERROR_KEYS: Record<string, string> = {
  invalid_name: 'playlists.errors.invalidName',
  playlist_not_found: 'playlists.errors.notFound',
  too_many_playlists: 'playlists.errors.tooMany',
  playlist_full: 'playlists.errors.full',
  newer_version: 'playlists.errors.newerVersion',
}

interface Listing {
  projects: ProjectCardData[]
  broken: BrokenProjectData[]
  usedBytes: number
}

async function readListing(urls: string[]): Promise<Listing> {
  const list: CoreProjectList = await listProjects(store)
  const projects = await Promise.all(
    list.projects.map(async (project) => {
      const thumbnail = await store.readBlob(project.id, FIRST_FRAME).catch(() => null)
      const thumbnailUrl = thumbnail ? URL.createObjectURL(thumbnail) : null
      if (thumbnailUrl) urls.push(thumbnailUrl)
      return {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        durationMs: project.durationMs,
        thumbnailUrl,
      }
    }),
  )
  const broken = await Promise.all(
    list.broken.map(async ({ projectId, error }) => ({
      projectId,
      code: error.code,
      hasVideo: (await findScreenFile((name) => store.fileSize(projectId, name))) !== null,
    })),
  )
  let usedBytes = 0
  for (const id of await store.listProjectIds()) usedBytes += await store.projectSize(id)
  return { projects, broken, usedBytes }
}

function openEditor(projectId: string): void {
  location.href = chrome.runtime.getURL(editorPath(projectId))
}

function ProjectsPage() {
  const t = useT()
  const [listing, setListing] = useState<Listing | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    const urls: string[] = []
    let cancelled = false
    void readListing(urls)
      .then(async (next) => {
        if (cancelled) return
        setListing(next)
        // A project deleted (here or with the extension's data) leaves every playlist.
        const existing = new Set([
          ...next.projects.map((p) => p.id),
          ...next.broken.map((b) => b.projectId),
        ])
        await playlistStore.keepOnly(existing).catch(() => undefined)
        if (!cancelled) setPlaylists(await playlistStore.list())
      })
      // Cleared extension data or a broken folder: an empty list, no error (E-03 edge).
      .catch(() => {
        if (cancelled) return
        setListing({ projects: [], broken: [], usedBytes: 0 })
        setPlaylists([])
      })
    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [version])

  /** Runs an action; a failure shows a message and the list is read again. */
  const run = (action: () => Promise<unknown>, keys: Record<string, string> = {}) => {
    setError(null)
    void action()
      .then(reload)
      .catch((cause: unknown) => {
        const code = (cause as { code?: string } | null)?.code
        setError(t((code && keys[code]) || 'projects.errors.failed'))
        void recordError('projects.action_failed', 'projects', code ?? cause)
        reload()
      })
  }

  const playlistProps: PlaylistsProps = {
    playlists: playlists ?? [],
    onCreate: async (name, projectIds) => {
      setError(null)
      try {
        const created = await playlistStore.create(name, projectIds)
        setPlaylists(await playlistStore.list())
        return created.id
      } catch (cause) {
        const code = (cause as { code?: string } | null)?.code
        setError(t((code && PLAYLIST_ERROR_KEYS[code]) || 'playlists.errors.failed'))
        return null
      }
    },
    onRename: (id, name) => run(() => playlistStore.rename(id, name), PLAYLIST_ERROR_KEYS),
    onDelete: (id) => run(() => playlistStore.delete(id), PLAYLIST_ERROR_KEYS),
    onAdd: (id, projectId) => run(() => playlistStore.add(id, [projectId]), PLAYLIST_ERROR_KEYS),
    onRemove: (id, projectId) =>
      run(() => playlistStore.remove(id, [projectId]), PLAYLIST_ERROR_KEYS),
    onReorder: (id, projectIds) =>
      run(() => playlistStore.reorder(id, projectIds), PLAYLIST_ERROR_KEYS),
  }

  return (
    <ExtensionProjects
      usedBytes={listing?.usedBytes ?? null}
      warningBytes={PROJECTS_WARNING_BYTES}
      error={error}
      diagnostics={{ load: collectDiagnostics, onCopy: copyDiagnostics, onOpenIssue: openIssue }}
      list={{
        projects: listing && playlists ? listing.projects : null,
        broken: listing?.broken ?? [],
        playlists: playlistProps,
        onOpen: openEditor,
        onRename: (id, name) =>
          run(async () => saveProject(store, { ...(await loadProject(store, id)), name })),
        // The extension has no trash: deleting removes the folder for good (E-03).
        onDelete: (id) => run(() => store.deleteProject(id)),
        // No folder to show in a browser: open the project instead.
        onShowInFolder: openEditor,
        onOpenRawVideo: (id) =>
          run(() =>
            rebuildFromVideo(store, id, (date) =>
              t('project.defaultName', {
                date: formatProjectDate(resolveLocale(navigator.languages), date),
              }),
            ).then(() => openEditor(id)),
          ),
      }}
    />
  )
}

await boot(() => <ProjectsPage />, 'extension.projects.title')
