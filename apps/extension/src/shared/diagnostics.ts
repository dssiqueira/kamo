// "Copy diagnostics" in the extension (F-17): the same report as the desktop app's
// (apps/desktop/src/main/diagnostics.ts), minus what only exists there (Electron, Node, GPU,
// capture helper). Built only when the user opens it, shown before anything is copied, and it
// leaves the browser only if they paste it or submit the GitHub issue themselves (rule 3).
// Technical text for maintainers, so it stays in English in every UI language. Pure: tested.

export const ISSUES_URL = 'https://github.com/dssiqueira/kamo/issues/new'
export const ISSUE_TITLE = 'Problem report (extension)'
/** Browsers and GitHub reject very long URLs; 8KB is the safe ceiling commonly used. */
export const MAX_ISSUE_URL_LENGTH = 8000
export const TRUNCATION_NOTE =
  '[Diagnostics truncated to fit in a link: older error lines were left out. ' +
  'Use "Copy diagnostics" in Kamo and paste the full text here.]'

export interface ExtensionDiagnosticsInfo {
  extensionVersion: string
  /** e.g. `Google Chrome 131.0.6778.86`, from User-Agent Client Hints (or the UA string). */
  browser: string
  /** chrome.runtime.getPlatformInfo: `win`, `mac`, `linux`, `cros`… */
  os: string
  /** UA-CH platformVersion; '' when unknown. */
  osVersion: string
  arch: string
  /** The browser UI language and the languages the pages are offered in. */
  uiLanguage: string
  languages: readonly string[]
  /** navigator.storage.estimate(); null when unavailable. */
  storage: { usage: number; quota: number } | null
  /** `microphone granted`, `sites not granted`… */
  permissions: { kind: string; status: string }[]
  /** WebCodecs probe; null when it could not run. */
  hardwareH264: boolean | null
  /** Kept errors, oldest first, already redacted (shared/error-log.ts). */
  errorLines: string[]
}

const OS_NAMES: Record<string, string> = {
  win: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
  cros: 'ChromeOS',
  android: 'Android',
  openbsd: 'OpenBSD',
  fuchsia: 'Fuchsia',
}

function yesNo(value: boolean | null): string {
  return value === null ? 'unknown' : value ? 'yes' : 'no'
}

/** Bytes as MB with one decimal: maintainers read it, so no locale formatting. */
function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

export function buildExtensionDiagnostics(info: ExtensionDiagnosticsInfo): string {
  const os = OS_NAMES[info.os] ?? info.os
  const lines = [
    '## Kamo diagnostics',
    `Extension: ${info.extensionVersion}`,
    `Browser: ${info.browser}`,
    `OS: ${[os, info.osVersion].filter(Boolean).join(' ')} (${info.arch})`,
    `Locale: ${info.uiLanguage} (pages: ${info.languages.join(', ') || 'unknown'})`,
    `Storage: ${
      info.storage
        ? `${megabytes(info.storage.usage)} used of ${megabytes(info.storage.quota)}`
        : 'unknown'
    }`,
    `Permissions: ${
      info.permissions.length
        ? info.permissions.map((p) => `${p.kind} ${p.status}`).join(', ')
        : 'unknown'
    }`,
    `Hardware H.264 encoder (1080p30): ${yesNo(info.hardwareH264)}`,
    '',
    `## Last ${info.errorLines.length} errors`,
    '```',
    ...info.errorLines,
    '```',
  ]
  return lines.join('\n')
}

/** `Google Chrome 131.0.6778.86` from UA-CH brands, skipping the GREASE and Chromium ones. */
export function browserName(
  brands: readonly { brand: string; version: string }[] | undefined,
  userAgent: string,
): string {
  const real = (brands ?? []).filter((b) => !/not.?a.?brand/i.test(b.brand))
  const named = real.find((b) => b.brand !== 'Chromium') ?? real[0]
  if (named) return `${named.brand} ${named.version}`
  const match = /Chrome\/([\d.]+)/.exec(userAgent)
  return match ? `Chrome ${match[1]}` : 'unknown'
}

export function issueUrl(body: string, title = ISSUE_TITLE): string {
  const params = new URLSearchParams({ title, body })
  return `${ISSUES_URL}?${params.toString()}`
}

/**
 * GitHub "new issue" link with the diagnostics in the body. Too long for a URL → keeps the
 * header and the most recent error lines, drops the oldest ones and says so in the body.
 */
export function buildIssueUrl(diagnostics: string, maxLength = MAX_ISSUE_URL_LENGTH): string {
  if (issueUrl(diagnostics).length <= maxLength) return issueUrl(diagnostics)
  const lines = diagnostics.split('\n')
  const fenceStart = lines.indexOf('```')
  const fenceEnd = lines.lastIndexOf('```')
  if (fenceStart >= 0 && fenceEnd > fenceStart) {
    const head = lines.slice(0, fenceStart + 1)
    const log = lines.slice(fenceStart + 1, fenceEnd)
    const tail = lines.slice(fenceEnd)
    for (let keep = log.length - 1; keep >= 0; keep--) {
      const kept = keep > 0 ? log.slice(-keep) : []
      const url = issueUrl([TRUNCATION_NOTE, '', ...head, ...kept, ...tail].join('\n'))
      if (url.length <= maxLength) return url
    }
  }
  return issueUrl(TRUNCATION_NOTE)
}

/** Only our own issues page may be opened from the diagnostics dialog. */
export function isIssueUrl(url: string): boolean {
  return url.startsWith(`${ISSUES_URL}?`)
}
