import { LOCALES, loadMessages } from '@kamo/i18n'
import { describe, expect, it } from 'vitest'
import {
  MANIFEST_MESSAGES,
  PERMISSIONS,
  buildManifest,
  chromeLocale,
  chromeMessages,
  chromeVersion,
} from './manifest.ts'

describe('manifest', () => {
  it('is MV3 with a module service worker and the popup', () => {
    const manifest = buildManifest('0.2.0')
    expect(manifest).toMatchObject({
      manifest_version: 3,
      version: '0.2.0',
      default_locale: 'en',
      background: { service_worker: 'service-worker.js', type: 'module' },
      action: { default_popup: 'popup.html' },
    })
  })

  it('asks for no host permission and never <all_urls> (E-06)', () => {
    const manifest = buildManifest('0.2.0')
    expect(manifest).not.toHaveProperty('host_permissions')
    expect(manifest).not.toHaveProperty('content_scripts')
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>')
    expect(PERMISSIONS).toEqual(['tabCapture', 'offscreen', 'storage', 'activeTab', 'scripting'])
  })

  it('stops with ⌘⇧2 / Ctrl+Shift+2', () => {
    expect(buildManifest('1.0.0')).toMatchObject({
      commands: {
        'stop-recording': { suggested_key: { default: 'Ctrl+Shift+2', mac: 'Command+Shift+2' } },
      },
    })
  })

  it('keeps prereleases out of the Chrome version', () => {
    expect(chromeVersion('0.2.0-next.3')).toBe('0.2.0')
    expect(buildManifest('0.2.0-next.3')).toMatchObject({ version_name: '0.2.0-next.3' })
    expect(() => chromeVersion('next')).toThrow()
  })
})

describe('_locales', () => {
  it('maps every UI language to a Chrome locale folder', () => {
    expect(LOCALES.map(chromeLocale)).toEqual(['en', 'pt_BR', 'es', 'zh_CN', 'ja'])
  })

  it('has every manifest text in every language, within the store limits', async () => {
    const english = await loadMessages('en')
    for (const locale of LOCALES) {
      const messages = chromeMessages(await loadMessages(locale), english)
      expect(Object.keys(messages)).toEqual(Object.keys(MANIFEST_MESSAGES))
      expect(messages['extName']?.message.length).toBeLessThanOrEqual(75)
      expect(messages['extDescription']?.message.length).toBeLessThanOrEqual(132)
    }
  })
})
