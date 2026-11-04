import { describe, expect, it } from 'vitest'
import { assertProjectId, isProjectId, splitProjectPath } from './paths.ts'

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
