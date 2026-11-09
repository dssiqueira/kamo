// A short tick on each number of the 3-2-1 (F-01), so people who look away still know the
// recording is about to start. The sound is countdown-tick.wav (~85ms, 7.5KB, cut from a
// Pixabay sound effect, see THIRD_PARTY_NOTICES); the 1 plays it faster, so higher, to say
// "now". It ends ~0.9s before recording starts, so computer sound never captures it (F-04:
// Kamo plays no sound of its own while recording).
import tickUrl from './countdown-tick.wav'

/** Playback rate of each tick: 3 and 2 as recorded, 1 a fifth higher. */
export function tickRate(value: number): number {
  return value === 1 ? 1.5 : 1
}

const VOLUME = 0.6

/** Plays one tick. Never throws: no sound is better than a broken countdown. */
export function playCountdownTick(value: number): void {
  if (value < 1) return
  try {
    const audio = new Audio(tickUrl)
    audio.volume = VOLUME
    audio.preservesPitch = false
    audio.playbackRate = tickRate(value)
    void audio.play().catch(() => {})
  } catch {
    // no audio device, or audio blocked
  }
}
