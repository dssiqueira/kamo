// Tiny color helpers for the renderer. Pure, so they run in Node tests.

export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX = /^#([0-9a-f]{6})$/i

/** Parses `#RRGGBB`. Returns null for anything else. */
export function parseHex(value: string): Rgb | null {
  const match = HEX.exec(value.trim())
  const digits = match?.[1]
  if (!digits) return null
  const n = Number.parseInt(digits, 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

/** True for a `#RRGGBB` string. */
export function isHexColor(value: string): boolean {
  return parseHex(value) !== null
}

/** `#RRGGBB` + alpha → `rgba(r, g, b, a)`. Invalid hex falls back to black. */
export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex) ?? { r: 0, g: 0, b: 0 }
  const a = Math.min(1, Math.max(0, alpha))
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(4))})`
}
