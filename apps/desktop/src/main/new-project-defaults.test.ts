import { DEFAULT_CURSOR, DEFAULT_STYLE, type Style } from '@kamo/core'
import { describe, expect, it } from 'vitest'
import { newProjectDefaults, styleForNewProjects } from './new-project-defaults.ts'

const imageStyle: Style = {
  ...DEFAULT_STYLE,
  padding: 20,
  background: { kind: 'image', value: 'background-1a2b3c4d.png' },
}

describe('styleForNewProjects', () => {
  it('keeps a wallpaper or color style as it is', () => {
    const style: Style = { ...DEFAULT_STYLE, background: { kind: 'color', value: '#112233' } }
    expect(styleForNewProjects(style)).toBe(style)
  })

  it("swaps a project's own background image for the default wallpaper", () => {
    expect(styleForNewProjects(imageStyle)).toEqual({
      ...imageStyle,
      background: DEFAULT_STYLE.background,
    })
  })
})

describe('newProjectDefaults', () => {
  it('is empty when nothing was saved', async () => {
    expect(await newProjectDefaults({ get: async () => ({}) })).toEqual({})
  })

  it('carries the last style (without its image) and cursor', async () => {
    const cursor = { ...DEFAULT_CURSOR, size: 2 }
    const defaults = await newProjectDefaults({
      get: async () => ({ lastStyle: imageStyle, lastCursor: cursor }),
    })
    expect(defaults).toEqual({
      style: { ...imageStyle, background: DEFAULT_STYLE.background },
      cursor,
    })
  })
})
