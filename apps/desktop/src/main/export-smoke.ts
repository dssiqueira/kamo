// `--smoke-test` with KAMO_SMOKE_EXPORT=<projectId>: exports the project for real through
// the editor's Formats screen into `<project>/.smoke-export`, lets the page verify the files
// (smoke-export.ts in the renderer), compares the editor preview with the exported frame,
// checks main-side effects (no .partial left, project.exports recorded) and cleans up.
import type { BrowserWindow } from 'electron'
import { copyFile, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PROJECT_FILES } from '@kamo/core'
import type { ExportService } from './export-ipc.ts'
import { getServices } from './services.ts'
import { loadPage } from './windows.ts'

interface Check {
  name: string
  pass: boolean
  [detail: string]: unknown
}

interface PageResult {
  ok: boolean
  checks: Check[]
  files: string[]
  previewProbe?: { rect: { x: number; y: number; width: number; height: number } }
}

const waitForPage = (screenshots: boolean) => `new Promise((resolve, reject) => {
  const started = Date.now()
  const tick = () => {
    if (window.kamoSmokeExport) resolve(window.kamoSmokeExport.run({ screenshots: ${screenshots} }))
    else if (Date.now() - started > 20000) reject(new Error('smoke hook missing'))
    else setTimeout(tick, 100)
  }
  tick()
})`

/** Returns true when every check passed. Leaves the project exactly as it was. */
export async function runExportSmoke(
  window: BrowserWindow,
  exporter: ExportService,
  projectId: string,
): Promise<boolean> {
  const projectDir = getServices().store.projectDir(projectId)
  const projectFile = join(projectDir, PROJECT_FILES.project)
  const backup = `${projectFile}.smoke-backup`
  await copyFile(projectFile, backup)
  const dir = exporter.useSmokeProject(projectId) as string
  await rm(dir, { recursive: true, force: true })
  try {
    await loadPage(window, 'editor', { project: projectId, smoke: 'export' })
    const contents = window.webContents
    // KAMO_SMOKE_SCREENSHOT=<file.png> also saves <file>-formats.png and <file>-done.png.
    const screenshot = process.env['KAMO_SMOKE_SCREENSHOT']
    const running = contents.executeJavaScript(
      waitForPage(!!screenshot),
      true,
    ) as Promise<PageResult>
    if (screenshot) {
      let settled = false
      void running.finally(() => (settled = true)).catch(() => {})
      const taken = new Set<string>()
      while (!settled && taken.size < 2) {
        const stage = (await contents
          .executeJavaScript('window.kamoSmokeExport?.stage() ?? ""')
          .catch(() => '')) as string
        if (stage && !taken.has(stage)) {
          const image = await contents.capturePage()
          await writeFile(screenshot.replace(/\.png$/i, `-${stage}.png`), image.toPNG())
          taken.add(stage)
          await contents.executeJavaScript('window.kamoSmokeExport.proceed()')
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }
    const result = await running

    if (result.previewProbe) {
      const image = await contents.capturePage(result.previewProbe.rect)
      const preview = (await contents.executeJavaScript(
        `window.kamoSmokeExport.comparePreview(${JSON.stringify(image.toDataURL())})`,
        true,
      )) as Check
      result.checks.push(preview)
      if (!preview.pass) result.ok = false
    }

    const left = await readdir(dir).catch(() => [] as string[])
    const partials = left.filter((name) => name.endsWith('.partial'))
    const unexpected = left.filter((name) => !result.files.includes(name))
    result.checks.push({
      name: 'main: only the finished files are in the folder (cancel deleted its .partial)',
      pass: partials.length === 0 && unexpected.length === 0 && left.length === result.files.length,
      files: left,
    })

    const saved = JSON.parse(await readFile(projectFile, 'utf8')) as {
      exports: { aspect: string; path: string }[]
    }
    const recorded = result.files.every((name) =>
      saved.exports.some((record) => record.path === join(dir, name)),
    )
    result.checks.push({
      name: 'main: project.exports records each exported file',
      pass: recorded,
      exports: saved.exports,
    })
    result.ok = result.checks.every((check) => check.pass)

    console.log(`kamo: export smoke ${JSON.stringify(result, null, 2)}`)
    return result.ok
  } finally {
    exporter.useSmokeProject(null)
    await rm(dir, { recursive: true, force: true })
    await copyFile(backup, projectFile)
    await rm(backup, { force: true })
  }
}
