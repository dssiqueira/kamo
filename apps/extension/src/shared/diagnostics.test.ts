import { describe, expect, it } from 'vitest'
import {
  ISSUES_URL,
  TRUNCATION_NOTE,
  browserName,
  buildExtensionDiagnostics,
  buildIssueUrl,
  isIssueUrl,
  type ExtensionDiagnosticsInfo,
} from './diagnostics.ts'
import {
  MAX_ERROR_ENTRIES,
  appendEntry,
  errorEntry,
  formatEntries,
  redactMessage,
} from './error-log.ts'

function info(overrides: Partial<ExtensionDiagnosticsInfo> = {}): ExtensionDiagnosticsInfo {
  return {
    extensionVersion: '0.2.0',
    browser: 'Google Chrome 131.0.6778.86',
    os: 'win',
    osVersion: '15.0.0',
    arch: 'x86-64',
    uiLanguage: 'pt-BR',
    languages: ['pt-BR', 'en'],
    storage: { usage: 12_345_678, quota: 100_000_000_000 },
    permissions: [
      { kind: 'microphone', status: 'granted' },
      { kind: 'sites', status: 'not granted' },
    ],
    hardwareH264: true,
    errorLines: ['{"t":"2026-11-05T00:00:00.000Z","level":"error","event":"x","where":"popup"}'],
    ...overrides,
  }
}

describe('extension diagnostics (F-17)', () => {
  it('has the desktop report shape without desktop-only fields', () => {
    const text = buildExtensionDiagnostics(info())
    expect(text).toBe(
      [
        '## Kamo diagnostics',
        'Extension: 0.2.0',
        'Browser: Google Chrome 131.0.6778.86',
        'OS: Windows 15.0.0 (x86-64)',
        'Locale: pt-BR (pages: pt-BR, en)',
        'Storage: 12.3 MB used of 100000.0 MB',
        'Permissions: microphone granted, sites not granted',
        'Hardware H.264 encoder (1080p30): yes',
        '',
        '## Last 1 errors',
        '```',
        '{"t":"2026-11-05T00:00:00.000Z","level":"error","event":"x","where":"popup"}',
        '```',
      ].join('\n'),
    )
    expect(text).not.toMatch(/Electron|Node|GPU|helper/)
  })

  it('says unknown when the browser does not tell', () => {
    const text = buildExtensionDiagnostics(
      info({ storage: null, hardwareH264: null, permissions: [], osVersion: '', errorLines: [] }),
    )
    expect(text).toContain('Storage: unknown')
    expect(text).toContain('Hardware H.264 encoder (1080p30): unknown')
    expect(text).toContain('OS: Windows (x86-64)')
    expect(text).toContain('## Last 0 errors')
  })

  it('names the browser from UA-CH, skipping GREASE and Chromium', () => {
    const brands = [
      { brand: 'Not)A;Brand', version: '99.0.0.0' },
      { brand: 'Chromium', version: '131.0.6778.86' },
      { brand: 'Google Chrome', version: '131.0.6778.86' },
    ]
    expect(browserName(brands, '')).toBe('Google Chrome 131.0.6778.86')
    expect(browserName(undefined, 'Mozilla/5.0 Chrome/130.0.1.2 Safari/537.36')).toBe(
      'Chrome 130.0.1.2',
    )
    expect(browserName([], 'nothing')).toBe('unknown')
  })

  it('opens only our issues page, dropping the oldest errors when too long', () => {
    const lines = Array.from({ length: 400 }, (_, i) => `error line ${i} ${'x'.repeat(40)}`)
    const url = buildIssueUrl(buildExtensionDiagnostics(info({ errorLines: lines })))
    expect(url.length).toBeLessThanOrEqual(8000)
    expect(isIssueUrl(url)).toBe(true)
    const body = new URL(url).searchParams.get('body') ?? ''
    expect(body.startsWith(TRUNCATION_NOTE)).toBe(true)
    expect(body).toContain('error line 399')
    expect(body).not.toContain('error line 0 ')
    expect(isIssueUrl('https://example.com/?x')).toBe(false)
    expect(buildIssueUrl('short')).toBe(
      `${ISSUES_URL}?title=Problem+report+%28extension%29&body=short`,
    )
  })
})

describe('error log ring buffer (F-17)', () => {
  it('never keeps a URL, a data URL or a user folder', () => {
    const text = redactMessage(
      'Cannot access contents of url "https://mail.example.com/inbox?id=1". ' +
        'data:image/png;base64,AAAA C:\\Users\\maria\\x /Users/joao/y /home/ana/z',
    )
    expect(text).not.toMatch(/example|maria|joao|ana|base64/)
    expect(text).toContain('<url>')
    expect(text).toContain('<home>')
  })

  it('cuts long messages and flattens lines', () => {
    const text = redactMessage(`a\nb ${'x'.repeat(1000)}`)
    expect(text.length).toBeLessThanOrEqual(300)
    expect(text.startsWith('a b')).toBe(true)
  })

  it('keeps the newest entries only and drops malformed ones', () => {
    let list: unknown = [{ nope: true }]
    for (let i = 0; i < MAX_ERROR_ENTRIES + 5; i++) {
      list = appendEntry(list, errorEntry(`e${i}`, 'popup', new Error('boom'), new Date(0)))
    }
    const entries = list as ReturnType<typeof appendEntry>
    expect(entries).toHaveLength(MAX_ERROR_ENTRIES)
    expect(entries[0]?.event).toBe('e5')
    expect(formatEntries(entries.slice(-1))).toEqual([
      '{"t":"1970-01-01T00:00:00.000Z","level":"error","event":"e54","where":"popup","message":"boom"}',
    ])
  })

  it('names DOMException-like errors and leaves out empty messages', () => {
    const error = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    expect(errorEntry('x', 'popup', error).message).toBe('NotAllowedError: denied')
    expect(errorEntry('x', 'popup', undefined)).not.toHaveProperty('message')
  })
})
