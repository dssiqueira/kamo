// The app menu in the UI language. Electron's default menu is English only, so Kamo builds
// its own with the same standard roles and rebuilds it when the language changes.
import type { MenuItemConstructorOptions } from 'electron'

export interface AppMenuLabels {
  app: string
  file: string
  edit: string
  view: string
  window: string
  settings: string
  about: string
  hide: string
  hideOthers: string
  showAll: string
  quit: string
  close: string
  undo: string
  redo: string
  cut: string
  copy: string
  paste: string
  selectAll: string
  reload: string
  devTools: string
  resetZoom: string
  zoomIn: string
  zoomOut: string
  fullScreen: string
  minimize: string
  zoom: string
  front: string
}

export interface AppMenuOptions {
  platform: NodeJS.Platform
  /** Reload and DevTools only in development. */
  dev: boolean
  openSettings(): void
}

/** The menu template: pure, so it is tested without Electron. */
export function appMenuTemplate(
  labels: AppMenuLabels,
  { platform, dev, openSettings }: AppMenuOptions,
): MenuItemConstructorOptions[] {
  const mac = platform === 'darwin'
  const settings: MenuItemConstructorOptions = {
    label: labels.settings,
    accelerator: 'CommandOrControl+,',
    click: () => openSettings(),
  }
  const template: MenuItemConstructorOptions[] = []
  if (mac) {
    template.push({
      label: labels.app,
      submenu: [
        { role: 'about', label: labels.about },
        { type: 'separator' },
        settings,
        { type: 'separator' },
        { role: 'hide', label: labels.hide },
        { role: 'hideOthers', label: labels.hideOthers },
        { role: 'unhide', label: labels.showAll },
        { type: 'separator' },
        { role: 'quit', label: labels.quit },
      ],
    })
  }
  template.push({
    label: labels.file,
    submenu: mac
      ? [{ role: 'close', label: labels.close }]
      : [settings, { type: 'separator' }, { role: 'quit', label: labels.quit }],
  })
  template.push({
    label: labels.edit,
    submenu: [
      { role: 'undo', label: labels.undo },
      { role: 'redo', label: labels.redo },
      { type: 'separator' },
      { role: 'cut', label: labels.cut },
      { role: 'copy', label: labels.copy },
      { role: 'paste', label: labels.paste },
      { role: 'selectAll', label: labels.selectAll },
    ],
  })
  template.push({
    label: labels.view,
    submenu: [
      ...(dev
        ? ([
            { role: 'reload', label: labels.reload },
            { role: 'toggleDevTools', label: labels.devTools },
            { type: 'separator' },
          ] satisfies MenuItemConstructorOptions[])
        : []),
      { role: 'resetZoom', label: labels.resetZoom },
      { role: 'zoomIn', label: labels.zoomIn },
      { role: 'zoomOut', label: labels.zoomOut },
      { type: 'separator' },
      { role: 'togglefullscreen', label: labels.fullScreen },
    ],
  })
  // Mac only: it is the standard menu there (Minimize, Zoom, Bring All to Front). On Windows
  // it only repeated Minimize and Close from the title bar.
  if (mac) {
    template.push({
      label: labels.window,
      submenu: [
        { role: 'minimize', label: labels.minimize },
        { role: 'zoom', label: labels.zoom },
        { type: 'separator' },
        { role: 'front', label: labels.front },
      ],
    })
  }
  return template
}

/** Labels from the UI language (`menu.*` keys). */
export function appMenuLabels(t: (key: string) => string): AppMenuLabels {
  return {
    app: t('app.name'),
    file: t('menu.file'),
    edit: t('menu.edit'),
    view: t('menu.view'),
    window: t('menu.window'),
    settings: t('menu.settings'),
    about: t('menu.about'),
    hide: t('menu.hide'),
    hideOthers: t('menu.hideOthers'),
    showAll: t('menu.showAll'),
    quit: t('tray.quit'),
    close: t('menu.close'),
    undo: t('menu.undo'),
    redo: t('menu.redo'),
    cut: t('menu.cut'),
    copy: t('menu.copy'),
    paste: t('menu.paste'),
    selectAll: t('menu.selectAll'),
    reload: t('menu.reload'),
    devTools: t('menu.devTools'),
    resetZoom: t('menu.resetZoom'),
    zoomIn: t('menu.zoomIn'),
    zoomOut: t('menu.zoomOut'),
    fullScreen: t('menu.fullScreen'),
    minimize: t('menu.minimize'),
    zoom: t('menu.zoom'),
    front: t('menu.front'),
  }
}
