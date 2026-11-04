import { describe, expect, it } from 'vitest'
import {
  ISSUES_URL,
  ISSUE_TITLE,
  MAX_ISSUE_URL_LENGTH,
  TRUNCATION_NOTE,
  buildDiagnostics,
  buildIssueUrl,
  isIssueUrl,
  type DiagnosticsInfo,
} from './diagnostics.ts'

const HOME = 'C:\\Users\\Maria Silva'

function info(overrides: Partial<DiagnosticsInfo> = {}): DiagnosticsInfo {
  return {
    appVersion: '0.1.0',
    electron: '45.2.1',
    chrome: '142.0.0.0',
    node: '24.1.0',
    os: 'Windows',
    osVersion: '10.0.26300',
    arch: 'x64',
    gpu: ['vendor 0x10de device 0x2484 (active) · driver NVIDIA 32.0'],
    permissions: [{ kind: 'microphone', status: 'granted' }],
    hardwareH264: true,
    helperPresent: true,
    logLines: ['{"t":"2026-11-04T10:00:00.000Z","level":"info","event":"app.start"}'],
    ...overrides,
  }
}

/** Body of a built issue URL, decoded. */
function bodyOf(url: string): string {
  return new URL(url).searchParams.get('body') ?? ''
}

describe('buildDiagnostics', () => {
  it('lists versions, OS, GPU, permissions, encoder, helper and the log', () => {
    const text = buildDiagnostics(info(), HOME)
    expect(text).toContain('App: 0.1.0')
    expect(text).toContain('Electron: 45.2.1 · Chrome: 142.0.0.0')
    expect(text).toContain('OS: Windows 10.0.26300 (x64)')
    expect(text).toContain('GPU: vendor 0x10de device 0x2484 (active)')
    expect(text).toContain('Permissions: microphone granted')
    expect(text).toContain('Hardware H.264 encoder (1080p30): yes')
    expect(text).toContain('Capture helper: present')
    expect(text).toContain('## Last 1 log lines')
    expect(text).toContain('"event":"app.start"')
  })

  it('says unknown and missing instead of guessing', () => {
    const text = buildDiagnostics(
      info({ hardwareH264: null, helperPresent: false, gpu: [], permissions: [] }),
      HOME,
    )
    expect(text).toContain('Hardware H.264 encoder (1080p30): unknown')
    expect(text).toContain('Capture helper: missing')
    expect(text).toContain('GPU: unknown')
    expect(text).toContain('Permissions: none needed')
  })

  it('redacts the home folder (and so the user name) anywhere in the text', () => {
    const text = buildDiagnostics(
      info({
        logLines: [
          '{"error":"ENOENT: C:\\\\Users\\\\Maria Silva\\\\Kamo\\\\projects\\\\x"}',
          'at c:/users/maria silva/AppData/kamo.js:1',
        ],
      }),
      HOME,
    )
    expect(text).not.toMatch(/maria silva/i)
    expect(text).toContain('~')
  })
})

describe('buildIssueUrl', () => {
  it('opens a new issue on Kamo with a title and the text in the body, URL-encoded', () => {
    const text = buildDiagnostics(info(), HOME)
    const url = buildIssueUrl(text)
    expect(url.startsWith(`${ISSUES_URL}?`)).toBe(true)
    expect(isIssueUrl(url)).toBe(true)
    expect(new URL(url).searchParams.get('title')).toBe(ISSUE_TITLE)
    expect(bodyOf(url)).toBe(text)
    // Characters that would break a URL are encoded.
    expect(url).not.toContain(' ')
    expect(url).not.toContain('\n')
    expect(url).not.toContain('#')
  })

  it('drops the oldest log lines when too long, keeps the newest and says so', () => {
    const logLines = Array.from({ length: 200 }, (_, i) => `{"n":${i},"event":"${'x'.repeat(60)}"}`)
    const text = buildDiagnostics(info({ logLines }), HOME)
    const url = buildIssueUrl(text)
    expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH)
    const body = bodyOf(url)
    expect(body.startsWith(TRUNCATION_NOTE)).toBe(true)
    expect(body).toContain('App: 0.1.0')
    expect(body).toContain('{"n":199,')
    expect(body).not.toContain('{"n":0,')
    // The code fence is still closed.
    expect(body.trimEnd().endsWith('```')).toBe(true)
  })

  it('still fits when the text has no log block at all', () => {
    const url = buildIssueUrl('é'.repeat(20_000))
    expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH)
    expect(bodyOf(url).startsWith(TRUNCATION_NOTE)).toBe(true)
  })

  it('only our own issues page counts as an issue URL', () => {
    expect(isIssueUrl('https://github.com/dssiqueira/kamo/issues/new?title=x')).toBe(true)
    expect(isIssueUrl('https://github.com/someone/else/issues/new?title=x')).toBe(false)
    expect(isIssueUrl('https://github.com/dssiqueira/kamo/issues/new.evil.com?x')).toBe(false)
  })
})
