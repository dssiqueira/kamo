// Export smoke test (F-11), loaded only when main opens the editor with `?smoke=export`
// under --smoke-test. Drives the real Formats screen, then reads the files back and checks
// them: metadata, playback in Chromium, the frame at a click against the renderer, speed,
// cancel, and the audio mix (volume, mute, trim and sync) with synthetic tracks.
import {
  buildScene,
  createRenderer,
  exportFrameCount,
  outputSize,
  parseEvents,
  sceneFrame,
  visibleZooms,
  type Aspect,
  type Context2D,
  type MouseEventRecord,
  type Project,
} from '@kamo/core'
import { exportVideo, ExportError, type MediaFile } from '@kamo/core/export'
import {
  createMemorySinkFile,
  decodeAudio,
  decodeVideoFrame,
  encodeAudioFile,
  inspectMedia,
} from '@kamo/core/testing'
import { desktopSink, projectMedia } from './export-platform.ts'

interface Check {
  name: string
  pass: boolean
  [detail: string]: unknown
}

interface SmokeResult {
  ok: boolean
  checks: Check[]
  files: string[]
  previewProbe?: { rect: { x: number; y: number; width: number; height: number }; timeMs: number }
}

declare global {
  interface Window {
    kamoSmokeExport?: {
      run(options?: { screenshots?: boolean }): Promise<SmokeResult>
      comparePreview(dataUrl: string): Promise<Check>
      /** With screenshots on, the run waits at 'formats' and 'done' until main captured. */
      stage(): string
      proceed(): void
    }
  }
}

const FPS = 30
const SMOKE_FOLDER = '.smoke-export'
let exportFrame16x9: ImageBitmap | null = null
let stage = ''
let release: (() => void) | null = null
let screenshots = false

/** Lets main take a window screenshot of this state before the run goes on. */
async function pauseFor(name: string): Promise<void> {
  if (!screenshots) return
  stage = name
  await new Promise<void>((resolve) => (release = resolve))
  stage = ''
}

export function installExportSmoke(projectId: string): void {
  window.kamoSmokeExport = {
    run: (options) => {
      screenshots = options?.screenshots === true
      return run(projectId)
    },
    comparePreview,
    stage: () => stage,
    proceed: () => release?.(),
  }
}

async function run(projectId: string): Promise<SmokeResult> {
  const result: SmokeResult = { ok: true, checks: [], files: [] }
  const check = (name: string, pass: boolean, detail: Record<string, unknown> = {}) => {
    result.checks.push({ name, pass, ...detail })
    if (!pass) result.ok = false
  }
  try {
    const project = await window.kamo.loadProject(projectId)
    const { events } = parseEvents(await window.kamo.loadEvents(projectId))

    // 1. The real UI: Export → check 1:1 too → Export → done.
    await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="export-open"]')
      const video = document.querySelector('video')
      return !!button && !button.disabled && !!video && video.readyState >= 2
    }, 20_000)
    click('[data-testid="export-open"]')
    await waitFor(() => !!document.querySelector('[data-testid="export-sheet"]'), 5000)
    const square = document.querySelector<HTMLInputElement>('[data-testid="export-format-1:1"]')
    if (square && !square.checked) square.click()
    await sleep(300)
    await pauseFor('formats')
    const started = performance.now()
    click('[data-testid="export-start"]')
    const sheet = () => document.querySelector<HTMLElement>('[data-testid="export-sheet"]')
    await waitFor(() => ['done', 'error'].includes(sheet()?.dataset['phase'] ?? ''), 300_000)
    const uiMs = Math.round(performance.now() - started)
    const phase = sheet()?.dataset['phase']
    const errorCode = document.querySelector<HTMLElement>('[data-testid="export-error"]')?.dataset[
      'code'
    ]
    const names = [...document.querySelectorAll<HTMLElement>('[data-testid^="export-job-"]')].map(
      (row) => row.querySelector('span')?.title ?? '',
    )
    result.files = names
    check('ui: both formats exported through the Formats screen', phase === 'done', {
      uiMs,
      names,
      errorCode,
    })
    await pauseFor('done')
    // Close the sheet (Escape) so the preview is visible again.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    // 2. Read the files back.
    const frames = exportFrameCount(project.trim, FPS)
    const click0 = events.find(
      (e) =>
        e.type === 'down' &&
        e.button === 'left' &&
        e.t >= project.trim.startMs &&
        e.t < project.trim.endMs,
    )
    const index = click0 ? Math.round(((click0.t - project.trim.startMs) * FPS) / 1000) : 0
    const rawMs = project.trim.startMs + (index * 1000) / FPS
    for (const name of names) {
      const aspect: Aspect = name.includes(' 1x1 ') ? '1:1' : '16:9'
      const size = outputSize(aspect, '1080p')
      const file = projectMedia(projectId, `${SMOKE_FOLDER}/${name}`)
      const info = await inspectMedia(file)
      check(`${aspect}: H.264 ${size.width}x${size.height}, trimmed duration`, isExpected(), {
        info,
        expectedFrames: frames,
        expectedDurationS: frames / FPS,
      })
      function isExpected() {
        return (
          info.video?.width === size.width &&
          info.video?.height === size.height &&
          (info.video?.codec ?? '').startsWith('avc1') &&
          info.video?.frames === frames &&
          Math.abs(info.durationS - frames / FPS) < 0.05
        )
      }

      const playback = await playInVideo(
        `kamo-media://project/${encodeURIComponent(projectId)}/${SMOKE_FOLDER}/${encodeURIComponent(name)}`,
      )
      check(`${aspect}: plays in Chromium`, playback.ok, playback)

      const compare = await compareFrame(project, events, projectId, file, aspect, index, rawMs)
      check(
        `${aspect}: frame at the click equals the renderer (encoder tolerance)`,
        compare.psnr > 32,
        {
          clickMs: click0?.t ?? null,
          ...compare,
        },
      )
    }

    // 3. Speed: each format straight into memory (no disk), on the real recording.
    for (const aspect of ['16:9', '1:1'] as const) {
      const sink = createMemorySinkFile(`perf ${aspect}.mp4`)
      const r = await exportVideo({
        project,
        events,
        video: projectMedia(projectId, 'screen.mp4'),
        aspect,
        resolution: '1080p',
        fps: FPS,
        sink,
      })
      const secondsPerMinute = (r.elapsedMs / r.durationMs) * 60
      check(`${aspect}: speed (1 min of video in < 60 s)`, secondsPerMinute < 60, {
        elapsedMs: Math.round(r.elapsedMs),
        videoMs: Math.round(r.durationMs),
        framesPerSecond: Math.round((r.frames / r.elapsedMs) * 1000),
        secondsPerMinuteOfVideo: Math.round(secondsPerMinute * 10) / 10,
        encoder: r.encoder,
        warnings: r.warnings,
        bytes: sink.bytes().byteLength,
      })
    }

    // 4. Cancel midway through the real desktop sink: ExportError('aborted'); main then
    // checks that no .partial file is left in the folder.
    {
      const controller = new AbortController()
      const file = await desktopSink.open('Cancel test 16x9 1080p30.mp4', 'video/mp4')
      let code: string | null = null
      try {
        await exportVideo({
          project,
          events,
          video: projectMedia(projectId, 'screen.mp4'),
          aspect: '16:9',
          resolution: '1080p',
          fps: FPS,
          sink: file,
          signal: controller.signal,
          onProgress: (f) => {
            if (f > 0.3) controller.abort()
          },
        })
      } catch (error) {
        code = error instanceof ExportError ? error.code : String(error)
      }
      check('cancel: aborts with code "aborted"', code === 'aborted', { code })
    }

    // 5. Audio: synthetic microphone (44.1kHz mono) and computer sound (48kHz stereo).
    await audioChecks(project, events, projectId, check)

    // 6. The editor preview at the same instant, captured by main (canvas readback of a
    // kamo-media video is blocked by CORS, so the window capture is the honest probe).
    const video = document.querySelector('video')
    const canvas = document.querySelector<HTMLCanvasElement>('main canvas')
    if (video && canvas) {
      video.currentTime = rawMs / 1000
      await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }))
      await sleep(600)
      const box = canvas.getBoundingClientRect()
      result.previewProbe = {
        rect: {
          x: Math.ceil(box.x),
          y: Math.ceil(box.y),
          width: Math.floor(box.width) - 1,
          height: Math.floor(box.height) - 1,
        },
        timeMs: rawMs,
      }
    }
  } catch (error) {
    check('smoke run', false, { error: String(error), stack: (error as Error).stack })
  }
  return result
}

async function compareFrame(
  project: Project,
  events: readonly MouseEventRecord[],
  projectId: string,
  file: MediaFile,
  aspect: Aspect,
  index: number,
  rawMs: number,
) {
  const size = outputSize(aspect, '1080p')
  const exported = new OffscreenCanvas(size.width, size.height)
  const exportedCtx = exported.getContext('2d') as OffscreenCanvasRenderingContext2D
  const exportedTs = await decodeVideoFrame(file, index / FPS + 0.001, (source) =>
    exportedCtx.drawImage(source, 0, 0, size.width, size.height),
  )
  if (aspect === '16:9') exportFrame16x9 = await createImageBitmap(exported)

  const reference = new OffscreenCanvas(size.width, size.height)
  const referenceCtx = reference.getContext('2d', {
    alpha: false,
  }) as OffscreenCanvasRenderingContext2D
  const renderer = createRenderer(referenceCtx as unknown as Context2D)
  const scene = buildScene({
    project,
    events,
    zooms: visibleZooms(project.zooms, { autoZoom: true }),
  })
  const sourceTs = await decodeVideoFrame(
    projectMedia(projectId, 'screen.mp4'),
    rawMs / 1000 + 0.0005,
    (source) => renderer.render(sceneFrame(scene, source, aspect, size, rawMs)),
  )
  return {
    exportedFrameS: exportedTs,
    sourceFrameS: sourceTs,
    ...diff(
      exportedCtx.getImageData(0, 0, size.width, size.height).data,
      referenceCtx.getImageData(0, 0, size.width, size.height).data,
    ),
  }
}

async function comparePreview(dataUrl: string): Promise<Check> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const { naturalWidth: w, naturalHeight: h } = image
  const a = new OffscreenCanvas(w, h)
  const actx = a.getContext('2d') as OffscreenCanvasRenderingContext2D
  actx.drawImage(image, 0, 0)
  const b = new OffscreenCanvas(w, h)
  const bctx = b.getContext('2d') as OffscreenCanvasRenderingContext2D
  bctx.imageSmoothingQuality = 'high'
  if (exportFrame16x9) bctx.drawImage(exportFrame16x9, 0, 0, w, h)
  const d = diff(actx.getImageData(0, 0, w, h).data, bctx.getImageData(0, 0, w, h).data)
  return {
    name: '16:9: editor preview at the click equals the exported frame (window capture, scaled)',
    pass: exportFrame16x9 !== null && d.psnr > 24,
    size: `${w}x${h}`,
    ...d,
  }
}

function diff(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0
  let sq = 0
  let max = 0
  let n = 0
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs((a[i + c] as number) - (b[i + c] as number))
      sum += d
      sq += d * d
      if (d > max) max = d
      n++
    }
  }
  const mse = sq / n
  return {
    meanAbs: Math.round((sum / n) * 100) / 100,
    maxAbs: max,
    psnr: mse === 0 ? 99 : Math.round(10 * Math.log10((255 * 255) / mse) * 10) / 10,
  }
}

type CheckFn = (name: string, pass: boolean, detail?: Record<string, unknown>) => void

async function audioChecks(
  project: Project,
  events: readonly MouseEventRecord[],
  projectId: string,
  check: CheckFn,
) {
  const tone = (
    rate: number,
    seconds: number,
    bursts: { at: number; len: number; hz: number; amp: number }[],
  ) => {
    const data = new Float32Array(Math.round(rate * seconds))
    for (const b of bursts) {
      const start = Math.round(b.at * rate)
      const end = Math.round((b.at + b.len) * rate)
      for (let i = start; i < end && i < data.length; i++) {
        data[i] = b.amp * Math.sin((2 * Math.PI * b.hz * (i - start)) / rate)
      }
    }
    return data
  }
  // Microphone: 1kHz beeps at 2.0s and 5.0s. Computer: 440Hz beep at 3.0s.
  const mic = tone(44_100, 8, [
    { at: 2, len: 0.1, hz: 1000, amp: 0.8 },
    { at: 5, len: 0.1, hz: 1000, amp: 0.8 },
  ])
  const system = tone(48_000, 8, [{ at: 3, len: 0.15, hz: 440, amp: 0.6 }])
  const micFile = await encodeAudioFile(44_100, [mic])
  const systemFile = await encodeAudioFile(48_000, [system, system])
  // Trim 1s–7s: the beeps land at 1.0s, 4.0s (mic) and 2.0s (computer) in the export.
  const trimmed: Project = {
    ...project,
    trim: { startMs: 1000, endMs: 7000 },
    audio: { mic: { enabled: true, volume: 0.5 }, system: { enabled: true, volume: 1 } },
  }

  for (const systemVolume of [1, 0]) {
    const sink = createMemorySinkFile('audio.mp4')
    const r = await exportVideo({
      project: trimmed,
      events,
      video: projectMedia(projectId, 'screen.mp4'),
      audio: [
        { file: micFile, volume: 0.5 },
        { file: systemFile, volume: systemVolume },
      ],
      aspect: '1:1',
      resolution: '1080p',
      fps: FPS,
      sink,
    })
    const blob = new Blob([sink.bytes() as Uint8Array<ArrayBuffer>], { type: 'video/mp4' })
    const info = await inspectMedia(blob)
    const pcm = await decodeAudio(blob, 0, 6)
    const label = systemVolume ? 'mic 50% + computer 100%' : 'mic 50% + computer muted'
    check(
      `audio (${label}): AAC 48kHz stereo track`,
      info.audio?.sampleRate === 48_000 &&
        info.audio.channels === 2 &&
        (info.audio.codec ?? '').startsWith('mp4a'),
      {
        audio: info.audio,
        durationS: info.durationS,
        warnings: r.warnings,
      },
    )
    if (!pcm) continue
    const left = pcm.channels[0] as Float32Array
    const right = (pcm.channels[1] ?? left) as Float32Array
    const measure = (at: number) => {
      const rate = pcm.sampleRate
      let onset: number | null = null
      for (let i = Math.round((at - 0.2) * rate); i < Math.round((at + 0.2) * rate); i++) {
        if (Math.abs(left[i] ?? 0) > 0.05) {
          onset = i / rate
          break
        }
      }
      let peak = 0
      let peakRight = 0
      for (let i = Math.round(at * rate); i < Math.round((at + 0.09) * rate); i++) {
        peak = Math.max(peak, Math.abs(left[i] ?? 0))
        peakRight = Math.max(peakRight, Math.abs(right[i] ?? 0))
      }
      return {
        onsetMs: onset === null ? null : Math.round((onset - at) * 1000 * 10) / 10,
        peak: Math.round(peak * 1000) / 1000,
        peakRight: Math.round(peakRight * 1000) / 1000,
      }
    }
    const beeps = [
      { at: 1, expected: 0.4, what: 'mic beep 1 (trimmed 2.0s → 1.0s, volume 50%)' },
      { at: 4, expected: 0.4, what: 'mic beep 2 (5.0s → 4.0s)' },
      { at: 2, expected: 0.6 * systemVolume, what: 'computer beep (3.0s → 2.0s)' },
    ]
    for (const beep of beeps) {
      const m = measure(beep.at)
      const pass =
        beep.expected === 0
          ? m.peak < 0.02
          : m.onsetMs !== null &&
            Math.abs(m.onsetMs) <= 40 &&
            Math.abs(m.peak - beep.expected) <= beep.expected * 0.25 &&
            Math.abs(m.peakRight - beep.expected) <= beep.expected * 0.25
      check(`audio (${label}): ${beep.what}`, pass, { expectedPeak: beep.expected, ...m })
    }
    const quiet = measure(0.5)
    check(`audio (${label}): silence where nothing plays`, quiet.peak < 0.02, quiet)
  }
}

function playInVideo(url: string): Promise<Record<string, unknown> & { ok: boolean }> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.src = url
    const done = (ok: boolean, extra: Record<string, unknown> = {}) => {
      resolve({
        ok,
        currentTime: video.currentTime,
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        ...extra,
      })
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    const timeout = setTimeout(() => done(false, { reason: 'timeout' }), 10_000)
    video.addEventListener('error', () => {
      clearTimeout(timeout)
      done(false, { reason: video.error?.message ?? 'error' })
    })
    video.addEventListener('timeupdate', () => {
      if (video.currentTime > 0.5) {
        clearTimeout(timeout)
        done(true)
      }
    })
    void video.play().catch((error: unknown) => {
      clearTimeout(timeout)
      done(false, { reason: String(error) })
    })
  })
}

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`missing ${selector}`)
  element.click()
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const start = performance.now()
  while (!condition()) {
    if (performance.now() - start > timeoutMs) throw new Error('timed out waiting')
    await sleep(50)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
