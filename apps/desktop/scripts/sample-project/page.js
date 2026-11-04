// Draws a fake product screen whose elements react to the scenario's clicks, records it with
// MediaRecorder and sends the bytes and reference frames to main. No cursor is drawn: Kamo
// redraws it from events.jsonl (D-005).
/* global window, document, performance, MediaRecorder, setInterval, clearInterval */

const MIME_TYPES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm',
]
const BITRATE = 12_000_000
const CHUNK_MS = 1000
const TICK_MS = 1000 / 60
const FRAME_EVERY_MS = 5000
const FRAME_WIDTH = 480
const FRAME_QUALITY = 0.7

// DESIGN.md light palette.
const C = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  raised: '#F3EFE8',
  border: '#E6E0D6',
  text: '#2B2A26',
  muted: '#6F6A61',
  primary: '#A8D5A2',
  primaryPressed: '#97CB90',
  onPrimary: '#1F3A1C',
  primaryStrong: '#3F7539',
  primaryContainer: '#E3F1E0',
  tertiary: '#3E8C84',
  tertiaryContainer: '#CDE8E4',
}
const FONT = 'system-ui, "Segoe UI", -apple-system, sans-serif'

const NAV = ['Home', 'Recent', 'Projects', 'Shared', 'Archive']
const NAV_Y = [200, 265, 330, 395, 460]
const CARDS = [
  ['Q3 roadmap', '#E3F1E0', '#3F7539'],
  ['Onboarding flow', '#CDE8E4', '#2F6F68'],
  ['Pricing page', '#FBE3EB', '#B04D6F'],
  ['Release notes', '#F3EFE8', '#875810'],
  ['Design review', '#E3F1E0', '#3F7539'],
  ['Onboarding walkthrough', '#CDE8E4', '#2F6F68'],
  ['Team sync', '#FBE3EB', '#B04D6F'],
  ['Bug triage', '#F3EFE8', '#875810'],
  ['Launch checklist', '#E3F1E0', '#3F7539'],
]
const NEW_CARD = 5
const CARD_W = 460
const CARD_H = 320
const TYPED = 'Onboarding walkthrough'
const PANEL_W = 540
const PANEL_X = 1920 - PANEL_W

// ---------- time helpers ----------

const clamp01 = (v) => Math.min(1, Math.max(0, v))
/** 0→1 between `start` and `start + duration`, eased (fake app animation, not Kamo's). */
function ease(t, start, duration) {
  const p = clamp01((t - start) / duration)
  return p * p * (3 - 2 * p)
}
const lerp = (a, b, p) => a + (b - a) * p
/** Short dip right after a click: 1 at rest, `depth` while pressed. */
const press = (t, at, depth = 0.95) =>
  t >= at && t < at + 220 ? lerp(depth, 1, ease(t, at + 80, 140)) : 1

function pointerAt(events, t) {
  let point = events[0] ?? { x: 960, y: 540 }
  for (const event of events) {
    if (event.t > t) break
    point = event
  }
  return point
}

// ---------- drawing primitives ----------

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

function text(ctx, value, x, y, size, color, weight = 400, align = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(value, x, y)
}

/** A grey bar standing in for a line of text. */
const bar = (ctx, x, y, w, color = C.border, h = 12) =>
  roundRect(ctx, x, y - h / 2, w, h, h / 2, color)

function withShadow(ctx, blur, offsetY, draw) {
  ctx.save()
  ctx.shadowColor = 'rgba(43, 42, 38, 0.16)'
  ctx.shadowBlur = blur
  ctx.shadowOffsetY = offsetY
  draw()
  ctx.restore()
}

/** Scales around (cx, cy) while drawing. */
function scaled(ctx, cx, cy, scale, draw) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.translate(-cx, -cy)
  draw()
  ctx.restore()
}

// ---------- the fake product ----------

function drawTopBar(ctx) {
  ctx.fillStyle = C.surface
  ctx.fillRect(0, 0, 1920, 64)
  ctx.fillStyle = C.border
  ctx.fillRect(0, 63, 1920, 1)
  roundRect(ctx, 26, 18, 28, 28, 8, C.primary)
  text(ctx, 'Acme Studio', 70, 32, 20, C.text, 600)
  roundRect(ctx, 740, 14, 440, 36, 18, C.raised)
  bar(ctx, 770, 32, 160, C.border, 10)
  roundRect(ctx, 1852, 16, 32, 32, 16, C.tertiaryContainer)
  bar(ctx, 1730, 32, 96, C.border, 10)
}

function drawSidebar(ctx, t, m) {
  ctx.fillStyle = C.surface
  ctx.fillRect(0, 64, 300, 1016)
  ctx.fillStyle = C.border
  ctx.fillRect(299, 64, 1, 1016)
  text(ctx, 'WORKSPACE', 32, 150, 13, C.muted, 600)

  const selectedY = lerp(NAV_Y[0], NAV_Y[2], ease(t, m.navClick + 60, 260))
  const pressed = press(t, m.navClick, 0.94)
  scaled(ctx, 150, selectedY, pressed, () =>
    roundRect(ctx, 16, selectedY - 24, 268, 48, 12, C.tertiaryContainer),
  )
  NAV.forEach((label, i) => {
    const active = Math.abs(selectedY - NAV_Y[i]) < 24
    roundRect(ctx, 36, NAV_Y[i] - 10, 20, 20, 6, active ? C.tertiary : C.border)
    text(ctx, label, 72, NAV_Y[i], 18, active ? C.text : C.muted, active ? 600 : 400)
  })

  roundRect(ctx, 16, 900, 268, 140, 14, C.raised)
  text(ctx, 'Storage', 36, 932, 15, C.text, 600)
  roundRect(ctx, 36, 966, 228, 10, 5, C.border)
  roundRect(ctx, 36, 966, 150, 10, 5, C.primaryStrong)
  bar(ctx, 36, 1004, 120, C.border, 10)
}

function slotOrigin(slot) {
  return { x: 340 + (slot % 3) * 500, y: 310 + Math.floor(slot / 3) * 350 }
}

function drawCard(ctx, index, x, y, { scale = 1, alpha = 1, lifted = false, glow = 0 } = {}) {
  const [title, tint, accent] = CARDS[index]
  ctx.save()
  ctx.globalAlpha = alpha
  scaled(ctx, x + CARD_W / 2, y + CARD_H / 2, scale, () => {
    const body = () => roundRect(ctx, x, y, CARD_W, CARD_H, 16, C.surface, C.border)
    if (lifted) withShadow(ctx, 40, 18, body)
    else body()
    if (glow > 0) {
      ctx.globalAlpha = alpha * glow
      roundRect(ctx, x - 3, y - 3, CARD_W + 6, CARD_H + 6, 18, null, C.primaryStrong)
      ctx.globalAlpha = alpha
    }
    roundRect(ctx, x + 16, y + 16, CARD_W - 32, 190, 12, tint)
    // a tiny "screenshot" inside the thumbnail
    roundRect(ctx, x + 40, y + 40, 120, 142, 8, 'rgba(255,255,255,0.7)')
    for (let i = 0; i < 4; i++) bar(ctx, x + 184, y + 56 + i * 30, 200 - i * 34, accent, 10)
    roundRect(ctx, x + 184, y + 160, 90, 26, 13, accent)
    text(ctx, title, x + 20, y + 240, 21, C.text, 600)
    bar(ctx, x + 20, y + 276, 150, C.border, 10)
    for (let i = 0; i < 3; i++) {
      roundRect(
        ctx,
        x + CARD_W - 104 + i * 26,
        y + 262,
        28,
        28,
        14,
        i === 1 ? tint : C.raised,
        C.surface,
      )
    }
  })
  ctx.restore()
}

function drawContent(ctx, t, m, events, grab) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(300, 64, 1620, 1016)
  ctx.clip()

  const scroll = m.scrolls.reduce((sum, s) => sum + s.dy * ease(t, s.t, 260), 0)
  ctx.translate(0, -scroll)

  // header: the title switches when "Projects" is clicked
  const switched = ease(t, m.navClick + 80, 260)
  ctx.save()
  ctx.globalAlpha = 1 - switched
  text(ctx, 'Home', 340, 112, 34, C.text, 700)
  ctx.globalAlpha = switched
  text(ctx, 'Projects', 340, 112, 34, C.text, 700)
  ctx.restore()
  bar(ctx, 340, 146, 260, C.border, 10)

  const buttonScale = press(t, m.newClick, 0.94)
  const buttonFill = t >= m.newClick && t < m.newClick + 220 ? C.primaryPressed : C.primary
  scaled(ctx, 1720, 110, buttonScale, () => {
    roundRect(ctx, 1620, 84, 200, 52, 14, buttonFill)
    text(ctx, '+  New project', 1720, 110, 18, C.onPrimary, 600, 'center')
  })

  for (let i = 0; i < 3; i++) {
    const x = 340 + i * 500
    roundRect(ctx, x, 180, CARD_W, 96, 14, C.surface, C.border)
    text(ctx, ['Recordings', 'Views this week', 'Shared links'][i], x + 24, 210, 15, C.muted)
    text(ctx, ['128', '2,431', '37'][i], x + 24, 248, 28, C.text, 700)
    for (let k = 0; k < 8; k++) {
      const h = 14 + ((k * 7 + i * 5) % 30)
      roundRect(ctx, x + 300 + k * 18, 256 - h, 10, h, 3, k === 7 ? C.primaryStrong : C.primary)
    }
  }

  // cards: 0 is dragged onto slot 1; card 1 slides into slot 0 when 0 passes it
  const crossed = events.find((e) => e.t >= m.dragStart && e.t <= m.dragEnd && e.x > 840)
  const swap = crossed ? ease(t, crossed.t, 260) : 0
  const created = ease(t, m.createClick + 520, 380)
  for (let index = CARDS.length - 1; index >= 0; index--) {
    if (index === 0) continue
    if (index === NEW_CARD && created === 0) continue
    let { x, y } = slotOrigin(index)
    if (index === 1) x = lerp(slotOrigin(1).x, slotOrigin(0).x, swap)
    const options =
      index === NEW_CARD
        ? {
            scale: lerp(0.85, 1, created),
            alpha: created,
            glow: 1 - ease(t, m.createClick + 2200, 800),
          }
        : {}
    drawCard(ctx, index, x, y, options)
  }

  const home = slotOrigin(0)
  if (t < m.dragStart) {
    drawCard(ctx, 0, home.x, home.y)
  } else {
    // follows the pointer while held, then settles into slot 1
    const at = pointerAt(events, Math.min(t, m.dragEnd))
    const held = { x: home.x + at.x - grab.x, y: home.y + at.y - grab.y }
    const target = slotOrigin(1)
    const settle = ease(t, m.dragEnd, 260)
    const lift = t <= m.dragEnd ? ease(t, m.dragStart, 150) : 1 - settle
    drawCard(ctx, 0, lerp(held.x, target.x, settle), lerp(held.y, target.y, settle), {
      scale: 1 + 0.04 * lift,
      lifted: lift > 0,
    })
  }

  bar(ctx, 340, 1360, 420, C.border, 10)
  bar(ctx, 340, 1390, 280, C.border, 10)
  ctx.restore()
}

function drawPanel(ctx, t, m) {
  const open = ease(t, m.newClick + 100, 340) - ease(t, m.createClick + 220, 300)
  if (open <= 0) return
  ctx.fillStyle = `rgba(43, 42, 38, ${0.18 * open})`
  ctx.fillRect(0, 64, 1920, 1016)

  ctx.save()
  ctx.translate(PANEL_W * (1 - open), 0)
  withShadow(ctx, 48, 0, () => {
    ctx.fillStyle = C.surface
    ctx.fillRect(PANEL_X, 64, PANEL_W, 1016)
  })
  const x = PANEL_X + 40
  text(ctx, 'New project', x, 130, 28, C.text, 700)
  text(ctx, '×', 1860, 128, 32, C.muted, 400, 'center')
  bar(ctx, x, 180, 380)
  bar(ctx, x, 204, 300)

  // name field: focus ring, then the name appears with a blinking caret
  const focused = t >= m.fieldClick && t < m.createClick + 200
  text(ctx, 'Name', x, 286, 16, C.muted, 600)
  if (focused) roundRect(ctx, x - 4, 301, 448, 58, 14, C.tertiaryContainer)
  roundRect(ctx, x, 305, 440, 50, 10, C.surface, focused ? C.tertiary : C.border)
  const typed = TYPED.slice(0, Math.floor(TYPED.length * clamp01((t - m.fieldClick - 300) / 1100)))
  if (typed) text(ctx, typed, x + 16, 330, 18, C.text)
  else bar(ctx, x + 16, 330, 140, C.raised)
  if (focused && Math.floor((t - m.fieldClick) / 500) % 2 === 0) {
    ctx.font = `400 18px ${FONT}`
    ctx.fillStyle = C.text
    ctx.fillRect(x + 18 + ctx.measureText(typed).width, 318, 2, 24)
  }

  text(ctx, 'Template', x, 382, 16, C.muted, 600)
  roundRect(ctx, x, 396, 440, 44, 10, C.raised)
  text(ctx, 'Product walkthrough', x + 16, 418, 18, C.text)

  // toggle row (the switch sits at 1790, 470)
  const on = ease(t, m.toggleClick + 40, 200)
  text(ctx, 'Zoom on clicks', x, 460, 18, C.text, 600)
  bar(ctx, x, 488, 260, C.border, 10)
  scaled(ctx, 1790, 470, press(t, m.toggleClick, 0.9), () => {
    roundRect(ctx, 1758, 454, 64, 32, 16, on > 0.5 ? C.primaryStrong : C.border)
    roundRect(ctx, lerp(1762, 1794, on), 458, 24, 24, 12, C.surface)
  })

  for (let i = 0; i < 4; i++) {
    roundRect(ctx, x, 530 + i * 64, 440, 48, 10, C.surface, C.border)
    bar(ctx, x + 16, 554 + i * 64, 120 + ((i * 53) % 140), C.raised)
  }

  ctx.fillStyle = C.border
  ctx.fillRect(PANEL_X, 900, PANEL_W, 1)
  roundRect(ctx, 1560, 932, 120, 56, 14, C.surface, C.border)
  text(ctx, 'Cancel', 1620, 960, 18, C.text, 600, 'center')
  const createFill = t >= m.createClick && t < m.createClick + 220 ? C.primaryPressed : C.primary
  scaled(ctx, 1760, 960, press(t, m.createClick, 0.93), () => {
    roundRect(ctx, 1690, 932, 140, 56, 14, createFill)
    text(ctx, 'Create', 1760, 960, 18, C.onPrimary, 600, 'center')
  })
  ctx.restore()
}

function drawToast(ctx, t, m) {
  const shown = ease(t, m.createClick + 500, 250) - ease(t, m.createClick + 3000, 250)
  if (shown <= 0) return
  ctx.save()
  ctx.globalAlpha = shown
  const y = 1000 + 20 * (1 - shown)
  withShadow(ctx, 24, 8, () => roundRect(ctx, 790, y, 340, 52, 14, C.text))
  roundRect(ctx, 814, y + 18, 16, 16, 8, C.primary)
  text(ctx, 'Project created', 846, y + 26, 18, C.surface, 600)
  ctx.restore()
}

function drawScene(ctx, t, scenario) {
  const m = scenario.marks
  ctx.fillStyle = C.background
  ctx.fillRect(0, 0, 1920, 1080)
  drawContent(ctx, t, m, scenario.events, scenario.targets.cardFrom)
  drawSidebar(ctx, t, m)
  drawTopBar(ctx)
  drawPanel(ctx, t, m)
  drawToast(ctx, t, m)
}

// ---------- recording ----------

const blobOf = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      type,
      quality,
    ),
  )

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Renders the scene at t = 0, 5s, 10s… and sends each one as a 480px JPEG. */
async function writeFrames(scenario, video, durationMs) {
  const full = createCanvas(video.width, video.height)
  const thumb = createCanvas(FRAME_WIDTH, Math.round((FRAME_WIDTH * video.height) / video.width))
  const thumbCtx = thumb.getContext('2d')
  thumbCtx.imageSmoothingQuality = 'high'
  for (let t = 0; t < durationMs; t += FRAME_EVERY_MS) {
    drawScene(full.getContext('2d'), t, scenario)
    thumbCtx.drawImage(full, 0, 0, thumb.width, thumb.height)
    const jpeg = await blobOf(thumb, 'image/jpeg', FRAME_QUALITY)
    await window.sample.writeFrame(t / 1000, await jpeg.arrayBuffer())
  }
}

async function run() {
  const { scenario, video } = await window.sample.plan()
  const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('MediaRecorder supports none of the candidate formats')
  await window.sample.begin(mimeType)

  const canvas = createCanvas(video.width, video.height)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')
  drawScene(ctx, 0, scenario)

  const recorder = new MediaRecorder(canvas.captureStream(video.fps), {
    mimeType,
    videoBitsPerSecond: BITRATE,
  })
  // chunks go out one at a time, in order
  let writes = Promise.resolve()
  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return
    writes = writes.then(async () => window.sample.writeVideo(await event.data.arrayBuffer()))
  }

  const recordedMs = await new Promise((resolve, reject) => {
    let stoppedAt = 0
    recorder.onerror = (event) => reject(event.error ?? new Error('MediaRecorder error'))
    recorder.onstop = () => resolve(stoppedAt - startedAt)
    // The video timeline starts at start(), not at the (later, async) 'start' event, so the
    // scene clock starts here too; otherwise every event would be early in the video.
    recorder.start(CHUNK_MS)
    const startedAt = performance.now()
    const timer = setInterval(() => {
      const t = performance.now() - startedAt
      drawScene(ctx, Math.min(t, scenario.durationMs), scenario)
      if (t >= scenario.durationMs && recorder.state === 'recording') {
        clearInterval(timer)
        stoppedAt = performance.now()
        recorder.stop()
      }
    }, TICK_MS)
  })
  await writes

  await writeFrames(scenario, video, recordedMs)
  await window.sample.finish({ recordedMs, mimeType: recorder.mimeType || mimeType })
}

window.addEventListener('unhandledrejection', (event) => window.sample.fail(String(event.reason)))
window.addEventListener('error', (event) => window.sample.fail(event.message))
run().catch((error) => window.sample.fail(error instanceof Error ? error.message : String(error)))
