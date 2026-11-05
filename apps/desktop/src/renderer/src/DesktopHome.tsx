import {
  Home,
  pickDisplay,
  useT,
  type HomeProps,
  type PlaylistsProps,
  type ProjectListProps,
} from '@kamo/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ipcErrorCode,
  type DisplayInfo,
  type PlaylistInfo,
  type ProjectListing,
  type RecordingStatus,
  type ScreenAccess,
} from '../../shared/api.ts'
import type { AudioWarning } from '../../shared/audio.ts'
import type { CameraWarning } from '../../shared/camera.ts'
import { DesktopInterruptedRecordings } from './DesktopInterruptedRecordings.tsx'
import { DesktopUpdateBanner } from './preferences/DesktopUpdateBanner.tsx'
import { useHomeAudio } from './useHomeAudio.ts'
import { useHomeCapture } from './useHomeCapture.ts'
import { useHomeCamera } from './useHomeCamera.ts'
import { useHomeTranscription } from './transcription/useHomeTranscription.tsx'

// Error codes from main (recording controller and capture helper) → i18n keys.
const ERROR_KEYS: Record<string, string> = {
  helper_missing: 'recording.errors.helperMissing',
  low_disk: 'recording.errors.lowDisk',
  display_not_found: 'recording.errors.displayNotFound',
  permission_denied: 'recording.errors.permissionDenied',
  too_short: 'recording.errors.tooShort',
  window_not_found: 'recording.errors.windowNotFound',
}
const WARNING_KEYS = {
  display_lost: 'recording.errors.displayLost',
  window_lost: 'recording.errors.windowLost',
  disk_full: 'recording.errors.diskFull',
} as const
// F-04: audio problems of a saved recording.
const AUDIO_WARNING_KEYS: Record<AudioWarning, string> = {
  mic_unavailable: 'recording.audio.micUnavailable',
  mic_lost: 'recording.audio.micLost',
  system_unavailable: 'recording.audio.systemUnavailable',
  audio_lost: 'recording.audio.lost',
  audio_failed: 'recording.audio.failed',
}
// A-03: camera problems of a saved recording.
const CAMERA_WARNING_KEYS: Record<CameraWarning, string> = {
  camera_unavailable: 'recording.camera.unavailable',
  camera_lost: 'recording.camera.lost',
  camera_failed: 'recording.camera.failed',
}

// Project actions (F-12): IPC error codes → i18n keys.
const PROJECT_ERROR_KEYS: Record<string, string> = {
  invalid_name: 'projects.errors.invalidName',
  project_not_found: 'projects.errors.notFound',
}

// Local playlists: IPC error codes → i18n keys.
const PLAYLIST_ERROR_KEYS: Record<string, string> = {
  invalid_name: 'playlists.errors.invalidName',
  playlist_not_found: 'playlists.errors.notFound',
  project_not_found: 'projects.errors.notFound',
  too_many_playlists: 'playlists.errors.tooMany',
  playlist_full: 'playlists.errors.full',
  newer_version: 'playlists.errors.newerVersion',
}

// F-01: thumbnails refresh at least once per second.
const THUMBNAIL_REFRESH_MS = 1000

type Notice = NonNullable<HomeProps['notice']>

/** Wires the platform-agnostic Home to the desktop: displays, projects and settings. */
export function DesktopHome() {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [screenAccess, setScreenAccess] = useState<ScreenAccess>('granted')
  const [status, setStatus] = useState<RecordingStatus | null>(null)
  const [listing, setListing] = useState<ProjectListing | null>(null)
  const [actionError, setActionError] = useState<Notice | null>(null)
  // F-01: the display picked last time, from settings.json.
  const remembered = useRef<string | null>(null)
  const t = useT()
  // F-04: microphone and computer sound toggles, meters and devices.
  const audio = useHomeAudio()
  // A-08: Screen · Window · Region, remembered like the display.
  const capture = useHomeCapture(displays, selectedId)
  // A-03: webcam toggle, camera picker and live preview.
  const camera = useHomeCamera()
  // A-05: "Transcribe" on the cards and the pack download offer.
  const transcription = useHomeTranscription()

  useEffect(() => window.kamo.onRecordingStatus(setStatus), [])

  // Projects: on mount and whenever main says something changed (save, rename, delete, new).
  const refreshProjects = useCallback(async () => {
    try {
      setListing(await window.kamo.listProjects())
    } catch {
      setListing((current) => current ?? { projects: [], broken: [] })
    }
  }, [])

  useEffect(() => {
    void refreshProjects()
    return window.kamo.onProjectsChanged(() => void refreshProjects())
  }, [refreshProjects])

  // Local playlists: on mount and whenever main says one changed.
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([])
  const [playlistsLoaded, setPlaylistsLoaded] = useState(false)
  const refreshPlaylists = useCallback(async () => {
    try {
      setPlaylists(await window.kamo.listPlaylists())
    } catch {
      // Keeps what it had; the next change tries again.
    } finally {
      setPlaylistsLoaded(true)
    }
  }, [])

  // The playlist shown last time (settings.json), kept across the editor and restarts.
  // undefined until read, so the list does not flash All first; a deleted one shows All.
  const [homePlaylistId, setHomePlaylistId] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    void window.kamo
      .getSettings()
      .then((settings) => !cancelled && setHomePlaylistId(settings.homePlaylistId || null))
      .catch(() => !cancelled && setHomePlaylistId(null))
    return () => {
      cancelled = true
    }
  }, [])
  const selectHomePlaylist = (playlistId: string | null) => {
    setHomePlaylistId(playlistId)
    void window.kamo.updateSettings({ homePlaylistId: playlistId ?? '' }).catch(() => {})
  }

  useEffect(() => {
    void refreshPlaylists()
    const offPlaylists = window.kamo.onPlaylistsChanged(() => void refreshPlaylists())
    // A recording deleted or a folder gone from outside hides its place in the playlists.
    const offProjects = window.kamo.onProjectsChanged(() => void refreshPlaylists())
    return () => {
      offPlaylists()
      offProjects()
    }
  }, [refreshPlaylists])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const refresh = async () => {
      clearTimeout(timer)
      const next = await window.kamo.listDisplays()
      if (cancelled) return
      setDisplays(next)
      setSelectedId((current) => pickDisplay(next, current, remembered.current))
      // Paused while the window is hidden; resumes when it comes back.
      if (document.visibilityState === 'visible') {
        timer = setTimeout(() => void refresh(), THUMBNAIL_REFRESH_MS)
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    // Settings first, so the remembered display wins over the primary on the first pass.
    void window.kamo
      .getSettings()
      .then((settings) => {
        remembered.current = settings.lastDisplayId ?? null
      })
      .catch(() => {})
      .finally(() => !cancelled && void refresh())
    void window.kamo.getScreenAccess().then((access) => !cancelled && setScreenAccess(access))
    const unsubscribe = window.kamo.onDisplaysChanged(() => void refresh())
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const selectDisplay = (id: string) => {
    setSelectedId(id)
    remembered.current = id
    void window.kamo.updateSettings({ lastDisplayId: id }).catch(() => {})
  }

  /** Runs a project action; a failure shows a notice and the list is re-read from disk. */
  const run = (action: () => Promise<unknown>) => {
    setActionError(null)
    void action().catch((error: unknown) => {
      const code = ipcErrorCode(error)
      setActionError({
        tone: 'error',
        text: t((code && PROJECT_ERROR_KEYS[code]) || 'projects.errors.failed'),
      })
      void refreshProjects()
    })
  }

  /** A playlist change: optimistic first, then main's answer (or the error) settles it. */
  const changePlaylists = (
    optimistic: ((current: PlaylistInfo[]) => PlaylistInfo[]) | null,
    action: () => Promise<unknown>,
  ) => {
    setActionError(null)
    if (optimistic) setPlaylists(optimistic)
    void action().catch((error: unknown) => {
      const code = ipcErrorCode(error)
      setActionError({
        tone: 'error',
        text: t((code && PLAYLIST_ERROR_KEYS[code]) || 'playlists.errors.failed'),
      })
      void refreshPlaylists()
    })
  }
  const editPlaylist =
    (playlistId: string, edit: (projectIds: string[]) => string[]) => (current: PlaylistInfo[]) =>
      current.map((p) => (p.id === playlistId ? { ...p, projectIds: edit(p.projectIds) } : p))

  const playlistProps: PlaylistsProps = {
    playlists,
    onCreate: async (name, projectIds) => {
      setActionError(null)
      try {
        const created = await window.kamo.createPlaylist(name, projectIds)
        setPlaylists((current) =>
          current.some((p) => p.id === created.id) ? current : [...current, created],
        )
        return created.id
      } catch (error) {
        const code = ipcErrorCode(error)
        setActionError({
          tone: 'error',
          text: t((code && PLAYLIST_ERROR_KEYS[code]) || 'playlists.errors.failed'),
        })
        return null
      }
    },
    onRename: (id, name) =>
      changePlaylists(
        (current) => current.map((p) => (p.id === id ? { ...p, name } : p)),
        () => window.kamo.renamePlaylist(id, name),
      ),
    onDelete: (id) =>
      changePlaylists(
        (current) => current.filter((p) => p.id !== id),
        () => window.kamo.deletePlaylist(id),
      ),
    onAdd: (id, projectId) =>
      changePlaylists(
        editPlaylist(id, (ids) => (ids.includes(projectId) ? ids : [...ids, projectId])),
        () => window.kamo.addToPlaylist(id, [projectId]),
      ),
    onRemove: (id, projectId) =>
      changePlaylists(
        editPlaylist(id, (ids) => ids.filter((other) => other !== projectId)),
        () => window.kamo.removeFromPlaylist(id, [projectId]),
      ),
    onReorder: (id, projectIds) =>
      changePlaylists(
        editPlaylist(id, () => projectIds),
        () => window.kamo.reorderPlaylist(id, projectIds),
      ),
  }

  const projects: ProjectListProps = {
    playlists: playlistProps,
    selectedPlaylistId: homePlaylistId ?? null,
    onSelectPlaylist: selectHomePlaylist,
    projects:
      homePlaylistId === undefined || !playlistsLoaded
        ? null
        : (listing?.projects.map((p) => ({ ...p, transcript: transcription.stateOf(p) })) ?? null),
    transcription: {
      onTranscribe: transcription.onTranscribe,
      onCancel: transcription.onCancelTranscription,
    },
    broken: listing?.broken ?? [],
    onOpen: (id) => run(() => window.kamo.openEditor(id)),
    onRename: (id, name) => {
      // Optimistic: the new name shows at once; projectsChanged confirms it from disk.
      setListing(
        (current) =>
          current && {
            ...current,
            projects: current.projects.map((p) => (p.id === id ? { ...p, name } : p)),
          },
      )
      run(() => window.kamo.renameProject(id, name))
    },
    onDelete: (id) => run(() => window.kamo.deleteProject(id)),
    onShowInFolder: (id) => run(() => window.kamo.showProjectInFolder(id)),
    // F-12: project.json is damaged, the recording is not: it opens in the system's player.
    onOpenRawVideo: (id) => run(() => window.kamo.openRawVideo(id)),
  }

  return (
    <Home
      onOpenSettings={() => void window.kamo.openSettings()}
      onFixPermission={() => void window.kamo.openOnboarding()}
      banner={
        <>
          <DesktopUpdateBanner />
          {transcription.offer}
          {/* Audio or camera that could not be recovered: the same notice as after a recording. */}
          <DesktopInterruptedRecordings
            onRecoveredWithWarnings={(projectId, audioWarnings, cameraWarnings) =>
              setStatus({ kind: 'saved', projectId, audioWarnings, cameraWarnings })
            }
          />
        </>
      }
      displays={displays}
      selectedId={selectedId}
      onSelect={selectDisplay}
      onRecord={() => {
        // A-08: what the button names; before settings load, the selected display.
        const target = capture.props ? capture.target : selectedId
        if (!target) return
        setStatus(null)
        setActionError(null)
        void window.kamo.startRecording(target)
      }}
      notice={actionError ?? notice(status, t)}
      needsPermission={screenAccess !== 'granted'}
      projects={projects}
      {...(audio ? { audio } : {})}
      {...(capture.props ? { capture: capture.props } : {})}
      {...(camera ? { camera } : {})}
    />
  )
}

function notice(status: RecordingStatus | null, t: (key: string) => string): Notice | null {
  if (!status) return null
  if (status.kind === 'error') {
    const tone = status.code === 'too_short' ? 'warning' : 'error'
    return { tone, text: t(ERROR_KEYS[status.code] ?? 'recording.errors.failed') }
  }
  // F-04, A-03: the video is saved, but some audio or the camera is missing or cut short.
  const audioTexts = [
    ...(status.audioWarnings ?? []).map((warning) => t(AUDIO_WARNING_KEYS[warning])),
    ...(status.cameraWarnings ?? []).map((warning) => t(CAMERA_WARNING_KEYS[warning])),
  ]
  if (status.warning || audioTexts.length) {
    const texts = [...(status.warning ? [t(WARNING_KEYS[status.warning])] : []), ...audioTexts]
    return { tone: 'warning', text: texts.join(' ') }
  }
  // The editor opens here once it exists; until then, Home confirms the save.
  return { tone: 'success', text: t('recording.saved') }
}
