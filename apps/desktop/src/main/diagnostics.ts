// "Copy diagnostics" (F-17). Kamo has no telemetry (rule 3): this text is only built when the
// user clicks, shown to them before anything else happens, and leaves the machine only if they
// paste it somewhere or press "Open issue on GitHub" (which opens their browser; GitHub only
// receives it if they submit the form).
//
// The report is technical text for maintainers, so it stays in English in every UI language.
import { redact } from './log/index.ts'

export const ISSUES_URL = 'https://github.com/dssiqueira/kamo/issues/new'
export const ISSUE_TITLE = 'Problem report'
/** Browsers and GitHub reject very long URLs; 8KB is the safe ceiling commonly used. */
export const MAX_ISSUE_URL_LENGTH = 8000
export const TRUNCATION_NOTE =
  '[Diagnostics truncated to fit in a link: older log lines were left out. ' +
  'Use "Copy diagnostics" in Kamo and paste the full text here.]'

export interface DiagnosticsInfo {
  appVersion: string
  electron: string
  chrome: string
  node: string
  os: string
  osVersion: string
  arch: string
  /** Summary lines from `app.getGPUInfo('basic')`, already formatted. */
  gpu: string[]
  /** `screen: granted`, ... */
  permissions: { kind: string; status: string }[]
  /** Renderer probe; null when it could not run. */
  hardwareH264: boolean | null
  helperPresent: boolean
  /** Last lines of the local log (already redacted by the Logger). */
  logLines: string[]
}

function yesNo(value: boolean | null): string {
  return value === null ? 'unknown' : value ? 'yes' : 'no'
}

function header(info: DiagnosticsInfo): string[] {
  return [
    '## Kamo diagnostics',
    `App: ${info.appVersion}`,
    `Electron: ${info.electron} · Chrome: ${info.chrome} · Node: ${info.node}`,
    `OS: ${info.os} ${info.osVersion} (${info.arch})`,
    ...(info.gpu.length ? info.gpu.map((line) => `GPU: ${line}`) : ['GPU: unknown']),
    `Permissions: ${
      info.permissions.length
        ? info.permissions.map((p) => `${p.kind} ${p.status}`).join(', ')
        : 'none needed'
    }`,
    `Hardware H.264 encoder (1080p30): ${yesNo(info.hardwareH264)}`,
    `Capture helper: ${info.helperPresent ? 'present' : 'missing'}`,
  ]
}

function logBlock(lines: string[]): string[] {
  return [`## Last ${lines.length} log lines`, '```', ...lines, '```']
}

/**
 * The text the user sees and copies. Redacted once more as a safety net: the log already is,
 * but nothing with the home folder (and so the user name) may slip through.
 */
export function buildDiagnostics(info: DiagnosticsInfo, home?: string): string {
  return redact([...header(info), '', ...logBlock(info.logLines)].join('\n'), home)
}

export function issueUrl(body: string, title = ISSUE_TITLE): string {
  const params = new URLSearchParams({ title, body })
  return `${ISSUES_URL}?${params.toString()}`
}

/**
 * GitHub "new issue" link with the diagnostics in the body. Too long for a URL → keeps the
 * header and the most recent log lines, drops the oldest ones and says so in the body.
 */
export function buildIssueUrl(diagnostics: string, maxLength = MAX_ISSUE_URL_LENGTH): string {
  const full = issueUrl(diagnostics)
  if (full.length <= maxLength) return full

  const lines = diagnostics.split('\n')
  const fenceStart = lines.indexOf('```')
  const fenceEnd = lines.lastIndexOf('```')
  if (fenceStart >= 0 && fenceEnd > fenceStart) {
    const head = lines.slice(0, fenceStart + 1)
    const log = lines.slice(fenceStart + 1, fenceEnd)
    const tail = lines.slice(fenceEnd)
    // Binary search for how many recent log lines fit.
    let low = 0
    let high = log.length
    while (low < high) {
      const keep = Math.ceil((low + high) / 2)
      const body = [TRUNCATION_NOTE, '', ...head, ...log.slice(-keep), ...tail].join('\n')
      if (issueUrl(body).length <= maxLength) low = keep
      else high = keep - 1
    }
    const kept = low > 0 ? log.slice(-low) : []
    const url = issueUrl([TRUNCATION_NOTE, '', ...head, ...kept, ...tail].join('\n'))
    if (url.length <= maxLength) return url
  }
  // Still too long (huge header): cut characters until it fits.
  let text = diagnostics
  while (text.length > 0) {
    text = text.slice(0, Math.floor(text.length * 0.9))
    const url = issueUrl(`${TRUNCATION_NOTE}\n\n${text}`)
    if (url.length <= maxLength) return url
  }
  return issueUrl(TRUNCATION_NOTE)
}

/** Only our own issues page may be opened from the diagnostics dialog. */
export function isIssueUrl(url: string): boolean {
  return url.startsWith(`${ISSUES_URL}?`)
}
