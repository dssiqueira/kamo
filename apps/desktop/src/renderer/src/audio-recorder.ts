// Hidden audio recorder page (F-04, D-024). Opens the microphone (getUserMedia) and, on
// Windows, the computer sound (getDisplayMedia loopback; the screen video track is stopped at
// once), measures their levels for the Home meters and records each one with MediaRecorder
// into its own file, streamed to main in 1s chunks.
//
// Every source goes through a Web Audio graph (source -> analyser, source -> recorder), so a
// microphone unplugged mid-recording leaves silence in the file instead of ending it (F-04).
// Nothing is ever connected to the speakers: Kamo plays no sound of its own (F-04).
import { levelFromRms, rmsOf, smoothLevel } from '@kamo/ui'
import {
  AUDIO_MIME_TYPES,
  type AudioDevice,
  type AudioSources,
  type AudioSourceStatus,
  type AudioTrackName,
  type RecorderCommand,
  type RecorderReport,
} from '../../shared/audio.ts'

/** Meter updates: 12.5 per second (F-04 asks for 10 to 15). */
const LEVEL_INTERVAL_MS = 80
/** MediaRecorder timeslice: a crash loses at most this much audio. */
const CHUNK_MS = 1000
const AUDIO_BITS_PER_SECOND = 128_000
const TRACKS: readonly AudioTrackName[] = ['mic', 'system']

interface OpenSource {
  stream: MediaStream
  node: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  samples: Float32Array<ArrayBuffer>
  level: number
  /** Microphone only: the device asked for (null = system default). */
  deviceId: string | null
  /** Microphone only: opened with noise suppression. */
  noiseSuppression: boolean
  /** Input latency the browser reports for this device, in ms (0 when unknown). */
  latencyMs: number
}

interface TrackRecorder {
  recorder: MediaRecorder | null
  destination: MediaStreamAudioDestinationNode | null
  writes: Promise<void>
  stopped: Promise<void>
}

let context: AudioContext | undefined
const open: Partial<Record<AudioTrackName, OpenSource>> = {}
const status: Record<AudioTrackName, AudioSourceStatus> = { mic: 'off', system: 'off' }
let devices: AudioDevice[] = []
/** Device changes are applied one at a time, in order. */
let queue: Promise<void> = Promise.resolve()
let recording: Promise<Map<AudioTrackName, TrackRecorder>> | undefined

const report = (message: RecorderReport) => void window.kamo.reportAudio(message).catch(() => {})

function pushStatus(): void {
  report({ type: 'status', status: { devices, mic: status.mic, system: status.system } })
}

function audioContext(): AudioContext {
  context ??= new AudioContext({ latencyHint: 'interactive' })
  if (context.state === 'suspended') void context.resume()
  return context
}

function close(track: AudioTrackName): void {
  const source = open[track]
  if (!source) return
  delete open[track]
  source.node.disconnect()
  for (const t of source.stream.getTracks()) t.stop()
}

function attach(
  track: AudioTrackName,
  stream: MediaStream,
  deviceId: string | null,
  noiseSuppression = false,
): void {
  const ctx = audioContext()
  const node = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  node.connect(analyser)
  const audioTrack = stream.getAudioTracks()[0]
  const latency = (audioTrack?.getSettings() as { latency?: number } | undefined)?.latency
  open[track] = {
    stream,
    node,
    analyser,
    samples: new Float32Array(analyser.fftSize),
    level: 0,
    deviceId,
    noiseSuppression,
    latencyMs: typeof latency === 'number' && latency > 0 ? latency * 1000 : 0,
  }
  audioTrack?.addEventListener('ended', () => {
    // Unplugged or taken away by the OS. The track's recorder ends here and the take keeps the
    // audio up to this point; the video goes on (F-04: the rest is silent, and Home warns).
    if (open[track]?.stream !== stream) return
    status[track] = 'unavailable'
    pushStatus()
    if (recording) report({ type: 'lost', track })
    void refreshDevices()
  })
}

function failureOf(error: unknown): 'denied' | 'unavailable' {
  const name = error instanceof DOMException ? error.name : ''
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'
}

async function openMic(deviceId: string | null, noiseSuppression: boolean): Promise<void> {
  // Chromium's voice-call processing is on by default. Automatic gain control pumped the
  // noise floor of a quiet (Bluetooth) microphone up and down, heard as clicks and seen as a
  // jumping meter while nobody spoke; the Windows meter of the same mic stayed flat. Echo
  // cancellation adds artifacts while the computer sound is captured too, and Kamo plays no
  // sound of its own. Noise suppression removes hiss without pumping; it is on by default and
  // the user may turn it off (Home "Audio settings") for music or a voice it muffles.
  const processing = { autoGainControl: false, echoCancellation: false, noiseSuppression }
  const constraints = (id: string | null): MediaStreamConstraints => ({
    audio: id ? { deviceId: { exact: id }, ...processing } : processing,
    video: false,
  })
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints(deviceId))
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    // The chosen microphone is gone: use the system default instead.
    if (!deviceId || (name !== 'OverconstrainedError' && name !== 'NotFoundError')) throw error
    stream = await navigator.mediaDevices.getUserMedia(constraints(null))
  }
  attach('mic', stream, deviceId, noiseSuppression)
}

async function openSystem(): Promise<void> {
  // Main answers with the screen plus WASAPI loopback (setDisplayMediaRequestHandler). Only
  // the audio is wanted: the video track is stopped right away and never recorded.
  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: { frameRate: 1, width: 16, height: 16 },
  })
  for (const video of stream.getVideoTracks()) {
    video.stop()
    stream.removeTrack(video)
  }
  if (stream.getAudioTracks().length === 0) throw new DOMException('no loopback', 'NotFoundError')
  attach('system', stream, null)
}

async function refreshDevices(): Promise<void> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    // Windows adds 'default' and 'communications' aliases; the picker offers "Default" itself.
    devices = all
      .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default')
      .filter((d) => d.deviceId !== 'communications' && d.deviceId !== '')
      .map((d) => ({ id: d.deviceId, label: d.label }))
  } catch {
    devices = []
  }
  pushStatus()
}

/** Opens what is asked and closes the rest. Never throws: failures become a status. */
function configure(sources: AudioSources): Promise<void> {
  queue = queue.then(async () => {
    const wanted: Record<AudioTrackName, boolean> = { mic: sources.mic, system: sources.system }
    const noiseSuppression = sources.micNoiseSuppression !== false
    for (const track of TRACKS) {
      const current = open[track]
      const changed =
        track === 'mic' &&
        current &&
        (current.deviceId !== sources.micDeviceId || current.noiseSuppression !== noiseSuppression)
      // Never swap the device under a running recorder.
      if ((!wanted[track] || changed) && !recording) close(track)
      if (!wanted[track]) {
        if (!recording) status[track] = 'off'
        continue
      }
      if (open[track] && status[track] === 'live') continue
      if (open[track]) close(track)
      status[track] = 'starting'
      pushStatus()
      try {
        if (track === 'mic') await openMic(sources.micDeviceId, noiseSuppression)
        else await openSystem()
        status[track] = 'live'
      } catch (error) {
        status[track] = failureOf(error)
      }
    }
    await refreshDevices()
  })
  return queue
}

function mimeType(): string | null {
  return AUDIO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

function recordTrack(track: AudioTrackName): TrackRecorder {
  const source = open[track]
  const type = mimeType()
  if (!source || status[track] !== 'live' || !type) {
    report({ type: 'failed', track, reason: status[track] === 'denied' ? 'denied' : 'unavailable' })
    return {
      recorder: null,
      destination: null,
      writes: Promise.resolve(),
      stopped: Promise.resolve(),
    }
  }
  // The device's own track goes straight to the encoder. Routing it through the Web Audio graph
  // (source → MediaStreamDestination) put every sample on this hidden page's real-time audio
  // thread, and under load (screen capture, webcam) a late render quantum was heard as a click.
  // The graph is still used, but only for the Home meters (the analyser).
  const recorder = new MediaRecorder(new MediaStream(source.stream.getAudioTracks()), {
    mimeType: type,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
  })
  const entry: TrackRecorder = {
    recorder,
    destination: null,
    writes: Promise.resolve(),
    stopped: new Promise((resolve) => recorder.addEventListener('stop', () => resolve())),
  }
  recorder.addEventListener('start', (event) => {
    // Wall-clock time of the event (not of this handler), minus the device's input latency:
    // the moment the first recorded sample was heard. Main compares it with the video start.
    const at = Date.now() - (performance.now() - event.timeStamp) - source.latencyMs
    report({ type: 'started', track, at: Math.round(at), mimeType: recorder.mimeType || type })
  })
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size === 0) return
    const blob = event.data
    entry.writes = entry.writes.then(async () => {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await window.kamo.writeAudioChunk(track, bytes).catch(() => {})
    })
  })
  recorder.start(CHUNK_MS)
  return entry
}

async function start(sources: AudioSources): Promise<Map<AudioTrackName, TrackRecorder>> {
  await configure(sources)
  const recorders = new Map<AudioTrackName, TrackRecorder>()
  for (const track of TRACKS) {
    if (sources[track]) recorders.set(track, recordTrack(track))
  }
  return recorders
}

async function stop(): Promise<void> {
  const current = recording
  if (!current) return
  const recorders = await current
  await Promise.all(
    [...recorders].map(async ([track, entry]) => {
      if (entry.recorder && entry.recorder.state !== 'inactive') entry.recorder.stop()
      await entry.stopped
      await entry.writes
      try {
        if (entry.destination) open[track]?.node.disconnect(entry.destination)
      } catch {
        // already disconnected (the source was closed)
      }
      report({ type: 'stopped', track })
    }),
  )
  if (recording === current) recording = undefined
}

async function forEachRecorder(action: (recorder: MediaRecorder) => void): Promise<void> {
  if (!recording) return
  for (const entry of (await recording).values()) {
    if (entry.recorder && entry.recorder.state !== 'inactive') action(entry.recorder)
  }
}

function onCommand(command: RecorderCommand): void {
  switch (command.type) {
    case 'configure':
      void configure(command.sources)
      break
    case 'start':
      if (!recording) recording = start(command.sources)
      break
    case 'pause':
      void forEachRecorder((r) => r.state === 'recording' && r.pause())
      break
    case 'resume':
      void forEachRecorder((r) => r.state === 'paused' && r.resume())
      break
    case 'stop':
      void stop()
      break
  }
}

setInterval(() => {
  let any = false
  for (const track of TRACKS) {
    const source = open[track]
    if (!source) continue
    any = true
    source.analyser.getFloatTimeDomainData(source.samples)
    source.level = smoothLevel(source.level, levelFromRms(rmsOf(source.samples)))
  }
  if (any) {
    report({
      type: 'levels',
      levels: { mic: open.mic?.level ?? 0, system: open.system?.level ?? 0 },
    })
  }
}, LEVEL_INTERVAL_MS)

navigator.mediaDevices.addEventListener('devicechange', () => void refreshDevices())
window.kamo.onAudioCommand(onCommand)
report({ type: 'ready' })
