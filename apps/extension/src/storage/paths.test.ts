import { describe, expect, it } from 'vitest'
import {
  assertProjectId,
  findScreenFile,
  isProjectId,
  screenFileFor,
  splitProjectPath,
} from './paths.ts'

describe('screen file', () => {
  it('follows the recorded container', () => {
    expect(screenFileFor('video/mp4;codecs=avc1,opus')).toBe('screen.mp4')
    expect(screenFileFor('video/webm;codecs=vp9,opus')).toBe('screen.webm')
  })

  it('finds the one with content, MP4 first', async () => {
    const sizes = (map: Record<string, number>) => async (name: string) => map[name] ?? null
    expect(await findScreenFile(sizes({ 'screen.webm': 10 }))).toBe('screen.webm')
    expect(await findScreenFile(sizes({ 'screen.mp4': 10, 'screen.webm': 10 }))).toBe('screen.mp4')
    expect(await findScreenFile(sizes({ 'screen.mp4': 0, 'screen.webm': 5 }))).toBe('screen.webm')
    expect(await findScreenFile(sizes({}))).toBeNull()
  })
})

describe('project paths', () => {
  it('splits a nested path', () => {
    expect(splitProjectPath('frames/0005.jpg')).toEqual({
      directories: ['frames'],
      name: '0005.jpg',
    })
    expect(splitProjectPath('project.json')).toEqual({ directories: [], name: 'project.json' })
  })

  it('rejects paths that could leave the project folder', () => {
    for (const bad of ['', '../x', 'frames/../x', 'a//b', '/abs', 'frames/', 'a\\b']) {
      expect(() => splitProjectPath(bad)).toThrow()
    }
  })

  it('accepts only uuid project ids', () => {
    expect(isProjectId('0b9d3c3e-8f4b-4f63-9a51-2f8d7c1e6a10')).toBe(true)
    expect(isProjectId('..')).toBe(false)
    expect(() => assertProjectId('projects')).toThrow()
  })
})
