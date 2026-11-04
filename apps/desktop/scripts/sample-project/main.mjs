// Dev tool: writes a realistic sample project (screen.mp4, events.jsonl, frames/, project.json)
// so the editor can be built and tested without the native capture helper. A hidden window
// draws a fake product screen, records it with MediaRecorder and streams the bytes here over
// IPC; this process owns every file write. See README.md for usage.
import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { registerHooks, stripTypeScriptTypes } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import console from 'node:console'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout } from 'node:timers'
import { parseArgs } from 'node:util'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')
const TIMEOUT_MARGIN_MS = 60_000

// Electron's Node only strips types, and core uses TypeScript-only syntax (parameter
// properties), so load the workspace .ts sources through a full type transform instead.
registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.ts')) return nextLoad(url, context)
    const source = readFileSync(fileURLToPath(url), 'utf8')
    return {
      format: 'module',
      source: stripTypeScriptTypes(source, { mode: 'transform', sourceUrl: url }),
      shortCircuit: true,
    }
  },
})

const importTs = (path) => import(pathToFileURL(join(REPO, path)).href)
const core = await importTs('packages/core/src/index.ts')
const { FileProjectStore, defaultProjectsDir } = await importTs(
  'apps/desktop/src/main/storage/index.ts',
)
const { buildScenario, VIDEO } = await importTs('apps/desktop/scripts/sample-project/scenario.ts')

function parseOptions() {
  // argv: [electron, <this folder>, ...flags]; Chromium may add switches, so not strict.
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { out: { type: 'string' }, name: { type: 'string' } },
    strict: false,
    allowPositionals: true,
  })
  const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
  return {
    out: resolve(typeof values.out === 'string' ? values.out : defaultProjectsDir()),
    name: typeof values.name === 'string' ? values.name : `Sample ${date.format(new Date())}`,
  }
}

async function writeBinary(store, projectId, path, bytes) {
  const writer = (await store.openWritable(projectId, path)).getWriter()
  await writer.write(new Uint8Array(bytes))
  await writer.close()
}

/** Runs the page and resolves with what it recorded; the files are written as data arrives. */
function record(store, projectId, scenario) {
  return new Promise((resolvePromise, reject) => {
    let video = null
    let videoFile = null
    const fail = (error) => {
      video?.abort().catch(() => {})
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    ipcMain.handle('sample:plan', () => ({ scenario, video: VIDEO }))
    ipcMain.handle('sample:begin', async (_event, mimeType) => {
      videoFile = mimeType.startsWith('video/mp4') ? 'screen.mp4' : 'screen.webm'
      video = (await store.openWritable(projectId, videoFile)).getWriter()
    })
    ipcMain.handle('sample:video', (_event, chunk) => video.write(new Uint8Array(chunk)))
    ipcMain.handle('sample:frame', (_event, second, jpeg) =>
      writeBinary(store, projectId, `frames/${String(second).padStart(4, '0')}.jpg`, jpeg),
    )
    ipcMain.handle('sample:finish', async (_event, result) => {
      await video.close()
      resolvePromise({ ...result, videoFile })
    })
    ipcMain.handle('sample:fail', (_event, message) => fail(new Error(`page: ${message}`)))

    const window = new BrowserWindow({
      show: false,
      width: VIDEO.width,
      height: VIDEO.height,
      webPreferences: {
        offscreen: true,
        preload: join(HERE, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    window.webContents.setFrameRate(60)
    window.webContents.on('render-process-gone', (_event, details) =>
      fail(new Error(`renderer gone: ${details.reason}`)),
    )
    window.loadFile(join(HERE, 'index.html')).catch(fail)
    setTimeout(
      () => fail(new Error('timed out waiting for the recording')),
      scenario.durationMs + TIMEOUT_MARGIN_MS,
    ).unref()
  })
}

/** Reads the project back through the same code the app uses, as a sanity check. */
async function verify(store, projectId, expectedEvents, videoFile) {
  const project = await core.loadProject(store, projectId)
  const { events, skippedLines } = core.parseEvents(
    (await store.readText(projectId, core.PROJECT_FILES.events)) ?? '',
  )
  if (events.length !== expectedEvents || skippedLines.length > 0) {
    throw new Error(`events.jsonl has ${events.length} valid events, expected ${expectedEvents}`)
  }
  const frames = await store.listFiles(projectId, core.PROJECT_FILES.frames)
  const expectedFrames = Math.floor((project.durationMs - 1) / 5000) + 1
  if (frames.length !== expectedFrames) {
    throw new Error(`frames/ has ${frames.length} files, expected ${expectedFrames}`)
  }
  const { size } = await stat(join(store.projectDir(projectId), videoFile))
  return { project, events: events.length, frames: frames.length, videoBytes: size }
}

async function main() {
  const options = parseOptions()
  const scenario = buildScenario()
  const store = new FileProjectStore(options.out)
  const projectId = randomUUID()
  await app.whenReady()

  try {
    const result = await record(store, projectId, scenario)
    const durationMs = Math.round(result.recordedMs)
    const events = scenario.events.filter((event) => event.t <= durationMs)
    await store.writeText(projectId, core.PROJECT_FILES.events, core.formatEvents(events))
    // project.json goes last: a folder without it is never listed as a project.
    const project = core.createProject({
      id: projectId,
      name: options.name,
      durationMs,
      source: { kind: 'display', ...VIDEO, scaleFactor: 1 },
    })
    await core.saveProject(store, project)

    const check = await verify(store, projectId, events.length, result.videoFile)
    if (result.videoFile !== 'screen.mp4') {
      console.warn(`warning: MP4 recording is not supported here, wrote ${result.videoFile}`)
    }
    console.log(`codec:    ${result.mimeType}`)
    console.log(
      `video:    ${result.videoFile}, ${(check.videoBytes / 1e6).toFixed(1)}MB, ${durationMs}ms`,
    )
    console.log(`events:   ${check.events}`)
    console.log(`frames:   ${check.frames}`)
    console.log(`project:  ${check.project.id} "${check.project.name}"`)
    console.log(`folder:   ${store.projectDir(projectId)}`)
    app.exit(0)
  } catch (error) {
    console.error(`sample project failed: ${error instanceof Error ? error.message : error}`)
    await store.deleteProject(projectId).catch(() => {})
    app.exit(1)
  }
}

main()
