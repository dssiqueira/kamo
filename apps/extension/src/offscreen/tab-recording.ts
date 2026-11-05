// One tab recording, in the offscreen document (E-01). The MV3 service worker cannot record
// media, so the stream id from `chrome.tabCapture.getMediaStreamId` comes here, where
// `getUserMedia` turns it into a stream and `MediaRecorder` writes it to OPFS in 1s chunks.
//
//   tab stream ─┬─ video + tab sound ─▶ MediaRecorder ─▶ screen.webm   (chunk writer worker)
//               ├─ tab sound ─▶ AudioContext ─▶ speakers  (the tab would go silent otherwise)
//               └─ video ─▶ <video> ─▶ frames/0005.jpg every 5s
//   microphone ───────────────▶ MediaRecorder ─▶ audio.webm
//   camera (optional, A-03) ──▶ MediaRecorder ─▶ webcam.mp4  (webcam.webm without MP4)
//
// Files follow docs/data-model.md; project.json is written last, then the marker goes away.
// The microphone and the camera are extras: when they fail, the tab still records.
import {
  DEFAULT_WEBCAM,
  createProject,
  formatEvent,
  saveProject,
  type CaptureSession,
  type EventSource,
  type Source,
} from '@kamo/core'
import {
  CAPTURE_FPS,
  MICROPHONE_MIME_TYPE,
  pickVideoMimeType,
  videoBitrate,
} from '../shared/capture.ts'
import { RecordingTimer, frameFileName, nextFrameAt, type ClockSnapshot } from '../shared/clock.ts'
import {
  CAMERA_BITRATE,
  CAMERA_CONSTRAINTS,
  CAMERA_KEYFRAME_INTERVAL_MS,
  deviceConstraint,
  openWithFallback,
  pickCameraMimeType,
  webcamFileFor,
} from '../shared/devices.ts'
import type { Notice, PrepareRequest } from '../shared/messages.ts'
import { serializeMarker, type RecordingMarker } from '../storage/marker.ts'
import type { OpfsProjectStore } from '../storage/opfs-store.ts'
import { MICROPHONE_FILE, RECORDING_MARKER, SCREEN_FILE } from '../storage/paths.ts'
import { MIN_RECORDING_MS } from '../storage/recovery.ts'
import { ChunkWriter, WriteError } from './chunk-writer.ts'

const TIMESLICE_MS = 1000
const THUMBNAIL_WIDTH = 480
const THUMBNAIL_QUALITY = 0.8
const EVENTS_FILE = 'events.jsonl'

/** Thrown by `prepare`/`start` with the notice the popup shows. */
export class CaptureError extends Error {
  constructor(readonly notice: Notice) {
    super(notice.key)
    this.name = 'CaptureError'
  }
}

export interface TabRecordingOptions {
  store: OpfsProjectStore
  request: PrepareRequest
  /** Mouse events of the recorded tab (E-02, step 13). Without it, no events.jsonl. */
  events?: EventSource | undefined
  /** About once a second while recording, and on pause and resume. */
  onClock(clock: ClockSnapshot): void
  /** The recording ended on its own (tab closed, storage full) and the project is final. */
  onFinishedByItself(notices: Notice[]): void
}

/** Legacy `mandatory` constraints: the only way to hand a tabCapture stream id to getUserMedia. */
function tabConstraints(request: PrepareRequest): MediaStreamConstraints {
  const tab = { chromeMediaSource: 'tab', chromeMediaSourceId: request.streamId }
  return {
    video: {
      mandatory: {
        ...tab,
        minWidth: request.width,
        maxWidth: request.width,
        minHeight: request.height,
        maxHeight: request.height,
        maxFrameRate: CAPTURE_FPS,
      },
    },
    audio: request.tabAudio ? { mandatory: tab } : false,
  } as unknown as MediaStreamConstraints
}

/** Resolves after `count` new frames reach the <video>, or after `timeoutMs` on a still page. */
function waitForFrames(video: HTMLVideoElement, count: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let seen = 0
    const timer = setTimeout(resolve, timeoutMs)
    const onFrame = () => {
      seen++
      if (seen >= count) {
        clearTimeout(timer)
        resolve()
      } else video.requestVideoFrameCallback(onFrame)
    }
    video.requestVideoFrameCallback(onFrame)
  })
}

const MICROPHONE_PROCESSING = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
} as const

/** The microphone, the chosen one or the default (with a notice) when it is gone. */
async function openMicrophone(deviceId: string, notices: Notice[]): Promise<MediaStream | null> {
  try {
    const { stream, fellBack } = await openWithFallback(deviceId, (id) =>
      navigator.mediaDevices.getUserMedia({
        audio: { ...MICROPHONE_PROCESSING, ...deviceConstraint(id) },
      }),
    )
    if (fellBack) notices.push({ key: 'extension.notices.micFallback', tone: 'warning' })
    return stream
  } catch {
    notices.push({ key: 'recording.audio.micUnavailable', tone: 'warning' })
    return null
  }
}

/** The camera (video only: the microphone is its own file), like `openMicrophone`. */
async function openCamera(deviceId: string, notices: Notice[]): Promise<MediaStream | null> {
  try {
    const { stream, fellBack } = await openWithFallback(deviceId, (id) =>
      navigator.mediaDevices.getUserMedia({
        video: { ...CAMERA_CONSTRAINTS, ...deviceConstraint(id) },
        audio: false,
      }),
    )
    if (fellBack) notices.push({ key: 'extension.notices.cameraFallback', tone: 'warning' })
    return stream
  } catch {
    notices.push({ key: 'recording.camera.unavailable', tone: 'warning' })
    return null
  }
}

function whenStarted(recorder: MediaRecorder): Promise<number> {
  return new Promise((resolve) => {
    recorder.addEventListener('start', () => resolve(performance.now()), { once: true })
  })
}

function whenStopped(recorder: MediaRecorder | null): Promise<void> {
  if (!recorder || recorder.state === 'inactive') return Promise.resolve()
  return new Promise((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true })
    recorder.stop()
  })
}

export class TabRecording implements CaptureSession {
  readonly source: Source
  private readonly projectId: string
  private readonly writer = new ChunkWriter()
  private readonly timer = new RecordingTimer(CAPTURE_FPS)
  private readonly video = document.createElement('video')
  private audioContext: AudioContext | null = null
  private screenRecorder: MediaRecorder | null = null
  private micRecorder: MediaRecorder | null = null
  private micOffsetMs: number | undefined
  private cameraRecorder: MediaRecorder | null = null
  /** `webcam.mp4` (or `.webm`) once the camera records. */
  private cameraFile: string | null = null
  private cameraOffsetMs: number | undefined
  private cameraBytes = 0
  /** The camera recording can't be kept (write failure): it is left out of the project. */
  private cameraDropped = false
  private startedAt: Date | null = null
  /** Writes are chained so chunks land in order; a failure stops the recording. */
  private writes: Promise<void> = Promise.resolve()
  private nextFrameMs = 0
  private lastClockSecond = -1
  private ticker: ReturnType<typeof setInterval> | null = null
  private stopping: Promise<Notice[]> | null = null
  private readonly notices: Notice[] = []
  private pendingEvents: string[] = []
  /** E-02: when the tab went where the content script could not follow. */
  private eventsLostAtMs: number | undefined

  private constructor(
    private readonly options: TabRecordingOptions,
    private readonly tabStream: MediaStream,
    private readonly micStream: MediaStream | null,
    private readonly cameraStream: MediaStream | null,
  ) {
    const { request } = options
    this.projectId = request.projectId
    const settings = tabStream.getVideoTracks()[0]?.getSettings() ?? {}
    const width = settings.width ?? request.width
    this.source = {
      kind: 'tab',
      width,
      height: settings.height ?? request.height,
      // Video pixels per CSS pixel: the requested size may differ from what Chrome delivers.
      scaleFactor: request.scaleFactor * (width / request.width),
      fps: CAPTURE_FPS,
    }
  }

  /**
   * Opens the tab stream (and the microphone and camera) during the countdown, like the
   * desktop opens its devices, so recording can begin the moment the countdown leaves the page.
   */
  static async prepare(options: TabRecordingOptions): Promise<TabRecording> {
    const { request } = options
    let tabStream: MediaStream
    try {
      tabStream = await navigator.mediaDevices.getUserMedia(tabConstraints(request))
    } catch {
      throw new CaptureError({ key: 'extension.errors.captureFailed', tone: 'error' })
    }
    const notices: Notice[] = []
    const [micStream, cameraStream] = await Promise.all([
      request.microphone ? openMicrophone(request.microphoneId, notices) : null,
      request.camera ? openCamera(request.cameraId, notices) : null,
    ])
    const recording = new TabRecording(options, tabStream, micStream, cameraStream)
    recording.notices.push(...notices)
    try {
      await recording.attach()
    } catch (error) {
      recording.release()
      throw error
    }
    return recording
  }

  private async attach(): Promise<void> {
    const [videoTrack] = this.tabStream.getVideoTracks()
    if (!videoTrack)
      throw new CaptureError({ key: 'extension.errors.captureFailed', tone: 'error' })
    // The tab goes quiet while captured: play its sound back so the user still hears it.
    const audioTracks = this.tabStream.getAudioTracks()
    if (audioTracks.length) {
      this.audioContext = new AudioContext()
      this.audioContext
        .createMediaStreamSource(new MediaStream(audioTracks))
        .connect(this.audioContext.destination)
    }
    this.video.muted = true
    this.video.srcObject = new MediaStream([videoTrack])
    await this.video.play()
    // Closing the recorded tab ends the track: stop and keep what was recorded (E-01).
    videoTrack.addEventListener('ended', () => {
      this.notices.push({ key: 'extension.errors.tabClosed', tone: 'warning' })
      void this.finishByItself()
    })
  }

  /**
   * Starts recording. The caller removed the countdown from the page first; waiting for fresh
   * frames keeps its last frame out of the video (E-01).
   */
  async start(): Promise<ClockSnapshot> {
    await waitForFrames(this.video, 2, 300)
    const hasTabAudio = this.tabStream.getAudioTracks().length > 0
    const mimeType = pickVideoMimeType((type) => MediaRecorder.isTypeSupported(type), hasTabAudio)
    if (!mimeType) throw new CaptureError({ key: 'extension.errors.captureFailed', tone: 'error' })

    const { projectId } = this
    // The marker goes first: a folder with media and no marker would be invisible to recovery.
    this.startedAt = new Date()
    await this.writeMarker()
    await this.writer.open(projectId, SCREEN_FILE)
    this.screenRecorder = new MediaRecorder(this.tabStream, {
      mimeType,
      videoBitsPerSecond: videoBitrate(this.source),
      ...(hasTabAudio ? { audioBitsPerSecond: 128_000 } : {}),
    })
    this.pipe(this.screenRecorder, SCREEN_FILE)
    const screenStarted = whenStarted(this.screenRecorder)

    let micStarted: Promise<number> | null = null
    if (this.micStream && MediaRecorder.isTypeSupported(MICROPHONE_MIME_TYPE)) {
      await this.writer.open(projectId, MICROPHONE_FILE)
      this.micRecorder = new MediaRecorder(this.micStream, {
        mimeType: MICROPHONE_MIME_TYPE,
        audioBitsPerSecond: 128_000,
      })
      this.pipe(this.micRecorder, MICROPHONE_FILE)
      micStarted = whenStarted(this.micRecorder)
    }

    await this.prepareCamera()

    if (this.options.events) {
      await this.writer.open(projectId, EVENTS_FILE)
      await this.options.events.start((event) => this.pendingEvents.push(formatEvent(event)))
    }

    // Same task for all, so the microphone lands within a few ms of the video (≤ 40ms, E-01).
    const screenCalledAt = performance.now()
    this.screenRecorder.start(TIMESLICE_MS)
    this.micRecorder?.start(TIMESLICE_MS)
    let cameraCalledAt: number | null = null
    try {
      if (this.cameraRecorder) {
        cameraCalledAt = performance.now()
        this.cameraRecorder.start(TIMESLICE_MS)
      }
    } catch {
      this.dropCamera()
    }
    this.timer.start()
    const screenAt = await screenStarted
    if (micStarted) {
      // Where the first microphone sample sits on the video timeline (data-model.md offsetMs).
      const settings = this.micStream?.getAudioTracks()[0]?.getSettings() as
        (MediaTrackSettings & { latency?: number }) | undefined
      const latencyMs = (settings?.latency ?? 0) * 1000
      this.micOffsetMs = Math.round((await micStarted) - latencyMs - screenAt)
    }
    // Same convention for the camera (WebcamSettings.offsetMs, A-03), but from the start()
    // calls: Chrome's MP4 recorder fires `start` only once its encoder is up (~0.5s later),
    // yet its file still begins with the first frame after start(). The camera is already
    // warm (opened during the countdown), so that frame comes within one frame time.
    if (cameraCalledAt !== null && !this.cameraDropped) {
      this.cameraOffsetMs = Math.round(cameraCalledAt - screenCalledAt)
    }

    await this.writeMarker()
    this.nextFrameMs = 0
    this.tick()
    // MediaRecorder chunks also tick; the interval covers a still page that sends no frames.
    this.ticker = setInterval(() => this.tick(), TIMESLICE_MS)
    return this.timer.snapshot()
  }

  /** Recording time of a `Date.now()` instant (mouse events, E-02); null while paused. */
  recordedAt(wallMs: number): number | null {
    if (!this.startedAt || this.stopping) return null
    return this.timer.recordedAt(wallMs)
  }

  /** Clicks stop being captured from now on (E-02); only the first time counts. */
  markEventsLost(): void {
    if (!this.startedAt || this.stopping || this.eventsLostAtMs !== undefined) return
    this.eventsLostAtMs = Math.round(this.timer.elapsedMs())
  }

  async pause(): Promise<void> {
    if (this.timer.paused || this.stopping) return
    this.screenRecorder?.pause()
    this.micRecorder?.pause()
    if (this.cameraRecorder?.state === 'recording') this.cameraRecorder.pause()
    this.options.events?.pause()
    this.timer.pause()
    this.options.onClock(this.timer.snapshot())
  }

  async resume(): Promise<void> {
    if (!this.timer.paused || this.stopping) return
    this.screenRecorder?.resume()
    this.micRecorder?.resume()
    if (this.cameraRecorder?.state === 'paused') this.cameraRecorder.resume()
    this.options.events?.resume()
    this.timer.resume()
    this.options.onClock(this.timer.snapshot())
  }

  /** CaptureSession: stops, flushes every file and writes project.json (F-02). */
  async stop(): Promise<{ durationMs: number }> {
    await this.finish()
    return { durationMs: this.timer.elapsedMs() }
  }

  /** Stops and returns what the popup should say ("Saved", warnings). Safe to call twice. */
  finish(): Promise<Notice[]> {
    this.stopping ??= this.doFinish()
    return this.stopping
  }

  /** Countdown cancelled: nothing was recorded, nothing stays. */
  async cancel(): Promise<void> {
    await this.options.events?.stop()
    this.release()
    await this.options.store.deleteProject(this.projectId)
  }

  private async finishByItself(): Promise<void> {
    if (this.stopping) return
    this.options.onFinishedByItself(await this.finish())
  }

  private async doFinish(): Promise<Notice[]> {
    if (this.ticker !== null) clearInterval(this.ticker)
    this.timer.pause()
    const durationMs = this.timer.elapsedMs()
    await this.options.events?.stop()
    await Promise.all([
      whenStopped(this.screenRecorder),
      whenStopped(this.micRecorder),
      whenStopped(this.cameraRecorder),
    ])
    this.flushEvents()
    await this.writes.catch(() => undefined)
    const { projectId, options } = this
    for (const path of [SCREEN_FILE, MICROPHONE_FILE, EVENTS_FILE, this.cameraFile]) {
      if (path === null) continue
      await this.writer.close(projectId, path).catch(() => undefined)
    }
    this.release()

    if (!this.startedAt) {
      await options.store.deleteProject(projectId)
      return this.notices
    }
    if (durationMs < MIN_RECORDING_MS) {
      await options.store.deleteProject(projectId)
      return [{ key: 'recording.errors.tooShort', tone: 'warning' }]
    }
    const project = createProject({
      id: projectId,
      name: options.request.projectName,
      source: this.source,
      durationMs,
      createdAt: this.startedAt,
      audio: {
        mic: this.micRecorder !== null,
        system: this.tabStream.getAudioTracks().length > 0,
      },
    })
    if (this.micRecorder && this.micOffsetMs !== undefined) {
      project.audio.mic.offsetMs = this.micOffsetMs
    }
    if (this.eventsLostAtMs !== undefined && this.eventsLostAtMs < durationMs) {
      project.eventsLostAtMs = this.eventsLostAtMs
    }
    if (this.hasCamera()) {
      project.webcam = { ...structuredClone(DEFAULT_WEBCAM), offsetMs: this.cameraOffsetMs ?? 0 }
    } else if (this.cameraFile) {
      // Nothing usable was recorded: the file would only take space.
      await options.store.removeFile(projectId, this.cameraFile).catch(() => undefined)
    }
    await saveProject(options.store, project)
    await options.store.removeFile(projectId, RECORDING_MARKER)
    return [{ key: 'recording.saved', tone: 'success' }, ...this.notices]
  }

  private release(): void {
    for (const track of this.tabStream.getTracks()) track.stop()
    for (const track of this.micStream?.getTracks() ?? []) track.stop()
    for (const track of this.cameraStream?.getTracks() ?? []) track.stop()
    this.video.srcObject = null
    void this.audioContext?.close()
    this.writer.terminate()
  }

  private pipe(recorder: MediaRecorder, path: string): void {
    recorder.addEventListener('dataavailable', (event) => {
      const chunk = event.data
      if (chunk.size === 0) return
      this.writes = this.writes
        .then(async () => {
          const data = await chunk.arrayBuffer()
          const bytes = data.byteLength
          await this.writer.write(this.projectId, path, data)
          if (path === this.cameraFile) this.cameraBytes += bytes
        })
        .catch((error: unknown) => this.onWriteFailed(error, path))
      this.tick()
    })
  }

  private onWriteFailed(error: unknown, path = ''): void {
    if (this.stopping) return
    const full = error instanceof WriteError && error.code === 'quota'
    if (!full && path !== '' && path === this.cameraFile) {
      // The camera never costs the tab recording: drop it, keep recording (A-03).
      this.dropCamera()
      return
    }
    this.notices.push({
      key: full ? 'extension.errors.storageFull' : 'extension.errors.writeFailed',
      tone: 'error',
    })
    void this.finishByItself()
  }

  /** Sets up the camera recorder (not started yet). Never throws: the camera is optional. */
  private async prepareCamera(): Promise<void> {
    const stream = this.cameraStream
    const mimeType = pickCameraMimeType((type) => MediaRecorder.isTypeSupported(type))
    if (!stream?.active || !mimeType) {
      if (stream) this.notices.push({ key: 'recording.camera.unavailable', tone: 'warning' })
      return
    }
    const file = webcamFileFor(mimeType)
    try {
      await this.writer.open(this.projectId, file)
    } catch {
      this.notices.push({ key: 'recording.camera.failed', tone: 'warning' })
      return
    }
    this.cameraFile = file
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: CAMERA_BITRATE,
      // Chrome-only option, missing from the DOM types (see CAMERA_KEYFRAME_INTERVAL_MS).
      videoKeyFrameIntervalDuration: CAMERA_KEYFRAME_INTERVAL_MS,
    } as MediaRecorderOptions)
    this.cameraRecorder = recorder
    this.pipe(recorder, file)
    // Unplugged or taken by another app: MediaRecorder ends the file there (A-03 warns).
    const lost = () => {
      if (this.stopping || this.cameraDropped) return
      if (this.notices.some((notice) => notice.key === 'recording.camera.lost')) return
      this.notices.push({ key: 'recording.camera.lost', tone: 'warning' })
    }
    stream.getVideoTracks()[0]?.addEventListener('ended', lost)
    recorder.addEventListener('error', lost)
  }

  /** Recorded and kept: the project gets the bubble (A-03). */
  private hasCamera(): boolean {
    return (
      this.cameraFile !== null &&
      !this.cameraDropped &&
      this.cameraOffsetMs !== undefined &&
      this.cameraBytes > 0
    )
  }

  private dropCamera(): void {
    if (this.cameraDropped) return
    this.cameraDropped = true
    this.notices.push({ key: 'recording.camera.failed', tone: 'warning' })
    if (this.cameraRecorder?.state !== 'inactive') this.cameraRecorder?.stop()
    for (const track of this.cameraStream?.getTracks() ?? []) track.stop()
    void this.writeMarker().catch(() => undefined)
  }

  /** Clock for the badge and popup, thumbnails and the marker heartbeat. */
  private tick(): void {
    if (this.stopping || this.timer.paused || !this.startedAt) return
    const elapsed = this.timer.elapsedMs()
    const second = Math.floor(elapsed / 1000)
    if (second !== this.lastClockSecond) {
      this.lastClockSecond = second
      this.options.onClock(this.timer.snapshot())
      this.flushEvents()
    }
    if (elapsed >= this.nextFrameMs) {
      const frameMs = this.nextFrameMs
      this.nextFrameMs = nextFrameAt(frameMs)
      void this.saveThumbnail(frameMs).catch(() => undefined)
      if (frameMs > 0) void this.writeMarker().catch(() => undefined)
    }
  }

  private flushEvents(): void {
    if (!this.pendingEvents.length) return
    const data = new TextEncoder().encode(this.pendingEvents.join('')).buffer
    this.pendingEvents = []
    this.writes = this.writes
      .then(() => this.writer.write(this.projectId, EVENTS_FILE, data))
      .catch((error: unknown) => this.onWriteFailed(error))
  }

  /** Reference thumbnail, straight from the stream (data-model.md: 480px JPEG). */
  private async saveThumbnail(elapsedMs: number): Promise<void> {
    const { videoWidth, videoHeight } = this.video
    if (!videoWidth || !videoHeight) return
    const height = Math.max(2, Math.round((THUMBNAIL_WIDTH * videoHeight) / videoWidth))
    const canvas = new OffscreenCanvas(THUMBNAIL_WIDTH, height)
    canvas.getContext('2d')?.drawImage(this.video, 0, 0, THUMBNAIL_WIDTH, height)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: THUMBNAIL_QUALITY })
    const stream = await this.options.store.openWritable(
      this.projectId,
      `frames/${frameFileName(elapsedMs)}`,
    )
    const writer = stream.getWriter()
    await writer.write(new Uint8Array(await blob.arrayBuffer()))
    await writer.close()
  }

  /** Everything recovery needs, rewritten every 5s with the recorded time. */
  private async writeMarker(): Promise<void> {
    if (!this.startedAt) return
    const marker: RecordingMarker = {
      startedAt: this.startedAt.toISOString(),
      name: this.options.request.projectName,
      source: this.source,
      durationMs: this.timer.elapsedMs(),
      audio: {
        mic: this.micRecorder !== null,
        system: this.tabStream.getAudioTracks().length > 0,
        ...(this.micOffsetMs === undefined ? {} : { micOffsetMs: this.micOffsetMs }),
      },
      ...(this.cameraFile && !this.cameraDropped && this.cameraOffsetMs !== undefined
        ? { webcam: { file: this.cameraFile, offsetMs: this.cameraOffsetMs } }
        : {}),
    }
    await this.options.store.writeText(this.projectId, RECORDING_MARKER, serializeMarker(marker))
  }
}
