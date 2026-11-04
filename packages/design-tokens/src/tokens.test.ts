import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generate, parseDesign } from './tokens.ts'

const design = readFileSync(new URL('../../../DESIGN.md', import.meta.url), 'utf8')

describe('design tokens', () => {
  it('reads light and dark theme colors', () => {
    const tokens = parseDesign(design)
    expect(tokens.colors.light.primary).toBe('#A8D5A2')
    expect(tokens.colors.dark.background).toBe('#1A1D1B')
    // "primary / primary-strong" and "recording / error" apply to both tokens
    expect(tokens.colors.dark['primary-strong']).toBe('#A8D5A2')
    expect(tokens.colors.dark.error).toBe('#F08A7E')
  })

  it('dark theme covers every light theme token', () => {
    const tokens = parseDesign(design)
    expect(Object.keys(tokens.colors.dark)).toEqual(Object.keys(tokens.colors.light))
  })

  it('resolves component references', () => {
    const tokens = parseDesign(design)
    expect(tokens.components['button-primary']).toMatchObject({
      backgroundColor: '#A8D5A2',
      textColor: '#1F3A1C',
      typography: 'title',
      rounded: '10px',
    })
  })

  it('fails when the dark theme misses a token', () => {
    const broken = design.replace(/\| warning \| `#E8C07A` \|\r?\n/, '')
    expect(() => parseDesign(broken)).toThrow(/warning/)
  })

  it('generated/ is up to date with DESIGN.md', () => {
    for (const [file, content] of Object.entries(generate(design))) {
      const onDisk = readFileSync(new URL(`../generated/${file}`, import.meta.url), 'utf8')
      expect(onDisk, `run pnpm --filter design-tokens build (${file})`).toBe(content)
    }
  })
})
