// Regenerates the small tray icons in build/tray/ from build/icon.png (close to tray, F-15).
// Run from apps/desktop: `pnpm exec electron scripts/make-tray-icons.mjs`.
//
// - Windows (and Linux): the colour icon at 16, 24, 32 and 48 px (100%–300% scaling). Electron
//   picks the `@Nx` file that matches the display.
// - Mac: a template image (black with alpha, the menu bar tints it), 16 and 32 px. The mark is
//   the light parts of the icon (the chameleon's head, with the eye cut out), so it stays
//   recognisable as Kamo in one colour.
import { app, nativeImage } from 'electron'
import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'build', 'tray')

const COLOR_SIZES = { '': 16, '@1.5x': 24, '@2x': 32, '@3x': 48 }
const TEMPLATE_SIZES = { '': 16, '@2x': 32 }
const MASK_SIZE = 256
/** Width of the tile's light edge at MASK_SIZE. */
const RIM_PX = 18

/** Light pixels (head, eye white) become ink; the dark background and the iris stay clear. */
function templateMask(source) {
  const big = source.resize({ width: MASK_SIZE, height: MASK_SIZE, quality: 'best' })
  const bgra = big.toBitmap()
  const mask = Buffer.alloc(bgra.length)
  const alphaAt = (x, y) =>
    x < 0 || y < 0 || x >= MASK_SIZE || y >= MASK_SIZE ? 0 : bgra[(y * MASK_SIZE + x) * 4 + 3]
  for (let i = 0; i < bgra.length; i += 4) {
    const alpha = bgra[i + 3] / 255
    if (alpha === 0) continue
    // Skip the light paper bevel along the tile's edge: only the inside of the tile counts.
    const x = (i / 4) % MASK_SIZE
    const y = Math.floor(i / 4 / MASK_SIZE)
    const inset = RIM_PX
    if (
      Math.min(
        alphaAt(x - inset, y),
        alphaAt(x + inset, y),
        alphaAt(x, y - inset),
        alphaAt(x, y + inset),
      ) < 250
    ) {
      continue
    }
    // Straight colour from premultiplied BGRA.
    const b = bgra[i] / 255 / alpha
    const g = bgra[i + 1] / 255 / alpha
    const r = bgra[i + 2] / 255 / alpha
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    // Soft threshold between the dark leaves (~0.45) and the head (~0.75).
    const ink = Math.max(0, Math.min(1, (luminance - 0.58) / 0.08)) * alpha
    mask[i + 3] = Math.round(ink * 255) // black, premultiplied: colour channels stay 0
  }
  return nativeImage.createFromBitmap(mask, { width: MASK_SIZE, height: MASK_SIZE })
}

app.whenReady().then(() => {
  const source = nativeImage.createFromPath(join(root, 'build', 'icon.png'))
  if (source.isEmpty()) throw new Error('build/icon.png not found')
  mkdirSync(out, { recursive: true })
  for (const [suffix, size] of Object.entries(COLOR_SIZES)) {
    const image = source.resize({ width: size, height: size, quality: 'best' })
    writeFileSync(join(out, `tray${suffix}.png`), image.toPNG())
  }
  const mask = templateMask(source)
  for (const [suffix, size] of Object.entries(TEMPLATE_SIZES)) {
    const image = mask.resize({ width: size, height: size, quality: 'best' })
    writeFileSync(join(out, `trayTemplate${suffix}.png`), image.toPNG())
  }
  // KAMO_TRAY_PREVIEW=<file.png>: a large copy of the template, to check the shape by eye.
  const preview = process.env['KAMO_TRAY_PREVIEW']
  if (preview) writeFileSync(preview, mask.toPNG())
  app.quit()
})
