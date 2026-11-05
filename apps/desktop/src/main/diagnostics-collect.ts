// Gathers what "Copy diagnostics" shows (F-17). Runs only when the user opens the dialog.
import { app } from 'electron'
import { resolveHelperPath } from './capture/helper-path.ts'
import { buildDiagnostics } from './diagnostics.ts'
import { redactFolders } from './log/index.ts'
import { listPermissions } from './permissions.ts'
import { getExportDir } from './preferences.ts'
import { getServices } from './services.ts'

const LOG_LINES = 200

const OS_NAMES: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
}

interface GpuDevice {
  vendorId?: number
  deviceId?: number
  active?: boolean
  driverVendor?: string
  driverVersion?: string
}

const hex = (value: number | undefined) =>
  value === undefined ? '?' : `0x${value.toString(16).padStart(4, '0')}`

/** One line per GPU (ids and driver only), plus the video encode feature status. */
async function gpuLines(): Promise<string[]> {
  const lines: string[] = []
  try {
    const info = (await app.getGPUInfo('basic')) as { gpuDevice?: GpuDevice[] }
    for (const device of info.gpuDevice ?? []) {
      const driver = [device.driverVendor, device.driverVersion].filter(Boolean).join(' ')
      lines.push(
        `vendor ${hex(device.vendorId)} device ${hex(device.deviceId)}` +
          (device.active ? ' (active)' : '') +
          (driver ? ` · driver ${driver}` : ''),
      )
    }
  } catch {
    // Not available (e.g. GPU process crashed): the line says unknown.
  }
  try {
    const features = app.getGPUFeatureStatus()
    lines.push(
      `features: video_encode ${features.video_encode}, video_decode ${features.video_decode}`,
    )
  } catch {
    // Same as above.
  }
  return lines
}

/**
 * Hides the folders the user chose outside the home folder (projects, exports) and app-data,
 * besides the home folder itself (L9). For the diagnostics text and the issue link.
 */
export async function redactUserFolders(text: string): Promise<string> {
  const exportDir = await getExportDir().catch(() => null)
  return redactFolders(text, [
    [getServices().projectsDir, '<projects>'],
    ...(exportDir ? [[exportDir, '<exports>'] as const] : []),
    [app.getPath('userData'), '<app-data>'],
  ])
}

export async function collectDiagnostics(hardwareH264: boolean | null): Promise<string> {
  const { log } = getServices()
  const helper = resolveHelperPath({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  })
  const text = buildDiagnostics({
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    os: OS_NAMES[process.platform] ?? process.platform,
    osVersion: process.getSystemVersion(),
    arch: process.arch,
    gpu: await gpuLines(),
    permissions: listPermissions(),
    hardwareH264,
    helperPresent: helper !== null,
    // The same Logger (and so the same file) that every main-process line goes through.
    logLines: await log.tail(LOG_LINES),
    logFile: log.file,
  })
  return redactUserFolders(text)
}
