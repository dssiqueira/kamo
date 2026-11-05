// Parses the export smoke result out of the desktop app's log (scripts/export-benchmark.ts).
// main prints `kamo: export smoke <JSON, 2-space indented>` (apps/desktop/src/main/export-smoke.ts).

export interface SpeedResult {
  aspect: string
  elapsedMs: number
  videoMs: number
  framesPerSecond: number
  secondsPerMinuteOfVideo: number
  /** e.g. `avc1.640028 (hardware)` */
  encoder: string | null
}

export interface SmokeSummary {
  ok: boolean
  speeds: SpeedResult[]
}

const PREFIX = 'kamo: export smoke '

export function parseExportSmoke(log: string): SmokeSummary | null {
  const start = log.lastIndexOf(PREFIX)
  if (start < 0) return null
  const rest = log.slice(start + PREFIX.length).replace(/\r\n/g, '\n')
  // The JSON is pretty-printed: the first `}` at the start of a line closes it.
  const end = rest.search(/\n\}/)
  if (end < 0) return null
  let parsed: { ok?: unknown; checks?: unknown }
  try {
    parsed = JSON.parse(`${rest.slice(0, end)}\n}`) as { ok?: unknown; checks?: unknown }
  } catch {
    return null
  }
  const checks = Array.isArray(parsed.checks) ? (parsed.checks as Record<string, unknown>[]) : []
  const speeds: SpeedResult[] = []
  for (const check of checks) {
    const name = typeof check['name'] === 'string' ? check['name'] : ''
    const match = /^(\S+): speed\b/.exec(name)
    if (!match) continue
    const number = (key: string) => (typeof check[key] === 'number' ? (check[key] as number) : NaN)
    speeds.push({
      aspect: match[1]!,
      elapsedMs: number('elapsedMs'),
      videoMs: number('videoMs'),
      framesPerSecond: number('framesPerSecond'),
      secondsPerMinuteOfVideo: number('secondsPerMinuteOfVideo'),
      encoder: encoderName(check['encoder']),
    })
  }
  return { ok: parsed.ok === true, speeds }
}

function encoderName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const { codec, hardware } = value as { codec?: unknown; hardware?: unknown }
  if (typeof codec !== 'string') return null
  return `${codec} (${hardware === true ? 'hardware' : 'software'})`
}
