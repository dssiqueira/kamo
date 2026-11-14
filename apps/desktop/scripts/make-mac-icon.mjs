// Regenerates build/icon-mac.png, the Mac app icon, from build/icon.png.
// Run from apps/desktop: `node scripts/make-mac-icon.mjs`.
//
// macOS 26 puts an icon that does not follow Apple's template inside a grey rounded box. The
// template is a 1024 px canvas with an 824 px rounded square (continuous corners) centred on it
// and nothing outside. build/icon.png (also used on Windows) fills almost the whole canvas and
// has its own light rim and shadow, so the Mac icon takes a square from inside its green tile,
// cuts it to the template's shape and centres it.
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CANVAS = 1024
const TILE = 824
/** The part of build/icon.png inside its green tile, clear of the rounded corners and the rim. */
const SOURCE = { x: 90, y: 75, size: 840 }
/** Superellipse exponent close to Apple's continuous corners at this size. */
const EXPONENT = 5

/** The template's rounded square as a path: |x/a|^n + |y/a|^n = 1. */
function squircle(context, centre, half) {
  const steps = 720
  context.beginPath()
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const x = centre + half * Math.sign(cos) * Math.abs(cos) ** (2 / EXPONENT)
    const y = centre + half * Math.sign(sin) * Math.abs(sin) ** (2 / EXPONENT)
    if (i === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
}

const source = await loadImage(join(root, 'build', 'icon.png'))
const canvas = createCanvas(CANVAS, CANVAS)
const context = canvas.getContext('2d')
context.save()
squircle(context, CANVAS / 2, TILE / 2)
context.clip()
const offset = (CANVAS - TILE) / 2
context.drawImage(source, SOURCE.x, SOURCE.y, SOURCE.size, SOURCE.size, offset, offset, TILE, TILE)
context.restore()
writeFileSync(join(root, 'build', 'icon-mac.png'), canvas.toBuffer('image/png'))
process.stdout.write('build/icon-mac.png\n')
