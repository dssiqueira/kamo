// Hidden camera recorder page (A-03). Opens the camera (getUserMedia, video only: the
// microphone is recorded apart, F-04) and records it with MediaRecorder into one file,
// streamed to main in 1s chunks. Main opens this window at the countdown and closes it when
// the recording ends, so the camera is only on while it is needed.
import {
  CAMERA_CONSTRAINTS,
  CAMERA_MIME_TYPES,
  type CameraCommand,
  type CameraReport,
  type CameraSource,
} from '../../shared/camera.ts'

/** MediaRecorder timeslice: a crash loses at most this much video. */
const CHUNK_MS = 1000
/** About 19MB a minute at 720p30: sharp in a bubble, light on disk. */
const VIDEO_BITS_PER_SECOND = 2_500_000
/**
 * Chrome's MP4 recorder only closes a fragment at a key frame, and by default it may write
 * none until stop: a page that reloads or crashes would leave only the header. One key frame
 * a second makes every 1s chunk a playable fragment.
 */
const KEY_FRAME_INTERVAL_MS = 1000

interface OpenCamera {
  stream: MediaStream
  deviceId: string | null
}

interface Recording {
  recorder: MediaRecorder | null
  writes: Promise<void>
  stopped: Promise<void>
}

let camera: OpenCamera | undefined
let failure: 'denied' | 'unavailable' | undefined
/** Opening is done one at a time, in order. */
let queue: Promise<void> = Promise.resolve()
let recording: Promise<Recording> | undefined

const report = (message: CameraReport) => void window.kamo.reportCamera(message).catch(() => {})

function failureOf(error: unknown): 'denied' | 'unavailable' {
  const name = error instanceof DOMException ? error.name : ''
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'
}

function release(): void {
  for (const track of camera?.stream.getTracks() ?? []) track.stop()
  camera = undefined
}

async function getCamera(deviceId: string | null): Promise<MediaStream> {
  const constraints = (id: string | null): MediaStreamConstraints => ({
    video: id ? { ...CAMERA_CONSTRAINTS, deviceId: { exact: id } } : { ...CAMERA_CONSTRAINTS },
    audio: false,
  })
  try {
    return await navigator.mediaDevices.getUserMedia(constraints(deviceId))
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    // The chosen camera is gone: use the system default instead.
    if (!deviceId || (name !== 'OverconstrainedError' && name !== 'NotFoundError')) throw error
    return navigator.mediaDevices.getUserMedia(constraints(null))
  }
}

/** Opens the asked camera (once). Never throws: a failure is remembered for `start`. */
function open(source: CameraSource): Promise<void> {
  queue = queue.then(async () => {
    if (camera && camera.deviceId === source.deviceId && camera.stream.active) return
    release()
    try {
      const stream = await getCamera(source.deviceId)
      camera = { stream, deviceId: source.deviceId }
      failure = undefined
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        // Unplugged or taken by the OS: MediaRecorder ends the file here (A-03 warns).
        if (camera?.stream === stream && recording) report({ type: 'lost' })
      })
    } catch (error) {
      failure = failureOf(error)
    }
  })
  return queue
}

function mimeType(): string | null {
  return CAMERA_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

async function start(source: CameraSource): Promise<Recording> {
  await open(source)
  const type = mimeType()
  const stream = camera?.stream
  if (!stream || !stream.active || !type) {
    report({ type: 'failed', reason: failure ?? 'unavailable' })
    return { recorder: null, writes: Promise.resolve(), stopped: Promise.resolve() }
  }
  const recorder = new MediaRecorder(stream, {
    mimeType: type,
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    // Chrome-only option, missing from the DOM types.
    videoKeyFrameIntervalDuration: KEY_FRAME_INTERVAL_MS,
  } as MediaRecorderOptions)
  const entry: Recording = {
    recorder,
    writes: Promise.resolve(),
    stopped: new Promise((resolve) => recorder.addEventListener('stop', () => resolve())),
  }
  // Set right before start(): Chrome's MP4 recorder fires `start` only once its encoder is up
  // (~0.5s later), yet the file begins with the first frame after start(). The camera is
  // already warm (opened at the countdown), so that frame comes within one frame time.
  let calledAt = 0
  recorder.addEventListener('start', () => {
    // Main compares it with the video start to place the camera on the timeline.
    const at = calledAt
    const settings = stream.getVideoTracks()[0]?.getSettings()
    report({
      type: 'started',
      at: Math.round(at),
      mimeType: recorder.mimeType || type,
      width: Math.round(settings?.width ?? 0),
      height: Math.round(settings?.height ?? 0),
    })
  })
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size === 0) return
    const blob = event.data
    entry.writes = entry.writes.then(async () => {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await window.kamo.writeCameraChunk(bytes).catch(() => {})
    })
  })
  recorder.addEventListener('error', () => report({ type: 'lost' }))
  calledAt = Date.now()
  recorder.start(CHUNK_MS)
  return entry
}

async function stop(): Promise<void> {
  const current = recording
  if (!current) return
  const entry = await current
  if (entry.recorder && entry.recorder.state !== 'inactive') entry.recorder.stop()
  await entry.stopped
  await entry.writes
  if (recording === current) recording = undefined
  // The camera light goes off with the recording.
  release()
  report({ type: 'stopped' })
}

function onCommand(command: CameraCommand): void {
  switch (command.type) {
    case 'prepare':
      void open(command.source)
      break
    case 'start':
      if (!recording) recording = start(command.source)
      break
    case 'pause':
      void recording?.then((r) => r.recorder?.state === 'recording' && r.recorder.pause())
      break
    case 'resume':
      void recording?.then((r) => r.recorder?.state === 'paused' && r.recorder.resume())
      break
    case 'stop':
      void stop()
      break
  }
}

window.kamo.onCameraCommand(onCommand)
report({ type: 'ready' })
