import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LOCALES, loadMessages } from '@kamo/i18n'
import { describe, expect, it } from 'vitest'
import {
  MANIFEST_MESSAGES,
  OPTIONAL_HOST_PERMISSIONS,
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

  it('sets a CSP for its pages with no network and no remote code (L6)', () => {
    const csp = (buildManifest('0.2.0')['content_security_policy'] as { extension_pages: string })
      .extension_pages
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toMatch(/https?:|unsafe-(eval|inline)|\*/)
  })

  it('shows the head in the toolbar and the framed app icon everywhere else', () => {
    const manifest = buildManifest('0.2.0')
    expect(manifest).toMatchObject({
      icons: { 16: 'icons/icon-16.png', 128: 'icons/icon-128.png' },
      action: { default_icon: { 16: 'icons/toolbar-16.png', 32: 'icons/toolbar-32.png' } },
    })
  })

  it('asks for no host permission; <all_urls> only as optional (E-06)', () => {
    const manifest = buildManifest('0.2.0')
    expect(manifest).not.toHaveProperty('host_permissions')
    expect(manifest).not.toHaveProperty('content_scripts')
    expect(manifest['optional_host_permissions']).toEqual(['<all_urls>'])
    const { optional_host_permissions: _optional, ...rest } = manifest
    expect(JSON.stringify(rest)).not.toContain('<all_urls>')
    expect(PERMISSIONS).toEqual([
      'tabCapture',
      'offscreen',
      'storage',
      'activeTab',
      'scripting',
      'alarms',
      'downloads',
    ])
  })

  it('justifies every permission for the store, and only those (E-06)', () => {
    const doc = readFileSync(
      resolve(import.meta.dirname, '../../../docs/store/permissions.md'),
      'utf8',
    )
    const listed = [...doc.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1])
    expect(listed.sort()).toEqual([...PERMISSIONS].sort())
    for (const origin of OPTIONAL_HOST_PERMISSIONS) expect(doc).toContain(`\`${origin}\``)
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
