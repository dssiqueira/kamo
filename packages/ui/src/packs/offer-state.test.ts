import { describe, expect, it } from 'vitest'
import {
  addRateSample,
  defaultChoice,
  estimateSecondsLeft,
  finishStage,
  offerStage,
  packMeters,
  recommendedPack,
} from './offer-state.ts'
import type { PackView, PacksView } from './types.ts'

function pack(id: PackView['id'], over: Partial<PackView> = {}): PackView {
  return {
    id,
    quality: id === 'transcribe-light' ? 'light' : 'accurate',
    sizeBytes: id === 'transcribe-light' ? 147_951_465 : 487_601_967,
    installedVersion: null,
    updateAvailable: false,
    state: 'not_installed',
    progress: null,
    error: null,
    requiredBytes: null,
    ...over,
  }
}

function view(
  over: { light?: Partial<PackView>; accurate?: Partial<PackView> } = {},
  program: PacksView['program'] = 'ready',
): PacksView {
  return {
    packs: [pack('transcribe-light', over.light), pack('transcribe-accurate', over.accurate)],
    program,
  }
}

describe('offerStage', () => {
  it('lets the user choose right away: the models are known, nothing to load', () => {
    expect(offerStage(view(), null)).toEqual({ stage: 'choosing' })
  })

  it('says once that this build cannot transcribe, before offering any download', () => {
    expect(offerStage(view({}, 'missing'), null)).toEqual({
      stage: 'unavailable',
      error: 'program_missing',
    })
    const installed = view({ light: { installedVersion: 'rev1', state: 'installed' } }, 'missing')
    expect(offerStage(installed, 'transcribe-light').stage).toBe('unavailable')
  })

  it('follows the chosen pack while it downloads, pauses or fails', () => {
    for (const state of ['not_installed', 'downloading', 'verifying', 'paused'] as const) {
      const stage = offerStage(view({ light: { state } }), 'transcribe-light')
      expect(stage).toMatchObject({ stage: 'working', pack: { id: 'transcribe-light', state } })
    }
    for (const error of [
      'offline',
      'source_unreachable',
      'download_failed',
      'checksum_mismatch',
      'disk_space',
    ]) {
      const failed = view({ accurate: { state: 'failed', error } })
      expect(offerStage(failed, 'transcribe-accurate')).toMatchObject({
        stage: 'working',
        pack: { id: 'transcribe-accurate', error },
      })
    }
  })

  it('keeps a download that is already running when the offer opens', () => {
    const running = view({ accurate: { state: 'downloading' } })
    expect(offerStage(running, null)).toMatchObject({
      stage: 'working',
      pack: { id: 'transcribe-accurate' },
    })
  })

  it('is ready once a model is installed', () => {
    expect(offerStage(view(), null).stage).not.toBe('ready')
    const installed = view({ light: { installedVersion: 'rev1', state: 'installed' } })
    expect(offerStage(installed, 'transcribe-light')).toMatchObject({
      stage: 'ready',
      pack: { id: 'transcribe-light' },
    })
    const other = view({ accurate: { installedVersion: 'rev1', state: 'installed' } })
    expect(offerStage(other, null)).toMatchObject({
      stage: 'ready',
      pack: { id: 'transcribe-accurate' },
    })
  })
})

describe('defaultChoice', () => {
  it('recommends Light, and Accurate for Chinese and Japanese', () => {
    expect(recommendedPack('pt-BR')).toBe('transcribe-light')
    expect(recommendedPack('de')).toBe('transcribe-light')
    expect(recommendedPack('zh-CN')).toBe('transcribe-accurate')
    expect(recommendedPack('ja')).toBe('transcribe-accurate')
    expect(defaultChoice(view(), 'en')).toBe('transcribe-light')
  })

  it('picks a download left paused', () => {
    const paused = view({
      accurate: { state: 'paused', progress: { receivedBytes: 1, totalBytes: 2 } },
    })
    expect(defaultChoice(paused, 'en')).toBe('transcribe-accurate')
  })
})

describe('download estimate', () => {
  it('says nothing until it has seen enough of the download', () => {
    let samples = addRateSample([], { at: 0, bytes: 0 })
    samples = addRateSample(samples, { at: 1_000, bytes: 10_000_000 })
    expect(estimateSecondsLeft(samples, 152_000_000)).toBeNull()
  })

  it('divides what is left by the rate seen over the window', () => {
    let samples = addRateSample([], { at: 0, bytes: 0 })
    samples = addRateSample(samples, { at: 2_000, bytes: 20_000_000 })
    // 10 MB/s, 132 MB left.
    expect(estimateSecondsLeft(samples, 152_000_000)).toBeCloseTo(13.2)
  })

  it('forgets readings older than the window, so a slower link shows up', () => {
    let samples = addRateSample([], { at: 0, bytes: 0 })
    samples = addRateSample(samples, { at: 5_000, bytes: 50_000_000 })
    samples = addRateSample(samples, { at: 10_000, bytes: 55_000_000 })
    samples = addRateSample(samples, { at: 15_000, bytes: 60_000_000 })
    expect(samples[0]!.at).toBe(5_000)
    // 1 MB/s over the last 10 s, 92 MB left.
    expect(estimateSecondsLeft(samples, 152_000_000)).toBeCloseTo(92)
  })

  it('starts over when the count goes back (a new download) and with nothing arriving', () => {
    let samples = addRateSample([], { at: 0, bytes: 0 })
    samples = addRateSample(samples, { at: 2_000, bytes: 20_000_000 })
    samples = addRateSample(samples, { at: 3_000, bytes: 1_000 })
    expect(samples).toEqual([{ at: 3_000, bytes: 1_000 }])
    samples = addRateSample(samples, { at: 6_000, bytes: 1_000 })
    expect(estimateSecondsLeft(samples, 152_000_000)).toBeNull()
  })
})

describe('after the install', () => {
  it('asks first, then follows the transcript', () => {
    expect(finishStage(true, { state: 'done' })).toBe('asking')
    expect(finishStage(false, undefined)).toBe('transcribing')
    expect(finishStage(false, { state: 'queued' })).toBe('transcribing')
    expect(finishStage(false, { state: 'running', progress: 0.3 })).toBe('transcribing')
    expect(finishStage(false, { state: 'done' })).toBe('done')
    expect(finishStage(false, { state: 'failed', error: null })).toBe('failed')
    expect(finishStage(false, { state: 'no_audio' })).toBe('no_audio')
  })

  it('rates Light faster and Accurate more accurate', () => {
    const light = packMeters('light')
    const accurate = packMeters('accurate')
    expect(light.speed).toBeGreaterThan(accurate.speed)
    expect(accurate.accuracy).toBeGreaterThan(light.accuracy)
  })
})
