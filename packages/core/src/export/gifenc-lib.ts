// `gifenc` (MIT, https://github.com/mattdesl/gifenc, ~9kB, no dependencies) ships an ES
// module (what Vite bundles) and a CommonJS build whose named exports Node cannot see (what
// Vitest loads): take them from whichever shape arrived. It ships no types, so the parts the
// GIF export uses are typed here.
// @ts-expect-error -- gifenc has no type declarations; GifencModule below types what is used
import * as namespace from 'gifenc'

export type RgbColor = [number, number, number]
export type Palette = number[][]

export interface GifFrameOptions {
  palette?: Palette | null
  delay?: number
  transparent?: boolean
  transparentIndex?: number
  repeat?: number
  dispose?: number
  first?: boolean
  colorDepth?: number
}

export interface GifEncoderInstance {
  writeHeader(): void
  writeFrame(index: Uint8Array, width: number, height: number, options?: GifFrameOptions): void
  finish(): void
  bytes(): Uint8Array
  reset(): void
}

interface GifencModule {
  GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoderInstance
  quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): Palette
  applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array
}

const loaded = namespace as Partial<GifencModule> & { default?: GifencModule }
const lib: GifencModule =
  typeof loaded.GIFEncoder === 'function'
    ? (loaded as GifencModule)
    : (loaded.default as GifencModule)

export const GIFEncoder = lib.GIFEncoder
export const quantize = lib.quantize
export const applyPalette = lib.applyPalette
