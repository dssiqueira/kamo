import { describe, expect, it } from 'vitest'
import { defaultChoice, offerStage, recommendedPack, selectable } from './offer-state.ts'
import type { PackView, PacksView } from './types.ts'

function pack(id: PackView['id'], over: Partial<PackView> = {}): PackView {
  return {
    id,
    kind: id === 'video-compatibility' ? 'compatibility' : 'transcription',
    quality: id === 'transcribe-light' ? 'light' : id === 'transcribe-accurate' ? 'accurate' : null,
    sizeBytes: 150_000_000,
    sizeExact: true,
    installedVersion: null,
    availableVersion: '1.0.0',
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
  catalog: PacksView['catalog'] = 'ready',
  catalogError: string | null = null,
): PacksView {
  return {
    packs: [
      pack('transcribe-light', over.light),
      pack('transcribe-accurate', over.accurate),
      pack('video-compatibility', { installedVersion: '1.0.0', state: 'installed' }),
    ],
    catalog,
    catalogError,
  }
}

describe('offerStage', () => {
  it('lets the user choose once the list loaded, and waits while it loads', () => {
    expect(offerStage(view(), null)).toEqual({ stage: 'choosing', loading: false })
    expect(offerStage(view({}, 'loading'), null)).toEqual({ stage: 'choosing', loading: true })
    expect(offerStage(view({}, 'idle'), null)).toEqual({ stage: 'choosing', loading: true })
  })

  it('shows one catalog error, never a per-pack failure, when the list did not load', () => {
    const unpublished = view({}, 'error', 'catalog_unpublished')
    expect(offerStage(unpublished, null)).toEqual({
      stage: 'unavailable',
      error: 'catalog_unpublished',
    })
    // The user clicked Download: still the list's error, not "the download failed".
    expect(offerStage(unpublished, 'transcribe-accurate')).toEqual({
      stage: 'unavailable',
      error: 'catalog_unpublished',
    })
    expect(offerStage(view({}, 'error', 'offline'), null)).toMatchObject({ error: 'offline' })
    expect(offerStage(view({}, 'error', null), null)).toMatchObject({ error: 'offline' })
  })

  it('follows the chosen pack while it downloads, pauses or fails', () => {
    for (const state of ['not_installed', 'downloading', 'verifying', 'paused'] as const) {
      const stage = offerStage(view({ light: { state } }, 'loading'), 'transcribe-light')
      expect(stage).toMatchObject({ stage: 'working', pack: { id: 'transcribe-light', state } })
    }
    const failed = view({ accurate: { state: 'failed', error: 'checksum_mismatch' } })
    expect(offerStage(failed, 'transcribe-accurate')).toMatchObject({
      stage: 'working',
      pack: { id: 'transcribe-accurate', error: 'checksum_mismatch' },
    })
  })

  it('keeps a download that is already running when the offer opens', () => {
    const running = view({ accurate: { state: 'downloading' } })
    expect(offerStage(running, null)).toMatchObject({
      stage: 'working',
      pack: { id: 'transcribe-accurate' },
    })
    // Even with a list that failed to load again meanwhile.
    expect(
      offerStage(view({ accurate: { state: 'downloading' } }, 'error', 'offline'), null),
    ).toMatchObject({ stage: 'working' })
  })

  it('is ready once a transcription pack is installed (not the compatibility pack)', () => {
    expect(offerStage(view(), null).stage).not.toBe('ready')
    const installed = view({ light: { installedVersion: '1.0.0', state: 'installed' } })
    expect(offerStage(installed, 'transcribe-light')).toMatchObject({
      stage: 'ready',
      pack: { id: 'transcribe-light' },
    })
    // Installed packs are known locally: ready even when the list fails.
    const offline = view({ accurate: { installedVersion: '1.0.0', state: 'installed' } }, 'error')
    expect(offerStage(offline, null)).toMatchObject({ stage: 'ready' })
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

describe('selectable', () => {
  it('refuses a pack without a build for this computer', () => {
    expect(selectable(pack('transcribe-light'))).toBe(true)
    expect(selectable(pack('transcribe-light', { error: 'unsupported_platform' }))).toBe(false)
  })
})
