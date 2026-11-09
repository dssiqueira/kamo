// Optional pack manager (A-07, D-019, D-042): a pack is one whisper model. It is downloaded
// from Hugging Face only when the user asks (progress, pause/resume, cancel), checked against
// its pinned SHA-256 and installed atomically into app-data/packs/<id>/<version>/. The program
// that runs it (whisper-cli) ships inside the app and is found by `program`. No timer, no
// background check, no telemetry.
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  PACK_IDS,
  type PackErrorCode,
  type PackId,
  type PackInfo,
  type PackState,
  type PacksStatus,
} from '../../shared/packs.ts'
import { renameWithRetry } from '../storage/atomic.ts'
import { DISK_MARGIN_BYTES, KNOWN_PACKS, type KnownPack } from './config.ts'
import { DownloadError, downloadFile, partialSize, sha256File, type FetchLike } from './download.ts'
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
  /** The models and where they come from (config.ts; tests and dev point them elsewhere). */
  packs?: readonly KnownPack[]
  fetch: FetchLike
  /** Free bytes on the volume holding `dir`. */
  freeBytes(dir: string): Promise<number>
  /** Whether the computer has a connection (Electron's `net.isOnline`): offline vs. unreachable. */
  isOnline?(): boolean
  /** Absolute path of the bundled whisper-cli, or null when this build has none. */
  program(): string | null
  log: PackLogger
  /** Progress events at most this often (ms). */
  progressIntervalMs?: number
  /** A download that receives nothing for this long stops (download.ts). */
  stallMs?: number
}

/** An installed model, checked and ready to transcribe with. */
export interface TranscriberPack {
  id: PackId
  version: string
  /** The pack folder. */
  dir: string
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
  private readonly known: readonly KnownPack[]
  private installed: Promise<InstalledPacks> | null = null
  private scanned: Promise<void> | null = null
  private readonly active = new Map<PackId, ActiveDownload>()
  /** From the Download click until installed, paused, cancelled or failed. */
  private readonly installs = new Map<PackId, Promise<void>>()
  private readonly failures = new Map<PackId, Failure>()
  /** Partial downloads on disk (paused, or left by a closed app). */
  private readonly partial = new Map<PackId, { received: number; total: number }>()
  private readonly busy = new Map<PackId, number>()
  private readonly listeners = new Set<(status: PacksStatus) => void>()
  private lastProgressEmit = 0
  /**
   * Models whose SHA-256 was checked, by path, with the size and mtime they had then: a model
   * (150–500MB) is hashed again only when either changes.
   */
  private readonly verifiedModels = new Map<
    string,
    { size: number; mtimeMs: number; sha256: string }
  >()

  constructor(private readonly options: PackManagerOptions) {
    this.known = options.packs ?? KNOWN_PACKS
  }

  onChange(listener: (status: PacksStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** What is installed, on its way or paused, and whether the program is there. Never fetches. */
  async status(): Promise<PacksStatus> {
    const installed = await this.loadInstalled()
    await this.scanPartials()
    return {
      packs: this.known.map((known) => this.info(known, installed)),
      program: this.options.program() ? 'ready' : 'missing',
    }
  }

  /**
   * Downloads and installs a model (or the newer one this app pins, or resumes a paused
   * download). Resolves when it is installed, paused or cancelled; failures are reported in
   * the status, not thrown.
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
    const pack = this.knownPack(id)
    const installed = await this.loadInstalled()
    if (this.isCurrent(pack, installed[id])) return this.emit()

    const staging = this.stagingDir(id, pack.version)
    const file = join(staging, pack.source.file)
    const total = pack.source.size
    const onDisk = Math.min(total, await partialSize(file))
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
    download.done = this.run(pack, staging, download).finally(() => {
      if (this.active.get(id) === download) this.active.delete(id)
      this.emit()
    })
    this.active.set(id, download)
    this.partial.delete(id)
    this.options.log.info('packs.download.started', { id, version: pack.version, total })
    this.emit()
    return download.done
  }

  /** Stops the download and keeps what arrived; Download again resumes it. */
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

  /** Deletes the model (transcripts already made stay in the projects). */
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

  /** The bundled whisper-cli, or null when this build has none (D-042). */
  program(): string | null {
    return this.options.program()
  }

  /** The model to transcribe with: the preferred one if installed, else Accurate, else Light. */
  async transcriber(preferred?: PackId): Promise<TranscriberPack | null> {
    const installed = await this.loadInstalled()
    const order: PackId[] = [
      ...(preferred ? [preferred] : []),
      'transcribe-accurate',
      'transcribe-light',
    ]
    for (const id of order) {
      const pack = installed[id]
      if (!pack || !isPackId(id)) continue
      const dir = this.packDir(id, pack.version)
      const path = join(dir, pack.model.file)
      if (!(await this.modelIntact(path, pack))) {
        this.options.log.warn('packs.model_changed', { id })
        continue
      }
      return { id, version: pack.version, dir, model: { name: pack.model.name, path } }
    }
    return null
  }

  /** A transcription is using this model: Remove waits (`pack_busy`). Returns the release. */
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

  private async run(pack: KnownPack, staging: string, download: ActiveDownload): Promise<void> {
    const { id } = pack
    const { signal } = download.controller
    try {
      await downloadFile({
        url: pack.source.url,
        dest: join(staging, pack.source.file),
        size: pack.source.size,
        sha256: pack.source.sha256,
        fetch: this.options.fetch,
        signal,
        ...(this.options.stallMs !== undefined ? { stallMs: this.options.stallMs } : {}),
        onBytes: (bytes) => {
          download.received += bytes
          this.emitProgress()
        },
      })
      download.state = 'verifying'
      this.emit()
      signal.throwIfAborted()
      const target = this.packDir(id, pack.version)
      await rm(target, { recursive: true, force: true })
      await mkdir(join(this.options.dir, id), { recursive: true })
      await renameWithRetry(staging, target)
      const installed = await this.loadInstalled()
      const entry: InstalledPack = {
        version: pack.version,
        installedAt: new Date().toISOString(),
        model: {
          name: pack.modelName,
          file: pack.source.file,
          size: pack.source.size,
          sha256: pack.source.sha256,
        },
      }
      const next = { ...installed, [id]: entry }
      await writeRegistry(this.options.registryFile, next)
      this.installed = Promise.resolve(next)
      // The model was just checked while downloading: the first run need not hash it again.
      const path = join(target, pack.source.file)
      const info = await stat(path)
      this.verifiedModels.set(path, {
        size: info.size,
        mtimeMs: info.mtimeMs,
        sha256: pack.source.sha256,
      })
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
      const code = this.errorCode(error)
      this.options.log.warn('packs.download.failed', { id, code, error })
      // What is still on disk is fine (a damaged file was deleted): "Try again" resumes there.
      const kept = Math.min(
        download.total,
        await partialSize(join(staging, pack.source.file)).catch(() => 0),
      )
      if (kept > 0) this.partial.set(id, { received: kept, total: download.total })
      const required =
        code === 'disk_space' ? download.total - download.received + DISK_MARGIN_BYTES : null
      this.failures.set(id, { error: code, requiredBytes: required })
    }
  }

  private errorCode(error: unknown): PackErrorCode {
    if (error instanceof DownloadError) {
      switch (error.code) {
        case 'unreachable':
          return (this.options.isOnline?.() ?? true) ? 'source_unreachable' : 'offline'
        case 'checksum_mismatch':
          return 'checksum_mismatch'
        case 'disk_space':
          return 'disk_space'
        case 'download_failed':
          return 'download_failed'
      }
    }
    if (error instanceof PackError) return error.code
    return 'install_failed'
  }

  /** A download a closed app left half done shows as paused, ready to resume (once). */
  private scanPartials(): Promise<void> {
    this.scanned ??= (async () => {
      for (const pack of this.known) {
        if (this.active.has(pack.id)) continue
        const file = join(this.stagingDir(pack.id, pack.version), pack.source.file)
        const received = Math.min(pack.source.size, await partialSize(file))
        if (received > 0) this.partial.set(pack.id, { received, total: pack.source.size })
      }
    })().catch(() => {})
    return this.scanned
  }

  private info(known: KnownPack, installed: InstalledPacks): PackInfo {
    const { id } = known
    const mine = installed[id]
    const installedVersion = mine?.version ?? null
    const active = this.active.get(id)
    const failure = this.failures.get(id)
    const partial = this.partial.get(id)
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
      quality: known.quality,
      sizeBytes: known.source.size,
      installedVersion,
      updateAvailable: mine !== undefined && !this.isCurrent(known, mine),
      state,
      progress,
      error: failure?.error ?? null,
      requiredBytes: failure?.requiredBytes ?? null,
    }
  }

  /** The installed model is the very file this app pins. */
  private isCurrent(known: KnownPack, pack: InstalledPack | undefined): boolean {
    return (
      pack !== undefined &&
      pack.version === known.version &&
      pack.model.sha256 === known.source.sha256
    )
  }

  private knownPack(id: PackId): KnownPack {
    const pack = this.known.find((p) => p.id === id)
    if (!pack) throw new PackError('unknown_pack')
    return pack
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

  /**
   * True when the model still has its recorded size and SHA-256, so a file swapped into the
   * pack folder is never fed to whisper. Hashed again only when its size or mtime changed.
   */
  private async modelIntact(path: string, pack: InstalledPack): Promise<boolean> {
    try {
      const info = await stat(path)
      if (!info.isFile() || info.size !== pack.model.size) return false
      const known = this.verifiedModels.get(path)
      if (
        known?.size === info.size &&
        known.mtimeMs === info.mtimeMs &&
        known.sha256 === pack.model.sha256
      ) {
        return true
      }
      if ((await sha256File(path)) !== pack.model.sha256) {
        this.verifiedModels.delete(path)
        return false
      }
      this.verifiedModels.set(path, {
        size: info.size,
        mtimeMs: info.mtimeMs,
        sha256: pack.model.sha256,
      })
      return true
    } catch {
      return false
    }
  }

  /** `packs/<id>/<version>`, provably inside `packs/<id>` (the version is validated too). */
  private packDir(id: PackId, version: string): string {
    return inside(join(this.options.dir, id), version)
  }

  private stagingDir(id: PackId, version: string): string {
    return inside(join(this.options.dir, STAGING_DIR), `${id}-${version}`)
  }

  private async removeStaging(id: PackId): Promise<void> {
    const root = join(this.options.dir, STAGING_DIR)
    const names = await readdir(root).catch(() => [] as string[])
    for (const name of names) {
      if (name.startsWith(`${id}-`)) await rm(join(root, name), { recursive: true, force: true })
    }
    this.partial.delete(id)
  }

  /** After an update; a version still in use stays for now. */
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

/**
 * `parent/name` for a single plain folder name: anything that would resolve to `parent`
 * itself or outside it (`.`, `..`, separators, an absolute path) throws.
 */
function inside(parent: string, name: string): string {
  const target = join(parent, name)
  const rel = relative(resolve(parent), resolve(target))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || /[\\/]/.test(rel)) {
    throw new PackError('install_failed')
  }
  return target
}
