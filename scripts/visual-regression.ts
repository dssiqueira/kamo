// Visual regression of the core renderer (AGENTS.md → Quality and release): renders frames
// from the event fixtures over a synthetic screen with the same code the preview and the
// export use (createRenderer + buildScene + sceneFrame, rule 11), and compares them with the
// reference PNGs in packages/core/fixtures/visual/.
//
//   pnpm visual          compare (exit 1 on a difference; diff images in out-visual/)
//   pnpm visual:update   rewrite the references after an intended change, then review the PNGs
//   pnpm visual <name>   only the cases whose name contains <name>
//
// Canvas: @napi-rs/canvas (Skia, prebuilt, no system libraries). Text uses Inter from
// @fontsource/inter, registered here, so captions do not depend on the machine's fonts.
// Runs with --experimental-transform-types: core uses TypeScript-only syntax.
import { createCanvas, GlobalFonts, loadImage, type Canvas } from '@napi-rs/canvas'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  buildCaptionTrack,
  buildScene,
  createProject,
  createRenderer,
  DEFAULT_CAPTIONS,
  DEFAULT_STYLE,
  DEFAULT_WEBCAM,
  generateZooms,
  parseEvents,
  sceneFrame,
  visibleZooms,
  WALLPAPERS,
  type Aspect,
  type CaptionSettings,
  type Context2D,
  type Project,
  type Style,
  type WebcamSettings,
} from '../packages/core/src/index.ts'
import { DEFAULT_DIFF, diffImages } from './image-diff.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURES = join(ROOT, 'packages/core/fixtures')
const REFERENCES = join(FIXTURES, 'visual')
const OUT = join(ROOT, 'out-visual')

/** Small outputs keep the committed PNGs light; layout scales with the short side anyway. */
const OUTPUT: Record<Aspect, { width: number; height: number }> = {
  '16:9': { width: 640, height: 360 },
  '1:1': { width: 360, height: 360 },
  '9:16': { width: 360, height: 640 },
}
/** Recorded screen size of the fixtures (fixtures/generate.ts → FIXTURE_VIDEO). */
const VIDEO = { width: 1920, height: 1080 }
const CAMERA = { width: 640, height: 480 }

interface Case {
  name: string
  fixture: string
  aspect: Aspect
  timeMs: number
  style?: Partial<Style>
  webcam?: Partial<WebcamSettings>
  captions?: Partial<CaptionSettings>
  backgroundImage?: boolean
}

const wallpaper = (index: number) => WALLPAPERS[index % WALLPAPERS.length]!.id

const CASES: Case[] = [
  // Style (F-08): defaults, a solid color without shadow, another wallpaper with big corners.
  { name: '16x9-default-idle', fixture: 'spaced-clicks', aspect: '16:9', timeMs: 600 },
  {
    name: '16x9-color-flat',
    fixture: 'spaced-clicks',
    aspect: '16:9',
    timeMs: 600,
    style: {
      background: { kind: 'color', value: '#E8D9C5' },
      padding: 0,
      radius: 0,
      shadow: false,
    },
  },
  {
    name: '16x9-wallpaper-round',
    fixture: 'spaced-clicks',
    aspect: '16:9',
    timeMs: 600,
    style: { background: { kind: 'preset', value: wallpaper(3) }, padding: 18, radius: 28 },
  },
  {
    name: '16x9-image-background',
    fixture: 'spaced-clicks',
    aspect: '16:9',
    timeMs: 600,
    style: { background: { kind: 'image', value: 'background-visual.png' } },
    backgroundImage: true,
  },
  // Zoom (F-05/F-06) and cursor (F-07): a click with its ripple, zoomed in, a drag.
  { name: '16x9-click-ripple', fixture: 'spaced-clicks', aspect: '16:9', timeMs: 1300 },
  { name: '16x9-zoomed', fixture: 'spaced-clicks', aspect: '16:9', timeMs: 2400 },
  { name: '16x9-drag', fixture: 'drag', aspect: '16:9', timeMs: 2000 },
  { name: '16x9-edge-zoom', fixture: 'edge-clicks', aspect: '16:9', timeMs: 2500 },
  // Crop formats (A-02): the crop follows the camera and the cursor.
  { name: '1x1-follow', fixture: 'spaced-clicks', aspect: '1:1', timeMs: 5400 },
  { name: '9x16-follow', fixture: 'edge-clicks', aspect: '9:16', timeMs: 2500 },
  // Webcam (A-03): bubble shapes and corners, and the 9:16 split layout.
  {
    name: '16x9-webcam-circle',
    fixture: 'no-clicks',
    aspect: '16:9',
    timeMs: 1500,
    webcam: { shape: 'circle', position: 'bottom-right', size: 'medium' },
  },
  {
    name: '16x9-webcam-square',
    fixture: 'no-clicks',
    aspect: '16:9',
    timeMs: 1500,
    webcam: { shape: 'square', position: 'top-left', size: 'large' },
  },
  {
    name: '1x1-webcam-landscape',
    fixture: 'no-clicks',
    aspect: '1:1',
    timeMs: 1500,
    webcam: { shape: 'landscape', position: 'bottom-left', size: 'small' },
  },
  {
    name: '9x16-webcam-portrait',
    fixture: 'no-clicks',
    aspect: '9:16',
    timeMs: 1500,
    webcam: { shape: 'portrait', position: 'top-right', size: 'medium' },
  },
  {
    name: '9x16-split',
    fixture: 'spaced-clicks',
    aspect: '9:16',
    timeMs: 2400,
    webcam: { layout: 'split' },
  },
  {
    name: '9x16-split-camera-first',
    fixture: 'spaced-clicks',
    aspect: '9:16',
    timeMs: 2400,
    webcam: { layout: 'split', split: { ratio: 0.62, cameraFirst: true } },
  },
  // Captions (A-06): the three looks, both positions, every format.
  { name: '16x9-captions-clean', fixture: 'no-clicks', aspect: '16:9', timeMs: 1500, captions: {} },
  {
    name: '1x1-captions-bold-middle',
    fixture: 'no-clicks',
    aspect: '1:1',
    timeMs: 1500,
    captions: { preset: 'bold', position: 'middle', size: 'large' },
  },
  {
    name: '9x16-captions-kamo-split',
    fixture: 'spaced-clicks',
    aspect: '9:16',
    timeMs: 1500,
    webcam: { layout: 'split' },
    captions: { preset: 'kamo', size: 'small' },
  },
]

const TRANSCRIPT = {
  language: 'en',
  segments: [
    {
      startMs: 800,
      endMs: 3200,
      text: 'Click the new project button, then pick the screen you want to record.',
    },
  ],
}

function registerFonts(): void {
  const require = createRequire(join(ROOT, 'packages/design-tokens/package.json'))
  for (const weight of [400, 500, 600, 700, 800]) {
    const file = require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff2`)
    GlobalFonts.registerFromPath(file, 'Inter')
  }
}

/** A fake product screen: sidebar, toolbar, cards and fine lines that show scaling. */
function syntheticScreen(): Canvas {
  const canvas = createCanvas(VIDEO.width, VIDEO.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#F6F4EF'
  ctx.fillRect(0, 0, VIDEO.width, VIDEO.height)
  ctx.fillStyle = '#23302A'
  ctx.fillRect(0, 0, 280, VIDEO.height)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i === 2 ? '#7FB77E' : '#3A4A42'
    ctx.fillRect(32, 120 + i * 72, 216, 44)
  }
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(280, 0, VIDEO.width - 280, 88)
  ctx.fillStyle = '#E2DED5'
  ctx.fillRect(280, 88, VIDEO.width - 280, 2)
  ctx.fillStyle = '#E9785B'
  ctx.fillRect(VIDEO.width - 240, 22, 200, 44)
  const colors = ['#9CC7E8', '#F2C46D', '#B9A5E3', '#8FD1B6', '#F29E9E', '#C9D67A']
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 340 + col * 390
      const y = 140 + row * 300
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(x, y, 350, 260)
      ctx.fillStyle = colors[(row * 4 + col) % colors.length]!
      ctx.fillRect(x + 20, y + 20, 310, 140)
      ctx.fillStyle = '#CFCAC0'
      ctx.fillRect(x + 20, y + 180, 220, 16)
      ctx.fillRect(x + 20, y + 210, 160, 16)
    }
  }
  ctx.strokeStyle = '#2B2A26'
  ctx.lineWidth = 2
  for (let x = 300; x < VIDEO.width; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, VIDEO.height - 40)
    ctx.lineTo(x + 20, VIDEO.height - 10)
    ctx.stroke()
  }
  return canvas
}

/** A fake webcam picture: a warm room and a head-and-shoulders silhouette. */
function syntheticCamera(): Canvas {
  const canvas = createCanvas(CAMERA.width, CAMERA.height)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, CAMERA.width, CAMERA.height)
  gradient.addColorStop(0, '#D9B99B')
  gradient.addColorStop(1, '#8C6E5A')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CAMERA.width, CAMERA.height)
  ctx.fillStyle = '#3E5C76'
  ctx.beginPath()
  ctx.arc(CAMERA.width / 2, CAMERA.height + 120, 260, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#F1C9A5'
  ctx.beginPath()
  ctx.arc(CAMERA.width / 2, 200, 110, 0, Math.PI * 2)
  ctx.fill()
  // Off-center mark: shows the mirroring.
  ctx.fillStyle = '#E9785B'
  ctx.fillRect(40, 40, 90, 60)
  return canvas
}

function syntheticBackground(): Canvas {
  const canvas = createCanvas(1200, 800)
  const ctx = canvas.getContext('2d')
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? '#C9DCEB' : '#EAD7C3'
    ctx.fillRect(i * 100, 0, 100, 800)
  }
  ctx.fillStyle = '#5B7F6E'
  ctx.beginPath()
  ctx.arc(600, 400, 260, 0, Math.PI * 2)
  ctx.fill()
  return canvas
}

function render(test: Case, screen: Canvas, camera: Canvas, background: Canvas): Canvas {
  const { events } = parseEvents(readFileSync(join(FIXTURES, `${test.fixture}.jsonl`), 'utf8'))
  const durationMs = Math.ceil((events.at(-1)?.t ?? 0) + 1000)
  const project: Project = {
    ...createProject({
      id: '00000000-0000-4000-8000-000000000000',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      name: test.name,
      source: { kind: 'display', ...VIDEO, scaleFactor: 1, fps: 30 },
      durationMs,
      style: { ...DEFAULT_STYLE, ...test.style },
    }),
  }
  if (test.webcam) project.webcam = { ...DEFAULT_WEBCAM, ...test.webcam }
  const { zooms } = generateZooms({ events, video: VIDEO, durationMs })
  const captions = test.captions
    ? buildCaptionTrack(TRANSCRIPT, { ...DEFAULT_CAPTIONS, ...test.captions })
    : null
  const scene = buildScene({
    project,
    events,
    zooms: visibleZooms(zooms, { autoZoom: true }),
    captions,
  })
  if (test.backgroundImage) {
    scene.backgroundImage = { source: background, size: { width: 1200, height: 800 } }
  }

  const output = OUTPUT[test.aspect]
  const canvas = createCanvas(output.width, output.height)
  const renderer = createRenderer(canvas.getContext('2d') as unknown as Context2D, {
    createSurface: (size) => {
      const surface = createCanvas(size.width, size.height)
      return { canvas: surface, ctx: surface.getContext('2d') as unknown as Context2D }
    },
  })
  renderer.render(
    sceneFrame(
      scene,
      screen,
      test.aspect,
      output,
      test.timeMs,
      test.webcam ? { source: camera, size: CAMERA } : null,
    ),
  )
  return canvas
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const update = args.includes('--update')
  const filter = args.find((arg) => !arg.startsWith('--'))
  const cases = CASES.filter((test) => !filter || test.name.includes(filter))
  if (cases.length === 0) {
    console.error(`no visual case matches "${filter}"`)
    return 2
  }
  registerFonts()
  const screen = syntheticScreen()
  const camera = syntheticCamera()
  const background = syntheticBackground()
  mkdirSync(REFERENCES, { recursive: true })
  rmSync(OUT, { recursive: true, force: true })

  let failed = 0
  for (const test of cases) {
    const canvas = render(test, screen, camera, background)
    const png = canvas.toBuffer('image/png')
    const reference = join(REFERENCES, `${test.name}.png`)
    if (update) {
      writeFileSync(reference, png)
      console.log(`wrote ${test.name}.png (${(png.length / 1024).toFixed(0)}KB)`)
      continue
    }
    let expectedPng: Buffer
    try {
      expectedPng = readFileSync(reference)
    } catch {
      console.log(`FAIL ${test.name}: no reference (run pnpm visual:update)`)
      failed++
      continue
    }
    const expected = await loadImage(expectedPng)
    const { width, height } = canvas
    if (expected.width !== width || expected.height !== height) {
      console.log(
        `FAIL ${test.name}: size ${width}×${height}, reference ${expected.width}×${expected.height}`,
      )
      failed++
      continue
    }
    const expectedCanvas = createCanvas(width, height)
    expectedCanvas.getContext('2d').drawImage(expected, 0, 0)
    const result = diffImages(
      canvas.getContext('2d').getImageData(0, 0, width, height).data,
      expectedCanvas.getContext('2d').getImageData(0, 0, width, height).data,
    )
    const share = ((result.different / result.total) * 100).toFixed(3)
    if (result.match) {
      console.log(`ok   ${test.name} (${share}% over tolerance, max Δ ${result.maxDelta})`)
      continue
    }
    failed++
    mkdirSync(OUT, { recursive: true })
    writeFileSync(join(OUT, `${test.name}.actual.png`), png)
    writeFileSync(join(OUT, `${test.name}.expected.png`), expectedPng)
    const diffCanvas = createCanvas(width, height)
    const diffCtx = diffCanvas.getContext('2d')
    const image = diffCtx.createImageData(width, height)
    image.data.set(result.diff)
    diffCtx.putImageData(image, 0, 0)
    writeFileSync(join(OUT, `${test.name}.diff.png`), diffCanvas.toBuffer('image/png'))
    console.log(
      `FAIL ${test.name}: ${share}% of pixels over tolerance (allowed ${
        DEFAULT_DIFF.maxDifferentRatio * 100
      }%), max Δ ${result.maxDelta}; see out-visual/${test.name}.diff.png`,
    )
  }
  if (!update) {
    console.log(
      failed
        ? `${failed} of ${cases.length} frames differ. Intended? pnpm visual:update and review the PNGs.`
        : `${cases.length} frames match the references.`,
    )
  }
  return failed ? 1 : 0
}

process.exit(await main())
