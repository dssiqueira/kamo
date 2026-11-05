// Background service worker (MV3): the conductor of a recording (E-01). It holds no media:
// it gets the tab's stream id, runs the countdown over the tab, drives the offscreen recorder
// and keeps the toolbar icon and badge up to date. Minimal on purpose: no engine, no React.
//
// Chrome can stop an idle service worker at any time, so the session lives in
// chrome.storage.session and is read back on wake-up. While recording, the recorder's clock
// messages (about one per second) keep it awake.
import { tokens } from '@kamo/design-tokens'
import { captureSize } from '../shared/capture.ts'
import { formatBadge } from '../shared/badge.ts'
import {
  MOUSE_PORT,
  POPUP_PORT,
  STOP_COMMAND,
  isBackgroundMessage,
  type BackgroundRequest,
  type BackgroundState,
  type Notice,
  type OffscreenEvent,
  type OffscreenRequest,
  type OffscreenResponse,
  type RecordOptions,
  type Session,
} from '../shared/messages.ts'
import { removeCountdown, showCountdown } from '../content/countdown-overlay.ts'
import { startMouseCapture, stopMouseCapture } from '../content/mouse-capture.ts'
import { installErrorLog, recordError } from '../shared/error-log.ts'
import { fromExtensionPage, fromPage, OFFSCREEN_PAGE } from '../shared/sender.ts'
import { WELCOME_PAGE, editorPath } from '../shared/pages.ts'
import { GAZE_ALARM, GAZE_PERIOD_MINUTES, gazeAlarmAction } from './gaze-alarm.ts'
import { playGaze, setIdleIcon, setRecordingIcon } from './icon.ts'

const STATE_KEY = 'kamo.background'
const OFFSCREEN_URL = 'offscreen.html'
const COUNTDOWN_FROM = 3
const COUNTDOWN_STEP_MS = 1000
const colors = tokens.colors.light

let state: BackgroundState = { session: { phase: 'idle' }, notices: [] }
const loaded = loadState()
const ports = new Set<chrome.runtime.Port>()
let countdownTimer: ReturnType<typeof setTimeout> | null = null
// F-17: uncaught errors and failed recordings go to the local log (Copy diagnostics).
installErrorLog('service-worker')

async function loadState(): Promise<void> {
  const stored = (await chrome.storage.session.get(STATE_KEY))[STATE_KEY] as
    BackgroundState | undefined
  if (stored) state = stored
  // A countdown can't survive the worker restarting (its timer is gone), and a recording
  // can't survive the offscreen document going away.
  const phase = state.session.phase
  if (phase === 'countdown' || (phase !== 'idle' && !(await hasOffscreenDocument()))) {
    await setState({ session: { phase: 'idle' } })
  }
}

async function setState(next: Partial<BackgroundState>): Promise<void> {
  state = { ...state, ...next }
  await chrome.storage.session.set({ [STATE_KEY]: state })
  for (const port of ports) port.postMessage(state)
  await updateAction(state.session)
}

/** Read through a function: the session changes across every await. */
function isCurrent(projectId: string, phase: Session['phase']): boolean {
  const session: Session = state.session
  return session.phase !== 'idle' && session.phase === phase && session.projectId === projectId
}

function addNotices(notices: Notice[]): Notice[] {
  return [...state.notices, ...notices].slice(-3)
}

// ---------------------------------------------------------------------------------------------
// Toolbar icon: coral dot and the recorded time on the badge while recording (flows.md step 4);
// otherwise Kamo's head, glancing around once a minute (gaze-alarm.ts).

let lastBadge = ''

async function syncGazeAlarm(phase: Session['phase']): Promise<void> {
  const action = gazeAlarmAction(phase, (await chrome.alarms.get(GAZE_ALARM)) !== undefined)
  if (action === 'create') {
    await chrome.alarms.create(GAZE_ALARM, {
      delayInMinutes: GAZE_PERIOD_MINUTES,
      periodInMinutes: GAZE_PERIOD_MINUTES,
    })
  } else if (action === 'clear') {
    await chrome.alarms.clear(GAZE_ALARM)
  }
}

async function updateAction(session: Session): Promise<void> {
  await syncGazeAlarm(session.phase).catch(() => undefined)
  if (session.phase === 'recording') {
    const paused = session.clock.state === 'paused'
    const text = formatBadge(session.clock.elapsedMs, chrome.i18n.getUILanguage())
    if (text !== lastBadge) {
      lastBadge = text
      await chrome.action.setBadgeText({ text })
    }
    await chrome.action.setBadgeBackgroundColor({
      color: paused ? colors['on-surface-muted'] : colors.recording,
    })
    await chrome.action.setBadgeTextColor({ color: colors.surface })
    await setRecordingIcon(colors.recording, paused ? colors['on-surface-muted'] : null)
    return
  }
  lastBadge = ''
  await chrome.action.setBadgeText({ text: '' })
  await setIdleIcon()
}

// ---------------------------------------------------------------------------------------------
// Offscreen document: where the recording actually happens.

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  })
  return contexts.length > 0
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Records the tab the user chose (tabCapture stream, microphone and camera).',
  })
}

async function closeOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) await chrome.offscreen.closeDocument()
}

type ToOffscreen = OffscreenRequest extends infer R
  ? R extends OffscreenRequest
    ? Omit<R, 'target'>
    : never
  : never

async function toOffscreen(request: ToOffscreen): Promise<OffscreenResponse> {
  try {
    const response = (await chrome.runtime.sendMessage({ ...request, target: 'offscreen' })) as
      OffscreenResponse | undefined
    return (
      response ?? { ok: false, notice: { key: 'extension.errors.captureFailed', tone: 'error' } }
    )
  } catch {
    return { ok: false, notice: { key: 'extension.errors.captureFailed', tone: 'error' } }
  }
}

// ---------------------------------------------------------------------------------------------
// Countdown over the tab. The page gets the overlay only between Record and the first frame.

function countdownLook(value: number) {
  return {
    label: new Intl.NumberFormat(chrome.i18n.getUILanguage()).format(value),
    surface: colors.surface,
    text: colors['on-surface'],
    shadow: '0 8px 24px rgb(0 0 0 / 0.12)',
  }
}

async function injectCountdown(tabId: number, value: number): Promise<void> {
  // A page that refuses scripts (e.g. a PDF viewer) still records; the popup shows the count.
  await chrome.scripting
    .executeScript({ target: { tabId }, func: showCountdown, args: [countdownLook(value)] })
    .catch(() => undefined)
}

async function clearCountdown(tabId: number): Promise<void> {
  if (countdownTimer !== null) clearTimeout(countdownTimer)
  countdownTimer = null
  await chrome.scripting
    .executeScript({ target: { tabId }, func: removeCountdown })
    .catch(() => undefined)
}

// ---------------------------------------------------------------------------------------------
// Mouse capture in the recorded tab (E-02): injected once recording starts (the page has nothing
// of Kamo during the countdown but the overlay), again after each navigation, removed on stop.

/** Injects the mouse listener; when the tab is out of reach, clicks stop being captured. */
async function injectMouseCapture(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: startMouseCapture,
      args: [MOUSE_PORT],
    })
  } catch {
    // A site activeTab does not cover (another domain) and no optional host permission: the
    // video keeps recording, the editor says from when clicks are missing.
    if (state.session.phase === 'recording' && state.session.tabId === tabId) {
      await toOffscreen({ type: 'events-lost' })
    }
  }
}

async function removeMouseCapture(tabId: number): Promise<void> {
  await chrome.scripting
    .executeScript({ target: { tabId }, func: stopMouseCapture })
    .catch(() => undefined)
}

async function record(tabId: number, options: RecordOptions): Promise<void> {
  if (state.session.phase !== 'idle') return
  const tab = await chrome.tabs.get(tabId)
  const projectId = crypto.randomUUID()
  await setState({ session: { phase: 'starting', tabId, projectId }, notices: [] })

  let streamId: string
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })
  } catch {
    await fail({ key: 'extension.errors.captureFailed', tone: 'error' })
    return
  }
  const cssSize = { width: tab.width ?? 1280, height: tab.height ?? 720 }
  const size = captureSize(cssSize, options.devicePixelRatio)
  await ensureOffscreenDocument()
  const prepared = await toOffscreen({
    type: 'prepare',
    streamId,
    tabId,
    projectId,
    projectName: options.projectName,
    microphone: options.microphone,
    microphoneId: options.microphoneId,
    tabAudio: options.tabAudio,
    camera: options.camera,
    cameraId: options.cameraId,
    width: size.width,
    height: size.height,
    scaleFactor: size.width / cssSize.width,
  })
  if (!prepared.ok) {
    await fail(prepared.notice)
    return
  }
  // Cancelled (or the tab closed) while the stream was opening.
  if (!isCurrent(projectId, 'starting')) return
  await tickCountdown(tabId, projectId, COUNTDOWN_FROM)
}

async function tickCountdown(tabId: number, projectId: string, value: number): Promise<void> {
  if (value === 0) {
    await beginRecording(tabId, projectId)
    return
  }
  await setState({ session: { phase: 'countdown', tabId, projectId, value } })
  await injectCountdown(tabId, value)
  countdownTimer = setTimeout(() => {
    countdownTimer = null
    if (isCurrent(projectId, 'countdown')) void tickCountdown(tabId, projectId, value - 1)
  }, COUNTDOWN_STEP_MS)
}

async function beginRecording(tabId: number, projectId: string): Promise<void> {
  await setState({ session: { phase: 'starting', tabId, projectId } })
  // The overlay leaves the page before the recorder starts; the recorder then waits for
  // fresh frames so its last frame never makes it into the video (E-01).
  await clearCountdown(tabId)
  const started = await toOffscreen({ type: 'start' })
  if (!started.ok || !started.clock) {
    await fail(
      started.ok ? { key: 'extension.errors.captureFailed', tone: 'error' } : started.notice,
    )
    return
  }
  await setState({ session: { phase: 'recording', tabId, projectId, clock: started.clock } })
  await injectMouseCapture(tabId)
}

async function cancel(): Promise<void> {
  const session = state.session
  if (session.phase !== 'countdown' && session.phase !== 'starting') return
  await clearCountdown(session.tabId)
  await toOffscreen({ type: 'cancel' })
  await closeOffscreenDocument()
  await setState({ session: { phase: 'idle' } })
}

async function fail(notice: Notice): Promise<void> {
  const session = state.session
  // Already cancelled by the user: the failure is just the cancel catching up.
  if (session.phase === 'idle') return
  void recordError('recording.capture_failed', 'service-worker', `${session.phase}: ${notice.key}`)
  if (session.phase !== 'recording') await clearCountdown(session.tabId)
  await toOffscreen({ type: 'cancel' })
  await closeOffscreenDocument()
  await setState({ session: { phase: 'idle' }, notices: addNotices([notice]) })
}

async function stop(): Promise<void> {
  const session = state.session
  if (session.phase === 'countdown' || session.phase === 'starting') return cancel()
  if (session.phase !== 'recording') return
  await setState({
    session: { phase: 'saving', tabId: session.tabId, projectId: session.projectId },
  })
  await removeMouseCapture(session.tabId)
  const response = await toOffscreen({ type: 'stop' })
  if (!response.ok) void recordError('recording.stop_failed', 'service-worker', response.notice.key)
  await finished(
    session.projectId,
    response.ok ? (response.notices ?? []) : [{ key: 'recording.errors.failed', tone: 'error' }],
  )
}

/** The project is final (or was discarded). A saved one opens in the editor (flows.md step 6). */
async function finished(projectId: string, notices: Notice[]): Promise<void> {
  const session = state.session
  if (session.phase === 'idle' || session.projectId !== projectId) return
  await removeMouseCapture(session.tabId)
  await closeOffscreenDocument()
  const saved = notices.some((notice) => notice.key === 'recording.saved')
  // The editor says it was saved by opening; the popup keeps only the warnings.
  await setState({
    session: { phase: 'idle' },
    notices: addNotices(saved ? notices.filter((n) => n.key !== 'recording.saved') : notices),
  })
  if (saved) await openEditor(projectId)
}

/** The editor of one project, in a new tab next to the current one. */
async function openEditor(projectId: string): Promise<void> {
  await chrome.tabs
    .create({ url: chrome.runtime.getURL(editorPath(projectId)) })
    .catch(() => undefined)
}

async function setPaused(paused: boolean): Promise<void> {
  const session = state.session
  if (session.phase !== 'recording') return
  await toOffscreen({ type: paused ? 'pause' : 'resume' })
}

// ---------------------------------------------------------------------------------------------
// Listeners (registered synchronously, as MV3 requires).

async function onRequest(message: BackgroundRequest | OffscreenEvent): Promise<unknown> {
  await loaded
  switch (message.type) {
    case 'get-state':
      return state
    case 'record':
      await record(message.tabId, message.options)
      return state
    case 'cancel':
      await cancel()
      return state
    case 'pause':
      await setPaused(true)
      return state
    case 'resume':
      await setPaused(false)
      return state
    case 'stop':
      await stop()
      return state
    case 'dismiss-notices':
      await setState({ notices: [] })
      return state
    case 'clock': {
      const session = state.session
      if (session.phase === 'recording' && session.projectId === message.projectId) {
        await setState({ session: { ...session, clock: message.clock } })
      }
      return undefined
    }
    case 'finished':
      await finished(message.projectId, message.notices)
      return undefined
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isBackgroundMessage(message)) return false
  // Requests come from the extension's own pages (the popup), the recorder's events from the
  // offscreen document only; never from the content script in the recorded page.
  const recorderEvent = message.type === 'clock' || message.type === 'finished'
  if (recorderEvent ? !fromPage(sender, OFFSCREEN_PAGE) : !fromExtensionPage(sender)) return false
  onRequest(message).then(sendResponse, () => sendResponse(undefined))
  return true
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== POPUP_PORT || !fromExtensionPage(port.sender)) return
  ports.add(port)
  port.onDisconnect.addListener(() => ports.delete(port))
  void loaded.then(() => port.postMessage(state))
})

// ⌘⇧2 / Ctrl+Shift+2 (manifest `commands`): a Chrome shortcut, not a key listener (rule 2).
chrome.commands.onCommand.addListener((command) => {
  if (command === STOP_COMMAND) void loaded.then(stop)
})

// The recorded tab loaded a new page: the content script went with the old one (E-02).
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== 'complete') return
  void loaded.then(async () => {
    const session = state.session
    if (session.phase === 'recording' && session.tabId === tabId) await injectMouseCapture(tabId)
  })
})

// The recorded tab closed: the recorder sees its track end and saves on its own; a countdown
// on that tab just goes away.
chrome.tabs.onRemoved.addListener((tabId) => {
  void loaded.then(async () => {
    const session = state.session
    if (session.phase === 'idle' || session.tabId !== tabId) return
    if (session.phase === 'countdown' || session.phase === 'starting') await cancel()
  })
})

chrome.runtime.onStartup.addListener(() => void loaded.then(() => updateAction(state.session)))
// E-05: a first install opens the welcome page (not updates, nor Chrome updates).
chrome.runtime.onInstalled.addListener((details) => {
  void loaded.then(() => updateAction(state.session))
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) }).catch(() => undefined)
  }
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== GAZE_ALARM) return
  void loaded.then(async () => {
    if (state.session.phase !== 'idle') {
      await syncGazeAlarm(state.session.phase)
      return
    }
    // After a wake-up the icon state is unknown to this worker: settle it, then move the eye.
    await setIdleIcon()
    await playGaze()
  })
})
