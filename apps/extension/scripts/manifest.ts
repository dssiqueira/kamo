// The extension's manifest.json and _locales/, generated at build time so the version comes
// from package.json and every text Chrome shows comes from packages/i18n (rule 14).
import { LOCALES, type Locale, type Messages } from '@kamo/i18n'
import { TOOLBAR_ICON } from '../src/background/toolbar-frames.ts'

/** Built entry points the manifest points to (see vite.config.ts). */
export const SERVICE_WORKER = 'service-worker.js'
export const POPUP = 'popup.html'

/**
 * Permissions of the extension so far (docs/integrations.md lists the full set; `identity` arrives
 * with the cloud login in step 17). `scripting` + `activeTab` draw the countdown over the tab the
 * user clicked on and listen to its mouse (E-02); no host permission. `downloads` saves exports (E-04).
 * `alarms` wakes the service worker about once a minute so the toolbar Kamo blinks or glances.
 */
export const PERMISSIONS = [
  'tabCapture',
  'offscreen',
  'storage',
  'activeTab',
  'scripting',
  'alarms',
  'downloads',
]

/**
 * Asked for only when the user opts in (welcome page or the editor's notice): keeps capturing
 * clicks after the recorded tab moves to another site, which activeTab does not cover (E-02).
 * Never a permanent host permission (E-06).
 */
export const OPTIONAL_HOST_PERMISSIONS = ['<all_urls>']

/** Chrome's `_locales` folder names use an underscore: pt_BR, zh_CN. */
export function chromeLocale(locale: Locale): string {
  return locale.replace('-', '_')
}

/** Chrome wants 1 to 4 dot-separated integers; prereleases go to `version_name`. */
export function chromeVersion(version: string): string {
  const core = version.split(/[-+]/)[0] ?? ''
  if (!/^\d+(\.\d+){0,3}$/.test(core)) throw new Error(`invalid version: ${version}`)
  return core
}

export function buildManifest(version: string): Record<string, unknown> {
  const icons = {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  }
  return {
    manifest_version: 3,
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    version: chromeVersion(version),
    version_name: version,
    default_locale: 'en',
    // 116: getMediaStreamId from the service worker, consumed by an offscreen document.
    // 129: Intl.DurationFormat, which @kamo/i18n uses for durations (rule 14).
    minimum_chrome_version: '129',
    icons,
    action: {
      default_popup: POPUP,
      default_title: '__MSG_actionTitle__',
      // Kamo's head on its own, which reads at 16px; it blinks now and then (icon.ts). The
      // store and chrome://extensions keep the framed app icon above.
      default_icon: TOOLBAR_ICON,
    },
    background: { service_worker: SERVICE_WORKER, type: 'module' },
    permissions: PERMISSIONS,
    optional_host_permissions: OPTIONAL_HOST_PERMISSIONS,
    commands: {
      'stop-recording': {
        suggested_key: { default: 'Ctrl+Shift+2', mac: 'Command+Shift+2' },
        description: '__MSG_commandStop__',
      },
    },
  }
}

/** i18n key (packages/i18n) of each `__MSG_name__` the manifest uses. */
export const MANIFEST_MESSAGES = {
  extName: 'extension.name',
  extDescription: 'extension.description',
  actionTitle: 'extension.actionTitle',
  commandStop: 'extension.commandStop',
} as const

function lookup(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages
  for (const part of key.split('.')) {
    if (typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** `_locales/<lang>/messages.json` for one language, English filling any gap. */
export function chromeMessages(
  messages: Messages,
  fallback: Messages,
): Record<string, { message: string }> {
  return Object.fromEntries(
    Object.entries(MANIFEST_MESSAGES).map(([name, key]) => {
      const message = lookup(messages, key) ?? lookup(fallback, key)
      if (message === undefined) throw new Error(`missing i18n key ${key}`)
      return [name, { message }]
    }),
  )
}

export { LOCALES }
