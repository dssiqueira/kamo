import {
  Home,
  pickDisplay,
  useT,
  type DisplayOption,
  type HomeProps,
  type ProjectListProps,
} from '@kamo/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ipcErrorCode,
  type ProjectListing,
  type RecordingStatus,
  type ScreenAccess,
} from '../../shared/api.ts'
import type { AudioWarning } from '../../shared/audio.ts'
import { DesktopUpdateBanner } from './preferences/DesktopUpdateBanner.tsx'
import { useHomeAudio } from './useHomeAudio.ts'

// Error codes from main (recording controller and capture helper) → i18n keys.
const ERROR_KEYS: Record<string, string> = {
  helper_missing: 'recording.errors.helperMissing',
  low_disk: 'recording.errors.lowDisk',
  display_not_found: 'recording.errors.displayNotFound',
  permission_denied: 'recording.errors.permissionDenied',
  too_short: 'recording.errors.tooShort',
}
const WARNING_KEYS = {
  display_lost: 'recording.errors.displayLost',
  disk_full: 'recording.errors.diskFull',
} as const
// F-04: audio problems of a saved recording.
const AUDIO_WARNING_KEYS: Record<AudioWarning, string> = {
  mic_unavailable: 'recording.audio.micUnavailable',
  mic_lost: 'recording.audio.micLost',
  system_unavailable: 'recording.audio.systemUnavailable',
  audio_failed: 'recording.audio.failed',
}

// Project actions (F-12): IPC error codes → i18n keys.
const PROJECT_ERROR_KEYS: Record<string, string> = {
  invalid_name: 'projects.errors.invalidName',
  project_not_found: 'projects.errors.notFound',
}

// F-01: thumbnails refresh at least once per second.
const THUMBNAIL_REFRESH_MS = 1000

type Notice = NonNullable<HomeProps['notice']>

/** Wires the platform-agnostic Home to the desktop: displays, projects and settings. */
export function DesktopHome() {
  const [displays, setDisplays] = useState<DisplayOption[]>([])
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

  const projects: ProjectListProps = {
    projects: listing?.projects ?? null,
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
    // The editor sees the damaged project.json and offers the raw video (F-12). Until the
    // editor page exists, main leaves Home as it is.
    onOpenRawVideo: (id) => run(() => window.kamo.openEditor(id)),
  }

  return (
    <Home
      onOpenSettings={() => void window.kamo.openSettings()}
      onFixPermission={() => void window.kamo.openOnboarding()}
      banner={<DesktopUpdateBanner />}
      displays={displays}
      selectedId={selectedId}
      onSelect={selectDisplay}
      onRecord={() => {
        if (!selectedId) return
        setStatus(null)
        setActionError(null)
        void window.kamo.startRecording(selectedId)
      }}
      notice={actionError ?? notice(status, t)}
      needsPermission={screenAccess !== 'granted'}
      projects={projects}
      {...(audio ? { audio } : {})}
    />
  )
}

function notice(status: RecordingStatus | null, t: (key: string) => string): Notice | null {
  if (!status) return null
  if (status.kind === 'error') {
    const tone = status.code === 'too_short' ? 'warning' : 'error'
    return { tone, text: t(ERROR_KEYS[status.code] ?? 'recording.errors.failed') }
  }
  // F-04: the video is saved, but some audio is missing or cut short.
  const audioTexts = (status.audioWarnings ?? []).map((warning) => t(AUDIO_WARNING_KEYS[warning]))
  if (status.warning || audioTexts.length) {
    const texts = [...(status.warning ? [t(WARNING_KEYS[status.warning])] : []), ...audioTexts]
    return { tone: 'warning', text: texts.join(' ') }
  }
  // The editor opens here once it exists; until then, Home confirms the save.
  return { tone: 'success', text: t('recording.saved') }
}
