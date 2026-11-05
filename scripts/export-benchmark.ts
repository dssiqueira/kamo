// Export benchmark report (CI): reads the log of the desktop export smoke test
// (`--smoke-test` with KAMO_SMOKE_EXPORT, apps/desktop/src/main/export-smoke.ts), pulls out
// the speed checks (1080p30 into memory, 16:9 and 1:1) and prints them, also into the GitHub
// job summary. It fails only on a gross regression against export-benchmark-baseline.json:
// CI runners have no GPU and vary from run to run, so small moves are noise.
//
// Usage: node scripts/export-benchmark.ts <smoke-log-file> <platform: win32|darwin>
import { appendFileSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { parseExportSmoke, type SpeedResult } from './export-benchmark-parse.ts'

interface Baseline {
  /** a run fails when it is this many times slower than the baseline */
  regressionFactor: number
  /** seconds of export per minute of video, per platform and format; null = report only */
  secondsPerMinute: Record<string, Record<string, number | null>>
}

const [logFile, platform] = process.argv.slice(2)
if (!logFile || !platform) {
  console.error('usage: node scripts/export-benchmark.ts <smoke-log-file> <win32|darwin>')
  process.exit(2)
}

const baseline = JSON.parse(
  readFileSync(new URL('export-benchmark-baseline.json', import.meta.url), 'utf8'),
) as Baseline
let log = ''
try {
  log = readFileSync(logFile, 'utf8')
} catch {
  // The smoke step may have crashed before writing anything.
}
const smoke = parseExportSmoke(log)

const lines: string[] = [`### Export benchmark (${platform}, 1080p30, sample project)`, '']
let failed = false
if (!smoke) {
  lines.push('No export smoke result in the log: the export did not run. Nothing to compare.')
  console.log(`::warning::export benchmark: no export smoke result in ${logFile}`)
} else {
  lines.push(
    `Export smoke: ${smoke.ok ? 'passed' : 'FAILED (see the smoke step log)'}`,
    '',
    '| Format | Video | Export | Frames/s | s per min of video | Baseline | Encoder |',
    '|---|---|---|---|---|---|---|',
  )
  for (const result of smoke.speeds) {
    const base = baseline.secondsPerMinute[platform]?.[result.aspect] ?? null
    const limit = base === null ? null : base * baseline.regressionFactor
    const regressed = limit !== null && result.secondsPerMinuteOfVideo > limit
    failed ||= regressed
    lines.push(row(result, base, regressed))
    if (regressed) {
      console.log(
        `::error::export ${result.aspect} took ${result.secondsPerMinuteOfVideo}s per minute of video, ` +
          `over ${baseline.regressionFactor}× the baseline (${base}s)`,
      )
    }
  }
  if (smoke.speeds.length === 0) lines.push('| (no speed checks in the result) | | | | | | |')
}
const summary = lines.join('\n')
console.log(summary)
if (process.env['GITHUB_STEP_SUMMARY'])
  appendFileSync(process.env['GITHUB_STEP_SUMMARY'], `${summary}\n`)
process.exit(failed ? 1 : 0)

function row(result: SpeedResult, base: number | null, regressed: boolean): string {
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
  return [
    '',
    result.aspect,
    seconds(result.videoMs),
    seconds(result.elapsedMs),
    result.framesPerSecond,
    `${result.secondsPerMinuteOfVideo}${regressed ? ' (regression)' : ''}`,
    base === null ? 'not set' : `${base}`,
    result.encoder ?? '?',
    '',
  ]
    .join(' | ')
    .trim()
}
