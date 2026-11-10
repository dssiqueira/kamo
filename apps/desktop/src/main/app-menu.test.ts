import { describe, expect, it } from 'vitest'
import { appMenuLabels, appMenuTemplate } from './app-menu.ts'

const labels = appMenuLabels((key) => `[${key}]`)
const noop = () => {}

describe('appMenuTemplate', () => {
  it('names every top menu in the UI language (Windows)', () => {
    const template = appMenuTemplate(labels, { platform: 'win32', dev: false, openSettings: noop })
    expect(template.map((m) => m.label)).toEqual(['[menu.file]', '[menu.edit]', '[menu.view]'])
  })

  it('keeps the Window menu for Mac only', () => {
    const mac = appMenuTemplate(labels, { platform: 'darwin', dev: false, openSettings: noop })
    expect(mac.map((m) => m.label)).toContain('[menu.window]')
  })

  it('adds the app menu with Settings and Quit on Mac', () => {
    const template = appMenuTemplate(labels, { platform: 'darwin', dev: false, openSettings: noop })
    expect(template[0]?.label).toBe('[app.name]')
    const items = template[0]?.submenu as { label?: string; role?: string }[]
    expect(items.some((i) => i.label === '[menu.settings]')).toBe(true)
    expect(items.some((i) => i.role === 'quit' && i.label === '[tray.quit]')).toBe(true)
  })

  it('labels every item, so no English default shows through', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      for (const menu of appMenuTemplate(labels, { platform, dev: true, openSettings: noop })) {
        for (const item of menu.submenu as { type?: string; label?: string }[]) {
          if (item.type !== 'separator') expect(item.label).toMatch(/^\[.+\]$/)
        }
      }
    }
  })

  it('keeps Reload and DevTools out of release builds', () => {
    const view = appMenuTemplate(labels, { platform: 'win32', dev: false, openSettings: noop })[2]
    const roles = (view?.submenu as { role?: string }[]).map((i) => i.role)
    expect(roles).not.toContain('reload')
    expect(roles).not.toContain('toggleDevTools')
  })

  it('opens Settings from the menu', () => {
    let opened = 0
    const file = appMenuTemplate(labels, {
      platform: 'win32',
      dev: false,
      openSettings: () => opened++,
    })[0]
    const settings = (file?.submenu as { label?: string; click?: () => void }[])[0]
    settings?.click?.()
    expect(opened).toBe(1)
  })
})
