import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appDataDir, resolveProjectsDir } from '../src/folder.ts'
import { parseDateBound, timecode } from '../src/time.ts'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kamo-mcp-folder-'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('appDataDir', () => {
  it("matches Electron's userData folder for the Kamo app", () => {
    expect(appDataDir('win32', { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'C:\\Users\\a')).toBe(
      join('C:\\Users\\a\\AppData\\Roaming', 'Kamo'),
    )
    expect(appDataDir('darwin', {}, '/Users/a')).toBe(
      join('/Users/a', 'Library', 'Application Support', 'Kamo'),
    )
    expect(appDataDir('linux', {}, '/home/a')).toBe(join('/home/a', '.config', 'Kamo'))
  })
})

describe('resolveProjectsDir', () => {
  const env = (appData: string) => ({ APPDATA: appData })

  it('prefers --dir, and accepts ~/Kamo for ~/Kamo/projects', async () => {
    const kamo = join(root, 'Kamo')
    await mkdir(join(kamo, 'projects'), { recursive: true })
    const given = await resolveProjectsDir({ dir: kamo, home: root, env: {}, platform: 'win32' })
    expect(given).toEqual({ dir: join(kamo, 'projects'), source: 'argument' })
    const exact = await resolveProjectsDir({
      dir: join(kamo, 'projects'),
      home: root,
      env: {},
      platform: 'win32',
    })
    expect(exact.dir).toBe(join(kamo, 'projects'))
  })

  it('expands ~ in --dir', async () => {
    const result = await resolveProjectsDir({ dir: '~/Elsewhere', home: root, platform: 'linux' })
    expect(result.dir).toBe(join(root, 'Elsewhere'))
  })

  it("reads projectsDir from the app's settings.json", async () => {
    const appData = join(root, 'AppData')
    const custom = join(root, 'My recordings')
    await mkdir(join(appData, 'Kamo'), { recursive: true })
    await writeFile(
      join(appData, 'Kamo', 'settings.json'),
      JSON.stringify({ version: 1, projectsDir: custom }),
    )
    const result = await resolveProjectsDir({ home: root, env: env(appData), platform: 'win32' })
    expect(result).toEqual({ dir: custom, source: 'settings' })
  })

  it('finds the settings of the Microsoft Store build inside its package', async () => {
    const local = join(root, 'Local')
    const custom = join(root, 'Store recordings')
    const redirected = join(
      local,
      'Packages',
      'DSStudio.Kamo_8wekyb3d8bbwe',
      'LocalCache',
      'Roaming',
      'Kamo',
    )
    await mkdir(redirected, { recursive: true })
    await mkdir(join(local, 'Packages', 'Other.App_123'), { recursive: true })
    await writeFile(join(redirected, 'settings.json'), JSON.stringify({ projectsDir: custom }))
    const result = await resolveProjectsDir({
      home: root,
      env: { APPDATA: join(root, 'NoAppData'), LOCALAPPDATA: local },
      platform: 'win32',
    })
    expect(result).toEqual({ dir: custom, source: 'settings' })
  })

  it('falls back to ~/Kamo/projects when settings have no folder or are broken', async () => {
    const appData = join(root, 'AppData2')
    await mkdir(join(appData, 'Kamo'), { recursive: true })
    await writeFile(join(appData, 'Kamo', 'settings.json'), '{"version": 1, "lastDisplayId": "1"}')
    const fallback = { dir: join(root, 'Kamo', 'projects'), source: 'default' }
    expect(await resolveProjectsDir({ home: root, env: env(appData), platform: 'win32' })).toEqual(
      fallback,
    )
    await writeFile(join(appData, 'Kamo', 'settings.json'), '{oops')
    expect(await resolveProjectsDir({ home: root, env: env(appData), platform: 'win32' })).toEqual(
      fallback,
    )
    await writeFile(join(appData, 'Kamo', 'settings.json'), '{"projectsDir": "relative/path"}')
    expect(await resolveProjectsDir({ home: root, env: env(appData), platform: 'win32' })).toEqual(
      fallback,
    )
    expect(
      await resolveProjectsDir({ home: root, env: env(join(root, 'none')), platform: 'win32' }),
    ).toEqual(fallback)
  })
})

describe('time', () => {
  it('formats hh:mm:ss', () => {
    expect(timecode(0)).toBe('00:00:00')
    expect(timecode(65_300)).toBe('00:01:05')
    expect(timecode(3_725_999)).toBe('01:02:05')
    expect(timecode(-5)).toBe('00:00:00')
  })

  it('parses date bounds', () => {
    expect(parseDateBound('2026-11-04', 'start')?.getHours()).toBe(0)
    expect(parseDateBound('2026-11-04', 'end')?.getHours()).toBe(23)
    expect(parseDateBound('2026-11-04T10:00:00Z', 'start')?.toISOString()).toBe(
      '2026-11-04T10:00:00.000Z',
    )
    expect(parseDateBound('yesterday', 'start')).toBeNull()
  })
})
