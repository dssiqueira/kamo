import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ Menu: {}, Tray: class {}, nativeImage: {} }))

const { trayIconFile } = await import('./app-tray.ts')

const TRAY_DIR = join(import.meta.dirname, '..', '..', 'build', 'tray')

describe('tray icon', () => {
  it('uses the template on Mac and the colour icon elsewhere', () => {
    expect(trayIconFile('t', 'darwin')).toBe(join('t', 'trayTemplate.png'))
    expect(trayIconFile('t', 'win32')).toBe(join('t', 'tray.png'))
    expect(trayIconFile('t', 'linux')).toBe(join('t', 'tray.png'))
  })

  it('ships small dedicated files, not the 1MB app icon (light installer, rule 6)', () => {
    const files = readdirSync(TRAY_DIR)
    for (const name of ['tray.png', 'tray@2x.png', 'trayTemplate.png', 'trayTemplate@2x.png']) {
      expect(files).toContain(name)
    }
    const total = files.reduce((sum, name) => sum + statSync(join(TRAY_DIR, name)).size, 0)
    expect(total).toBeLessThan(32 * 1024)
  })
})
