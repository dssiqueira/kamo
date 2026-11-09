// A soft tick on each number of the 3-2-1 (F-01), so people who look away still know the
// recording is about to start. Made with an oscillator: no audio file ships with the app.
// The last tick ends ~0.9s before recording starts, so computer sound never captures it
// (F-04: Kamo plays no sound of its own while recording).

/** Pitch of each tick: 3 and 2 the same, 1 a fifth above, so the last one says "now". */
export function tickFrequency(value: number): number {
  return value === 1 ? 1175 : 784
}

const TICK_S = 0.09
const PEAK_GAIN = 0.12

let context: AudioContext | undefined

/** Plays one short tick. Never throws: no sound is better than a broken countdown. */
export function playCountdownTick(value: number): void {
  if (value < 1) return
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = tickFrequency(value)
    // A quick attack and an exponential fade: a soft "tik", no click at either end.
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + TICK_S)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + TICK_S + 0.02)
  } catch {
    // no audio device, or audio blocked
  }
}
