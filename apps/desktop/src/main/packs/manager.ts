// Optional pack manager (A-07, D-019): lists the packs, downloads them only when the user
// asks (progress, pause/resume, cancel), checks every file's SHA-256 and installs atomically
// into app-data/packs/<id>/<version>/. Updates are installed only on request, and replace the
// old version once the new one is complete. No timer, no background check, no telemetry.
import { chmod, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  PACK_IDS,
  type PackErrorCode,
  type PackId,
  type PackInfo,
  type PackState,
  type PacksStatus,
} from '../../shared/packs.ts'
import { renameWithRetry } from '../storage/atomic.ts'
import { DISK_MARGIN_BYTES, KNOWN_PACKS } from './config.ts'
import { DownloadError, downloadFile, partialSize, type FetchLike } from './download.ts'
import {
  ManifestError,
  parseManifest,
  platformSize,
  type ManifestPack,
  type PackPlatform,
  type PacksManifest,
} from './manifest.ts'
import { readRegistry, writeRegistry, type InstalledPack, type InstalledPacks } from './registry.ts'

export class PackError extends Error {
  constructor(
    readonly code: PackErrorCode,
    readonly requiredBytes: number | null = null,
  ) {
    super(code)
    this.name = 'PackError'
  }
}

export interface PackLogger {
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
}

export interface PackManagerOptions {
  /** app-data/packs */
  dir: string
  /** app-data/packs.json */
  registryFile: string
  manifestUrl: string
  /** `win32-x64`, `darwin-arm64`... */
  platform: string
  fetch: FetchLike
  /** Free bytes on the volume holding `dir`. */
  freeBytes(dir: string): Promise<number>
  log: PackLogger
  /** Mac/Linux set the executable bit; Windows does not need it. */
  chmodExecutables?: boolean
  /** Progress events at most this often (ms). */
  progressIntervalMs?: number
}

/** An installed transcription pack, ready to run. */
export interface TranscriberPack {
  id: PackId
  version: string
  /** The pack folder. */
  dir: string
  /** Absolute path of the program. */
  entry: string
  model: { name: string; path: string }
}

interface ActiveDownload {
  controller: AbortController
  done: Promise<void>
  state: 'downloading' | 'verifying'
  received: number
  total: number
}

interface Failure {
  error: PackErrorCode
  requiredBytes: number | null
}

const STAGING_DIR = '.downloads'

export class PackManager {
  private manifest: PacksManifest | null = null
  private catalog: PacksStatus['catalog'] = 'idle'
  private catalogError: PackErrorCode | null = null
  private catalogLoad: Promise<void> | null = null
  private installed: Promise<InstalledPacks> | null = null
  private readonly active = new Map<PackId, ActiveDownload>()
  /** From the Install click until installed, paused, cancelled or failed. */
  private readonly installs = new Map<PackId, Promise<void>>()
  private readonly failures = new Map<PackId, Failure>()
  /** Partial downloads on disk (paused, or left by a closed app). */
  private readonly partial = new Map<PackId, { received: number; total: number }>()
  private readonly busy = new Map<PackId, number>()
  private readonly listeners = new Set<(status: PacksStatus) => void>()
  private lastProgressEmit = 0

  constructor(private readonly options: PackManagerOptions) {}

  onChange(listener: (status: PacksStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** What is installed and, once the list loaded, what can be downloaded. Never fetches. */
  async status(): Promise<PacksStatus> {
    const installed = await this.loadInstalled()
    return {
      packs: KNOWN_PACKS.map((known) => this.info(known.id, installed)),
      catalog: this.catalog,
      catalogError: this.catalogError,
    }
  }

  /** Fetches packs-manifest.json (user action: Settings → Packs, or Transcribe). */
  async refresh(): Promise<PacksStatus> {
    this.catalogLoad ??= this.loadCatalog().finally(() => {
      this.catalogLoad = null
    })
    await this.catalogLoad
    return this.status()
  }

  /**
   * Downloads and installs a pack (or its update, or resumes a paused download). Resolves when
   * it is installed, paused or cancelled; failures are reported in the status, not thrown.
   */
  install(id: PackId): Promise<void> {
    assertPackId(id)
    const running = this.installs.get(id)
    if (running) return running
    const install = this.startInstall(id).finally(() => this.installs.delete(id))
    this.installs.set(id, install)
    return install
  }

  private async startInstall(id: PackId): Promise<void> {
    this.failures.delete(id)
    if (!this.manifest) await this.refresh()
    if (!this.manifest) return this.fail(id, this.catalogError ?? 'offline')
    const pack = this.manifest.packs.find((p) => p.id === id)
    if (!pack) return this.fail(id, 'unknown_pack')
    const platform = pack.platforms[this.options.platform]
    if (!platform) return this.fail(id, 'unsupported_platform')
    const installed = await this.loadInstalled()
    if (installed[id]?.version === pack.version) return this.emit()

    const staging = this.stagingDir(id, pack.version)
    const total = platformSize(platform)
    const onDisk = await this.bytesOnDisk(staging, platform)
    const required = total - onDisk + DISK_MARGIN_BYTES
    const free = await this.options.freeBytes(this.options.dir).catch(() => Infinity)
    if (free < required) return this.fail(id, 'disk_space', required)

    const controller = new AbortController()
    const download: ActiveDownload = {
      controller,
      state: 'downloading',
      received: 0,
      total,
      done: Promise.resolve(),
    }
    download.done = this.run(id, pack, platform, staging, download).finally(() => {
      if (this.active.get(id) === download) this.active.delete(id)
      this.emit()
    })
    this.active.set(id, download)
    this.partial.delete(id)
    this.options.log.info('packs.download.started', { id, version: pack.version, total })
    this.emit()
    return download.done
  }

  /** Stops the download and keeps what arrived; Install resumes it. */
  pause(id: PackId): void {
    assertPackId(id)
    this.active.get(id)?.controller.abort(new PackAbort('paused'))
  }

  /** Stops the download and deletes what arrived. */
  async cancel(id: PackId): Promise<void> {
    assertPackId(id)
    const running = this.active.get(id)
    if (running) {
      running.controller.abort(new PackAbort('cancelled'))
      await running.done
      return
    }
    await this.removeStaging(id).catch(() => {})
    this.failures.delete(id)
    this.emit()
  }

  /** Deletes the pack's files (transcripts already made stay in the projects). */
  async remove(id: PackId): Promise<void> {
    assertPackId(id)
    if (this.isBusy(id)) throw new PackError('pack_busy')
    if (this.active.has(id)) await this.cancel(id)
    const installed = await this.loadInstalled()
    if (installed[id]) {
      const next = { ...installed }
      delete next[id]
      await writeRegistry(this.options.registryFile, next)
      this.installed = Promise.resolve(next)
    }
    await rm(join(this.options.dir, id), { recursive: true, force: true }).catch((error) =>
      this.options.log.warn('packs.remove.files_left', { id, error }),
    )
    await this.removeStaging(id)
    this.failures.delete(id)
    this.options.log.info('packs.removed', { id })
    this.emit()
  }

  /** The transcription pack to use: the preferred one if installed, else Accurate, else Light. */
  async transcriber(preferred?: PackId): Promise<TranscriberPack | null> {
    const installed = await this.loadInstalled()
    const order: PackId[] = [
      ...(preferred ? [preferred] : []),
      'transcribe-accurate',
      'transcribe-light',
    ]
    for (const id of order) {
      const pack = installed[id]
      if (!pack) continue
      const dir = this.packDir(id, pack.version)
      const entry = join(dir, ...pack.entry.split('/'))
      const model = join(dir, ...pack.model.path.split('/'))
      if (!(await exists(entry)) || !(await exists(model))) {
        this.options.log.warn('packs.files_missing', { id })
        continue
      }
      return {
        id,
        version: pack.version,
        dir,
        entry,
        model: { name: pack.model.name, path: model },
      }
    }
    return null
  }

  /** A transcription is using this pack: Remove waits (`pack_busy`). Returns the release. */
  retain(id: PackId): () => void {
    this.busy.set(id, (this.busy.get(id) ?? 0) + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const count = (this.busy.get(id) ?? 1) - 1
      if (count <= 0) this.busy.delete(id)
      else this.busy.set(id, count)
    }
  }

  isBusy(id: PackId): boolean {
    return (this.busy.get(id) ?? 0) > 0
  }

  private async run(
    id: PackId,
    pack: ManifestPack,
    platform: PackPlatform,
    staging: string,
    download: ActiveDownload,
  ): Promise<void> {
    const { signal } = download.controller
    try {
      for (const file of platform.files) {
        await downloadFile({
          url: file.url,
          dest: join(staging, ...file.path.split('/')),
          size: file.size,
          sha256: file.sha256,
          fetch: this.options.fetch,
          signal,
          onBytes: (bytes) => {
            download.received += bytes
            this.emitProgress()
          },
        })
      }
      download.state = 'verifying'
      this.emit()
      if (this.options.chmodExecutables) {
        for (const file of platform.files) {
          if (file.executable || file.path === platform.entry) {
            await chmod(join(staging, ...file.path.split('/')), 0o755)
          }
        }
      }
      signal.throwIfAborted()
      const target = this.packDir(id, pack.version)
      await rm(target, { recursive: true, force: true })
      await mkdir(join(this.options.dir, id), { recursive: true })
      await renameWithRetry(staging, target)
      const installed = await this.loadInstalled()
      const entry: InstalledPack = {
        version: pack.version,
        installedAt: new Date().toISOString(),
        entry: platform.entry,
        model: pack.model,
        files: platform.files.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
      }
      const next = { ...installed, [id]: entry }
      await writeRegistry(this.options.registryFile, next)
      this.installed = Promise.resolve(next)
      await this.removeOtherVersions(id, pack.version)
      this.options.log.info('packs.installed', { id, version: pack.version })
    } catch (error) {
      const reason = signal.aborted ? signal.reason : undefined
      if (reason instanceof PackAbort) {
        if (reason.kind === 'cancelled') {
          await rm(staging, { recursive: true, force: true }).catch(() => {})
        } else {
          this.partial.set(id, { received: download.received, total: download.total })
        }
        this.options.log.info(`packs.download.${reason.kind}`, { id })
        return
      }
      const code: PackErrorCode =
        error instanceof DownloadError
          ? error.code
          : error instanceof PackError
            ? error.code
            : 'install_failed'
      this.options.log.warn('packs.download.failed', { id, code, error })
      if (code === 'offline') {
        this.partial.set(id, { received: download.received, total: download.total })
      }
      this.failures.set(id, { error: code, requiredBytes: null })
    }
  }

  private async loadCatalog(): Promise<void> {
    this.catalog = 'loading'
    this.catalogError = null
    this.emit()
    try {
      const response = await this.options.fetch(this.options.manifestUrl, {})
      if (!response.ok) throw new PackError('download_failed')
      this.manifest = parseManifest(await response.json(), this.options.manifestUrl)
      this.catalog = 'ready'
      await this.findPartialDownloads()
    } catch (error) {
      this.catalog = 'error'
      this.catalogError =
        error instanceof PackError
          ? error.code
          : error instanceof ManifestError || error instanceof SyntaxError
            ? 'manifest_invalid'
            : 'offline'
      this.options.log.warn('packs.manifest.failed', { code: this.catalogError, error })
    }
    this.emit()
  }

  /** A download a closed app left half done shows as paused, ready to resume. */
  private async findPartialDownloads(): Promise<void> {
    for (const pack of this.manifest?.packs ?? []) {
      if (!isPackId(pack.id) || this.active.has(pack.id)) continue
      const platform = pack.platforms[this.options.platform]
      if (!platform) continue
      const staging = this.stagingDir(pack.id, pack.version)
      if (!(await exists(staging))) continue
      const received = await this.bytesOnDisk(staging, platform)
      if (received > 0) this.partial.set(pack.id, { received, total: platformSize(platform) })
    }
  }

  private info(id: PackId, installed: InstalledPacks): PackInfo {
    const known = KNOWN_PACKS.find((pack) => pack.id === id)!
    const pack = this.manifest?.packs.find((p) => p.id === id)
    const platform = pack?.platforms[this.options.platform]
    const installedVersion = installed[id]?.version ?? null
    const availableVersion = pack && platform ? pack.version : null
    const active = this.active.get(id)
    const failure = this.failures.get(id)
    const partial = this.partial.get(id)
    const unsupported = this.catalog === 'ready' && !platform && !installedVersion
    let state: PackState = installedVersion ? 'installed' : 'not_installed'
    if (active) state = active.state
    else if (failure) state = 'failed'
    else if (partial) state = 'paused'
    const progress = active
      ? { receivedBytes: active.received, totalBytes: active.total }
      : partial
        ? { receivedBytes: partial.received, totalBytes: partial.total }
        : null
    return {
      id,
      kind: known.kind,
      quality: known.quality,
      sizeBytes: platform ? platformSize(platform) : known.approxBytes,
      sizeExact: platform !== undefined,
      installedVersion,
      availableVersion,
      updateAvailable:
        installedVersion !== null &&
        availableVersion !== null &&
        installedVersion !== availableVersion,
      state,
      progress,
      error: failure?.error ?? (unsupported ? 'unsupported_platform' : null),
      requiredBytes: failure?.requiredBytes ?? null,
    }
  }

  private fail(id: PackId, error: PackErrorCode, requiredBytes: number | null = null): void {
    this.failures.set(id, { error, requiredBytes })
    this.options.log.warn('packs.install.refused', { id, error })
    this.emit()
  }

  private emitProgress(): void {
    const now = Date.now()
    if (now - this.lastProgressEmit < (this.options.progressIntervalMs ?? 250)) return
    this.lastProgressEmit = now
    this.emit()
  }

  private emit(): void {
    void this.status().then(
      (status) => {
        for (const listener of this.listeners) {
          try {
            listener(status)
          } catch {
            // a window that went away must not break the others
          }
        }
      },
      () => {},
    )
  }

  private loadInstalled(): Promise<InstalledPacks> {
    this.installed ??= readRegistry(this.options.registryFile)
    return this.installed
  }

  private packDir(id: PackId, version: string): string {
    return join(this.options.dir, id, version)
  }

  private stagingDir(id: PackId, version: string): string {
    return join(this.options.dir, STAGING_DIR, `${id}-${version}`)
  }

  private async bytesOnDisk(staging: string, platform: PackPlatform): Promise<number> {
    let sum = 0
    for (const file of platform.files) {
      sum += Math.min(file.size, await partialSize(join(staging, ...file.path.split('/'))))
    }
    return sum
  }

  private async removeStaging(id: PackId): Promise<void> {
    const root = join(this.options.dir, STAGING_DIR)
    const names = await readdir(root).catch(() => [] as string[])
    for (const name of names) {
      if (name.startsWith(`${id}-`)) await rm(join(root, name), { recursive: true, force: true })
    }
    this.partial.delete(id)
  }

  /** After an update; a version still running (Windows keeps the .exe locked) stays for now. */
  private async removeOtherVersions(id: PackId, keep: string): Promise<void> {
    const versions = await readdir(join(this.options.dir, id)).catch(() => [] as string[])
    for (const version of versions) {
      if (version === keep) continue
      await rm(join(this.options.dir, id, version), { recursive: true, force: true }).catch(
        (error: unknown) => this.options.log.warn('packs.old_version_left', { id, error }),
      )
    }
  }
}

class PackAbort extends Error {
  constructor(readonly kind: 'paused' | 'cancelled') {
    super(kind)
    this.name = 'PackAbort'
  }
}

export function isPackId(value: unknown): value is PackId {
  return typeof value === 'string' && (PACK_IDS as readonly string[]).includes(value)
}

function assertPackId(value: unknown): asserts value is PackId {
  if (!isPackId(value)) throw new PackError('unknown_pack')
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
