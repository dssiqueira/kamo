// Plays the microphone and computer-sound tracks (F-04) in the editor preview (F-10), on the
// screen video's clock: audio time = screen time − offsetMs, the same alignment the export mix
// uses (pipeline.ts: startS = trimStartS − offsetMs), with each track's volume (0 = muted).
// The screen video drives everything (play, pause, seek, rate, trim end); the audio elements
// follow it. Small drift is pulled in by nudging the audio's rate a few percent (inaudible),
// large drift by a re-seek.

/** The bits of an HTMLMediaElement the sync reads and writes (tests use fakes). */
export interface MediaClock {
  currentTime: number
  readonly duration: number
  readonly paused: boolean
  readonly seeking: boolean
  readonly readyState: number
  playbackRate: number
  play(): Promise<void>
  pause(): void
}

export interface AudioClock extends MediaClock {
  volume: number
  muted: boolean
}

export interface PreviewAudioSettings {
  /** project.audio.<track>.offsetMs (missing = 0) */
  offsetMs: number
  /** project.audio.<track>.volume, 0–1; 0 = muted */
  volume: number
}

/** Past this drift (s) while playing, the audio is re-seeked onto the screen's clock. */
export const AUDIO_SEEK_DRIFT_S = 0.15
/** Under this drift (s) the audio plays at the screen's own rate. */
export const AUDIO_NUDGE_DRIFT_S = 0.008
/** Largest rate change used to pull small drift in (5%, not audible as pitch with preservesPitch). */
export const AUDIO_MAX_NUDGE = 0.05
/** Rate change per second of drift: 20ms of drift plays 2% faster or slower. */
const NUDGE_PER_S = 1

/**
 * An audio element starts sounding a little after play() (the output device spins up), while
 * the screen video is already moving: started on the exact sample it would trail by that much.
 * So a start lands this far ahead, learned from each start (first guess 60ms, at most 250ms).
 */
export const DEFAULT_START_LEAD_S = 0.06
const MAX_START_LEAD_S = 0.25
/** Screen time after a start when its drift is measured (the audio is surely running by then). */
const LEAD_MEASURE_AFTER_S = 0.2

/** Per-element memory of the sync: the learned start lead and a start being measured. */
export interface AudioSyncState {
  leadS: number
  /** screen time (s) at which the current start is measured; null = not measuring */
  measureAtS: number | null
}

export function createAudioSyncState(): AudioSyncState {
  return { leadS: DEFAULT_START_LEAD_S, measureAtS: null }
}

/** HTMLMediaElement.HAVE_FUTURE_DATA: the screen video can move forward. */
const HAVE_FUTURE_DATA = 3

/** Where the track is (s) when the screen video is at `screenS`. */
export function audioTimeS(offsetMs: number, screenS: number): number {
  return screenS - offsetMs / 1000
}

/** The track has audio at `targetS` (before its first sample or after its end it is silent). */
export function audioInRange(targetS: number, durationS: number): boolean {
  return targetS >= 0 && (!Number.isFinite(durationS) || targetS < durationS)
}

/**
 * What to do about `driftS` (audio time − where it should be; positive = audio ahead) while
 * both play: re-seek when it is large, otherwise play slightly slower or faster so it
 * converges without a gap.
 */
export function driftCorrection(driftS: number, baseRate: number): { seek: boolean; rate: number } {
  const size = Math.abs(driftS)
  if (!Number.isFinite(driftS) || size > AUDIO_SEEK_DRIFT_S) return { seek: true, rate: baseRate }
  if (size < AUDIO_NUDGE_DRIFT_S) return { seek: false, rate: baseRate }
  const nudge = Math.min(AUDIO_MAX_NUDGE, size * NUDGE_PER_S)
  return { seek: false, rate: baseRate * (driftS > 0 ? 1 - nudge : 1 + nudge) }
}

/** The element volume for a track volume: clamped to 0–1, and muted at 0. */
export function audioGain(volume: number): { volume: number; muted: boolean } {
  const clamped = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0
  return { volume: clamped, muted: clamped === 0 }
}

/**
 * One alignment step: applies the volume, then either parks the audio where the screen is
 * (screen paused, seeking, buffering, a muted track, or outside the track) or keeps it
 * playing on the screen's clock. Runs on every play, pause, seek and rate change of the
 * screen and on each of its presented frames while playing.
 */
export function alignAudio(
  screen: MediaClock,
  audio: AudioClock,
  settings: PreviewAudioSettings,
  state: AudioSyncState = createAudioSyncState(),
): void {
  const gain = audioGain(settings.volume)
  if (audio.volume !== gain.volume) audio.volume = gain.volume
  if (audio.muted !== gain.muted) audio.muted = gain.muted

  const target = audioTimeS(settings.offsetMs, screen.currentTime)
  const inRange = audioInRange(target, audio.duration)
  const moving = !screen.paused && !screen.seeking && screen.readyState >= HAVE_FUTURE_DATA
  if (!moving || !inRange || gain.muted) {
    state.measureAtS = null
    if (!audio.paused) audio.pause()
    // Parked on the matching sample (or the start, before the track begins), ready to go.
    const parked = inRange ? target : target < 0 ? 0 : null
    if (parked !== null && !audio.seeking && Math.abs(audio.currentTime - parked) > 1 / 240) {
      audio.currentTime = parked
    }
    return
  }
  if (audio.seeking) return
  if (audio.paused) {
    // Starting: land a start lead ahead of the screen's time (see DEFAULT_START_LEAD_S), then
    // let the nudges keep it there.
    start(screen, audio, target, state)
    audio.playbackRate = screen.playbackRate
    void audio.play().catch(() => {})
    return
  }
  const drift = audio.currentTime - target
  if (state.measureAtS !== null) {
    if (screen.currentTime < state.measureAtS) return
    state.measureAtS = null
    // What is left of the drift is how far the lead missed: correct it for the next start.
    if (Math.abs(drift) <= AUDIO_SEEK_DRIFT_S) {
      state.leadS = Math.min(MAX_START_LEAD_S, Math.max(0, state.leadS - drift))
    }
  }
  const { seek, rate } = driftCorrection(drift, screen.playbackRate)
  if (seek) {
    // A seek while playing restarts the output too.
    start(screen, audio, target, state)
    if (audio.playbackRate !== screen.playbackRate) audio.playbackRate = screen.playbackRate
    return
  }
  if (audio.playbackRate !== rate) audio.playbackRate = rate
}

function start(screen: MediaClock, audio: AudioClock, target: number, state: AudioSyncState): void {
  const at = Number.isFinite(audio.duration)
    ? Math.min(target + state.leadS, audio.duration)
    : target + state.leadS
  if (Math.abs(audio.currentTime - at) > 1 / 240) audio.currentTime = at
  state.measureAtS = screen.currentTime + LEAD_MEASURE_AFTER_S
}

/** Screen events after which the audio is re-aligned. */
const SCREEN_EVENTS = [
  'play',
  'playing',
  'pause',
  'seeking',
  'seeked',
  'ratechange',
  'waiting',
  'loadeddata',
] as const

/**
 * Keeps one audio element on the screen video's clock until the returned cleanup runs (which
 * also pauses it). `align()` re-applies the settings right away (volume or offset changed).
 */
export function syncAudio(
  screen: HTMLVideoElement,
  audio: HTMLAudioElement,
  settings: () => PreviewAudioSettings,
): { align(): void; stop(): void } {
  let stopped = false
  let frame = 0
  const state = createAudioSyncState()
  const align = () => {
    if (!stopped) alignAudio(screen, audio, settings(), state)
  }
  // Per presented frame while playing: that is when drift shows, and it costs one comparison.
  const onFrame = () => {
    frame = 0
    align()
    watch()
  }
  const watch = () => {
    if (stopped || frame || screen.paused) return
    frame = screen.requestVideoFrameCallback(onFrame)
  }
  const onScreen = () => {
    align()
    watch()
  }
  for (const name of SCREEN_EVENTS) screen.addEventListener(name, onScreen)
  audio.addEventListener('loadedmetadata', align)
  audio.addEventListener('seeked', align)
  onScreen()
  return {
    align,
    stop() {
      stopped = true
      if (frame) screen.cancelVideoFrameCallback(frame)
      for (const name of SCREEN_EVENTS) screen.removeEventListener(name, onScreen)
      audio.removeEventListener('loadedmetadata', align)
      audio.removeEventListener('seeked', align)
      audio.pause()
    },
  }
}
