import { describe, expect, it } from 'vitest'
import {
  AUDIO_MAX_NUDGE,
  AUDIO_SEEK_DRIFT_S,
  DEFAULT_START_LEAD_S,
  alignAudio,
  audioGain,
  audioInRange,
  audioTimeS,
  createAudioSyncState,
  driftCorrection,
  type AudioClock,
  type MediaClock,
} from './audio-sync.ts'

class FakeMedia implements AudioClock {
  currentTime = 0
  duration = 10
  paused = true
  seeking = false
  readyState = 4
  playbackRate = 1
  volume = 1
  muted = false
  plays = 0
  play(): Promise<void> {
    this.paused = false
    this.plays++
    return Promise.resolve()
  }
  pause(): void {
    this.paused = true
  }
}

function playing(at: number): MediaClock {
  const screen = new FakeMedia()
  screen.currentTime = at
  screen.paused = false
  return screen
}

describe('audio timing', () => {
  it('follows the export rule: audio time = video time − offsetMs', () => {
    expect(audioTimeS(0, 3)).toBe(3)
    expect(audioTimeS(250, 3)).toBeCloseTo(2.75)
    // Audio that started before the video: its first 120ms are skipped.
    expect(audioTimeS(-120, 0)).toBeCloseTo(0.12)
  })

  it('is silent before the first sample and after the end', () => {
    expect(audioInRange(-0.01, 10)).toBe(false)
    expect(audioInRange(0, 10)).toBe(true)
    expect(audioInRange(10, 10)).toBe(false)
    expect(audioInRange(50, Number.NaN)).toBe(true)
  })

  it('maps volume 0 to muted and clamps the rest', () => {
    expect(audioGain(0)).toEqual({ volume: 0, muted: true })
    expect(audioGain(0.4)).toEqual({ volume: 0.4, muted: false })
    expect(audioGain(3)).toEqual({ volume: 1, muted: false })
    expect(audioGain(Number.NaN)).toEqual({ volume: 0, muted: true })
  })
})

describe('driftCorrection', () => {
  it('plays at the screen rate when in sync', () => {
    expect(driftCorrection(0.002, 1)).toEqual({ seek: false, rate: 1 })
    expect(driftCorrection(-0.002, 1.5)).toEqual({ seek: false, rate: 1.5 })
  })

  it('slows down audio that is ahead and speeds up audio that is behind', () => {
    const ahead = driftCorrection(0.03, 1)
    const behind = driftCorrection(-0.03, 1)
    expect(ahead.seek).toBe(false)
    expect(ahead.rate).toBeLessThan(1)
    expect(behind.rate).toBeGreaterThan(1)
    expect(driftCorrection(0.1, 1).rate).toBeCloseTo(1 - AUDIO_MAX_NUDGE)
    expect(driftCorrection(-0.03, 2).rate).toBeCloseTo(2 * 1.03)
  })

  it('re-seeks past the limit', () => {
    expect(driftCorrection(AUDIO_SEEK_DRIFT_S + 0.01, 1).seek).toBe(true)
    expect(driftCorrection(-(AUDIO_SEEK_DRIFT_S + 0.01), 1).seek).toBe(true)
    expect(driftCorrection(Number.NaN, 1).seek).toBe(true)
  })

  it('converges a 100ms drift to under 10ms within a few seconds of play', () => {
    let drift = 0.1
    const tick = 1 / 30
    let t = 0
    while (Math.abs(drift) > 0.01 && t < 10) {
      const { rate } = driftCorrection(drift, 1)
      drift += (rate - 1) * tick
      t += tick
    }
    expect(Math.abs(drift)).toBeLessThanOrEqual(0.01)
    expect(t).toBeLessThan(5)
  })
})

describe('alignAudio', () => {
  const settings = { offsetMs: 500, volume: 0.8 }

  it('parks the audio on the matching sample while the screen is paused (seek, frame step)', () => {
    const screen = new FakeMedia()
    screen.currentTime = 4
    const audio = new FakeMedia()
    audio.paused = false
    alignAudio(screen, audio, settings)
    expect(audio.paused).toBe(true)
    expect(audio.currentTime).toBeCloseTo(3.5)
    expect(audio.volume).toBe(0.8)
  })

  it('starts on the screen clock and at its rate when the screen plays', () => {
    const screen = playing(2)
    screen.playbackRate = 1.25
    const audio = new FakeMedia()
    alignAudio(screen, audio, settings)
    expect(audio.plays).toBe(1)
    // A start lands a little ahead: the audio output starts after play().
    expect(audio.currentTime).toBeCloseTo(1.5 + DEFAULT_START_LEAD_S)
    expect(audio.playbackRate).toBe(1.25)
  })

  it('learns the start lead from what is left of the drift after a start', () => {
    const state = createAudioSyncState()
    const audio = new FakeMedia()
    alignAudio(playing(2), audio, settings, state)
    expect(audio.currentTime).toBeCloseTo(1.56)
    // Too early to tell: nothing changes.
    audio.currentTime = 1.6
    alignAudio(playing(2.1), audio, settings, state)
    expect(state.leadS).toBe(DEFAULT_START_LEAD_S)
    // 250ms later the audio trails by 20ms: the next start leads by 20ms more.
    audio.currentTime = 1.73
    alignAudio(playing(2.25), audio, settings, state)
    expect(state.leadS).toBeCloseTo(DEFAULT_START_LEAD_S + 0.02)
    expect(state.measureAtS).toBeNull()
    expect(audio.playbackRate).toBeGreaterThan(1)
    // Pausing and starting again uses it.
    alignAudio(new FakeMedia(), audio, settings, state)
    alignAudio(playing(3), audio, settings, state)
    expect(audio.currentTime).toBeCloseTo(2.5 + DEFAULT_START_LEAD_S + 0.02)
  })

  it('nudges small drift and re-seeks large drift while playing', () => {
    const screen = playing(5)
    const audio = new FakeMedia()
    audio.paused = false
    audio.currentTime = 4.53 // 30ms ahead of 4.5
    alignAudio(screen, audio, settings)
    expect(audio.currentTime).toBeCloseTo(4.53)
    expect(audio.playbackRate).toBeLessThan(1)

    audio.currentTime = 4.9
    alignAudio(screen, audio, settings)
    expect(audio.currentTime).toBeCloseTo(4.5 + DEFAULT_START_LEAD_S)
  })

  it('waits silently until the track begins, and stops after it ends', () => {
    const audio = new FakeMedia()
    alignAudio(playing(0.2), audio, settings)
    expect(audio.paused).toBe(true)
    expect(audio.currentTime).toBe(0)

    alignAudio(playing(0.6), audio, settings)
    expect(audio.paused).toBe(false)

    alignAudio(playing(10.6), audio, settings)
    expect(audio.paused).toBe(true)
  })

  it('keeps a muted track paused and applies volume changes live', () => {
    const audio = new FakeMedia()
    alignAudio(playing(3), audio, { offsetMs: 0, volume: 0 })
    expect(audio.paused).toBe(true)
    expect(audio.muted).toBe(true)

    alignAudio(playing(3), audio, { offsetMs: 0, volume: 0.5 })
    expect(audio.muted).toBe(false)
    expect(audio.volume).toBe(0.5)
    expect(audio.paused).toBe(false)
  })

  it('pauses while the screen buffers or seeks', () => {
    const screen = playing(3)
    const audio = new FakeMedia()
    audio.paused = false
    audio.currentTime = 2.5
    ;(screen as FakeMedia).readyState = 2
    alignAudio(screen, audio, settings)
    expect(audio.paused).toBe(true)
    ;(screen as FakeMedia).readyState = 4
    ;(screen as FakeMedia).seeking = true
    alignAudio(screen, audio, settings)
    expect(audio.paused).toBe(true)
  })
})
