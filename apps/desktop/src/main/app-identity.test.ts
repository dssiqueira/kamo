import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  name: 'Electron',
  customUserData: false,
  paths: { appData: 'app-data', userData: 'app-data/Electron' } as Record<string, string>,
}))

vi.mock('electron', () => ({
  app: {
    getName: () => electron.name,
    setName: (name: string) => {
      electron.name = name
    },
    getPath: (key: string) => electron.paths[key],
    setPath: (key: string, value: string) => {
      electron.paths[key] = value
    },
    commandLine: {
      hasSwitch: (name: string) => name === 'user-data-dir' && electron.customUserData,
    },
  },
}))

beforeEach(() => {
  vi.resetModules()
  electron.name = 'Electron'
  electron.customUserData = false
  electron.paths = { appData: 'app-data', userData: 'app-data/Electron' }
})

describe('app identity', () => {
  it('moves a run without package.json to the Kamo app-data folder', async () => {
    await import('./app-identity.ts')
    expect(electron.name).toBe('Kamo')
    expect(electron.paths['userData']).toBe(join('app-data', 'Kamo'))
  })

  it('leaves a normal run and an explicit --user-data-dir alone', async () => {
    const { needsIdentityFix } = await import('./app-identity.ts')
    expect(needsIdentityFix('Kamo', false)).toBe(false)
    expect(needsIdentityFix('Electron', true)).toBe(false)
    expect(needsIdentityFix('Electron', false)).toBe(true)
  })
})
