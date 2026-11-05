// Gathers what "Copy diagnostics" shows in the extension (F-17). Runs only when the user opens
// the dialog; reads nothing about tabs or pages, only the browser, the extension and its errors.
import {
  browserName,
  buildExtensionDiagnostics,
  buildIssueUrl,
  isIssueUrl,
} from '../shared/diagnostics.ts'
import { formatEntries, readErrors, recordError } from '../shared/error-log.ts'

/** The optional host permission (scripts/manifest.ts OPTIONAL_HOST_PERMISSIONS, E-02). */
const OPTIONAL_SITES = ['<all_urls>']

const ENCODER_PROBE: VideoEncoderConfig = {
  codec: 'avc1.640028',
  width: 1920,
  height: 1080,
  framerate: 30,
  bitrate: 8_000_000,
  hardwareAcceleration: 'prefer-hardware',
}

interface UserAgentData {
  brands?: { brand: string; version: string }[]
  getHighEntropyValues(hints: string[]): Promise<{
    fullVersionList?: { brand: string; version: string }[]
    platformVersion?: string
  }>
}

async function probeHardwareH264(): Promise<boolean | null> {
  if (typeof VideoEncoder === 'undefined') return null
  try {
    return (await VideoEncoder.isConfigSupported(ENCODER_PROBE)).supported === true
  } catch {
    return null
  }
}

async function permissionStatus(name: 'microphone' | 'camera'): Promise<string> {
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName })
    return status.state === 'prompt' ? 'not asked' : status.state
  } catch {
    return 'unknown'
  }
}

async function sitesStatus(): Promise<string> {
  try {
    return (await chrome.permissions.contains({ origins: OPTIONAL_SITES }))
      ? 'granted'
      : 'not granted'
  } catch {
    return 'unknown'
  }
}

export async function collectDiagnostics(): Promise<string> {
  const manifest = chrome.runtime.getManifest()
  const uaData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData
  const [highEntropy, platform, storage, microphone, camera, sites, hardwareH264, errors] =
    await Promise.all([
      uaData?.getHighEntropyValues(['fullVersionList', 'platformVersion']).catch(() => undefined),
      chrome.runtime.getPlatformInfo().catch(() => undefined),
      navigator.storage?.estimate().catch(() => undefined),
      permissionStatus('microphone'),
      permissionStatus('camera'),
      sitesStatus(),
      probeHardwareH264(),
      readErrors(),
    ])
  return buildExtensionDiagnostics({
    extensionVersion: manifest.version_name ?? manifest.version,
    browser: browserName(highEntropy?.fullVersionList ?? uaData?.brands, navigator.userAgent),
    os: platform?.os ?? 'unknown',
    osVersion: highEntropy?.platformVersion ?? '',
    arch: platform?.arch ?? 'unknown',
    uiLanguage: chrome.i18n.getUILanguage(),
    languages: navigator.languages,
    storage:
      storage?.usage !== undefined && storage.quota !== undefined
        ? { usage: storage.usage, quota: storage.quota }
        : null,
    permissions: [
      { kind: 'microphone', status: microphone },
      { kind: 'camera', status: camera },
      { kind: 'sites', status: sites },
    ],
    hardwareH264,
    errorLines: formatEntries(errors),
  })
}

/** Copy: null on success, a code on failure (the dialog says which). */
export async function copyDiagnostics(text: string): Promise<string | null> {
  try {
    await navigator.clipboard.writeText(text)
    return null
  } catch (error) {
    void recordError('diagnostics.copy_failed', 'projects', error)
    return 'copy_failed'
  }
}

/** Opens GitHub's new issue form in a tab, with the text in the body. Nothing is posted. */
export async function openIssue(text: string): Promise<string | null> {
  const url = buildIssueUrl(text)
  if (!isIssueUrl(url)) return 'invalid_url'
  try {
    await chrome.tabs.create({ url })
    return null
  } catch (error) {
    void recordError('diagnostics.open_issue_failed', 'projects', error)
    return 'open_failed'
  }
}
