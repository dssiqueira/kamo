// The optional packs (A-07, D-042): one row per transcription model with its size, what it is
// good for, its status and Download / Pause / Resume / Cancel / Update / Remove. Used by
// Settings → Optional packs; the "Transcribe" offer shares its pieces. Remove and Update always
// ask first.
import { formatFileSize, resolveLocale } from '@kamo/i18n'
import { useState } from 'react'
import { useLocale, useT, type Translate } from '../i18n.tsx'
import { useSpringTo } from '../motion/useSpring.ts'
import { CheckIcon } from '../primitives/icons.tsx'
import { SecondaryButton } from '../settings/parts.tsx'
import { OfflineArt, PackArt } from './illustrations.tsx'
import { METER_MAX, packMeters } from './offer-state.ts'
import type { PackActions, PackView } from './types.ts'

const ERROR_KEYS: Record<string, string> = {
  offline: 'packs.errors.offline',
  source_unreachable: 'packs.errors.sourceUnreachable',
  download_failed: 'packs.errors.downloadFailed',
  checksum_mismatch: 'packs.errors.checksumMismatch',
  disk_space: 'packs.errors.diskSpace',
  pack_busy: 'packs.errors.packBusy',
  install_failed: 'packs.errors.installFailed',
  unknown_pack: 'packs.errors.unknownPack',
}

/** One calm, specific sentence per failure (`size`: the free space `disk_space` needs). */
export function packErrorText(t: Translate, code: string, size?: string): string {
  return t(ERROR_KEYS[code] ?? 'packs.errors.installFailed', { size: size ?? '' })
}

/** Network failures: what arrived is kept, and the art says "connection". */
export function isConnectionError(code: string | null): boolean {
  return code === 'offline' || code === 'source_unreachable'
}

export function packName(t: Translate, pack: Pick<PackView, 'quality'>): string {
  return t(pack.quality === 'light' ? 'packs.light.name' : 'packs.accurate.name')
}

/** What a pack unlocks, under its name. */
export function packHint(t: Translate, pack: Pick<PackView, 'quality'>): string {
  return t(pack.quality === 'light' ? 'packs.light.hint' : 'packs.accurate.hint')
}

function useFileSize() {
  const locale = resolveLocale([useLocale()])
  return (bytes: number) => formatFileSize(locale, bytes)
}

/** "~148 MB": the download size, rounded by Intl. */
export function PackSize({ pack }: { pack: Pick<PackView, 'sizeBytes'> }) {
  const t = useT()
  return <>{t('packs.sizeAbout', { size: useFileSize()(pack.sizeBytes) })}</>
}

function fraction(pack: PackView): number {
  const { progress } = pack
  return progress && progress.totalBytes > 0 ? progress.receivedBytes / progress.totalBytes : 0
}

function statusText(t: Translate, pack: PackView): string {
  switch (pack.state) {
    case 'downloading':
      return t('packs.status.downloading', { progress: fraction(pack) })
    case 'paused':
      return t('packs.status.paused', { progress: fraction(pack) })
    case 'verifying':
      return t('packs.status.verifying')
    case 'failed':
      return t('packs.status.failed')
    case 'installed':
      return pack.updateAvailable ? t('packs.status.update') : t('packs.status.installed')
    case 'not_installed':
      return t('packs.status.notInstalled')
  }
}

/**
 * A download's progress. The fill follows the value with the Kamo spring (rule 10), so the
 * bursts of a download read as one smooth motion; reduced motion jumps straight to it.
 */
export function ProgressBar({
  value,
  label,
  size = 'sm',
  onTint = false,
}: {
  value: number
  label: string
  size?: 'sm' | 'lg'
  /** On a tinted card: a surface-colored track, so it still shows. */
  onTint?: boolean
}) {
  const clamped = Math.min(1, Math.max(0, value))
  const shown = Math.min(1, Math.max(0, useSpringTo(clamped)))
  const percent = Math.round(clamped * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={`w-full overflow-hidden rounded-full ${size === 'lg' ? 'h-[10px]' : 'h-[6px]'} ${
        onTint ? 'bg-surface' : 'bg-surface-raised'
      }`}
    >
      <div
        className="h-full rounded-full bg-tertiary"
        style={{ width: `${shown * 100}%`, minWidth: clamped > 0 ? 6 : 0 }}
      />
    </div>
  )
}

/** A pack's size as a small chip: "~148 MB". */
export function SizeChip({ pack }: { pack: Pick<PackView, 'sizeBytes'> }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-surface-raised px-[10px] py-[3px] text-label tabular-nums text-on-surface-muted">
      <PackSize pack={pack} />
    </span>
  )
}

/** Speed and Accuracy as two short dot scales (transcription packs only). */
export function PackMeters({
  pack,
  compact = false,
}: {
  pack: Pick<PackView, 'quality'>
  compact?: boolean
}) {
  const t = useT()
  const meters = packMeters(pack.quality)
  const rows = [
    { label: t('packs.meters.speed'), value: meters.speed },
    { label: t('packs.meters.accuracy'), value: meters.accuracy },
  ]
  return (
    <span
      className={`grid w-full grid-cols-[auto_auto] items-center justify-start text-label text-on-surface-muted ${
        compact ? 'gap-x-sm gap-y-[2px]' : 'gap-x-md gap-y-xs'
      }`}
    >
      {rows.map((row) => (
        <span key={row.label} className="contents">
          <span>{row.label}</span>
          <span className="flex items-center gap-[3px]">
            {Array.from({ length: METER_MAX }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className={`block h-[6px] rounded-full ${compact ? 'w-[10px]' : 'w-[14px]'} ${
                  i < row.value ? 'bg-tertiary' : 'bg-border'
                }`}
              />
            ))}
            <span className="sr-only">
              {t('packs.meters.value', { value: row.value, max: METER_MAX })}
            </span>
          </span>
        </span>
      ))}
    </span>
  )
}

/** What a pack is doing, as a chip: installed in green, moving in water, the rest quiet. */
function StatusChip({ pack, text }: { pack: PackView; text: string }) {
  const tone =
    pack.state === 'installed'
      ? 'bg-primary-container text-success'
      : pack.state === 'failed'
        ? 'bg-surface-raised text-error'
        : pack.state === 'downloading' || pack.state === 'verifying'
          ? 'bg-tertiary-container text-on-surface'
          : 'bg-surface-raised text-on-surface-muted'
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-xs rounded-full px-[10px] py-[3px] text-label tabular-nums ${tone}`}
    >
      {pack.state === 'installed' && <CheckIcon size={12} />}
      {text}
    </span>
  )
}

export function PackRow({
  pack,
  actions,
  showHint = true,
  programMissing = false,
}: {
  pack: PackView
  actions: PackActions
  showHint?: boolean
  /** This build cannot transcribe: no Download (the section says why, once). */
  programMissing?: boolean
}) {
  const t = useT()
  const size = useFileSize()
  const [confirm, setConfirm] = useState<'remove' | 'update' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = packName(t, pack)
  const busy = pack.state === 'downloading' || pack.state === 'verifying'
  const shownError = error ?? pack.error

  const buttons = (() => {
    switch (pack.state) {
      case 'not_installed':
        return programMissing ? null : (
          <SecondaryButton onClick={() => actions.onInstall(pack.id)}>
            {t('packs.install')}
          </SecondaryButton>
        )
      case 'downloading':
        return (
          <>
            <SecondaryButton onClick={() => actions.onPause(pack.id)}>
              {t('packs.pause')}
            </SecondaryButton>
            <SecondaryButton onClick={() => actions.onCancel(pack.id)}>
              {t('common.cancel')}
            </SecondaryButton>
          </>
        )
      case 'paused':
      case 'failed':
        return (
          <>
            <SecondaryButton onClick={() => actions.onInstall(pack.id)}>
              {t(pack.state === 'paused' ? 'packs.resume' : 'common.retry')}
            </SecondaryButton>
            {pack.progress && (
              <SecondaryButton onClick={() => actions.onCancel(pack.id)}>
                {t('common.cancel')}
              </SecondaryButton>
            )}
          </>
        )
      case 'installed':
        return (
          <>
            {pack.updateAvailable && (
              <SecondaryButton onClick={() => setConfirm('update')}>
                {t('packs.update')}
              </SecondaryButton>
            )}
            <SecondaryButton onClick={() => setConfirm('remove')}>
              {t('packs.remove')}
            </SecondaryButton>
          </>
        )
      case 'verifying':
        return null
    }
  })()

  return (
    <div
      className="flex flex-col gap-sm rounded-md border border-border p-sm"
      data-testid={`pack-row-${pack.id}`}
      data-state={pack.state}
    >
      <div className="flex flex-wrap items-center gap-x-md gap-y-sm">
        <div className="flex min-w-[260px] flex-1 items-center gap-md">
          <span className="flex size-[56px] shrink-0 items-center justify-center rounded-md bg-surface-raised">
            <PackArt quality={pack.quality} size={34} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-xs">
            <div className="flex flex-wrap items-center gap-x-sm gap-y-xs">
              <p className="text-body font-medium">{name}</p>
              <SizeChip pack={pack} />
              <StatusChip pack={pack} text={statusText(t, pack)} />
            </div>
            {showHint && <p className="text-label text-on-surface-muted">{packHint(t, pack)}</p>}
            <PackMeters pack={pack} compact />
          </div>
        </div>
        {buttons && <div className="ms-auto flex flex-wrap items-center gap-sm">{buttons}</div>}
      </div>
      {(busy || pack.state === 'paused') && pack.progress && (
        <ProgressBar value={fraction(pack)} label={t('packs.progressLabel', { name })} />
      )}
      {shownError && pack.state !== 'downloading' && (
        <PackNotice
          code={shownError}
          text={packErrorText(
            t,
            shownError,
            pack.requiredBytes ? size(pack.requiredBytes) : undefined,
          )}
        />
      )}
      {confirm && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-label={confirm === 'remove' ? t('packs.remove') : t('packs.update')}
          className="flex flex-wrap items-center justify-between gap-sm rounded-md bg-surface-raised p-sm"
        >
          <p className="text-label">
            {confirm === 'remove'
              ? t('packs.removeConfirm', { name })
              : t('packs.updateConfirm', { size: size(pack.sizeBytes) })}
          </p>
          <div className="flex gap-sm">
            <SecondaryButton raised onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </SecondaryButton>
            <SecondaryButton
              raised
              onClick={() => {
                setConfirm(null)
                setError(null)
                if (confirm === 'update') actions.onInstall(pack.id)
                else void actions.onRemove(pack.id).then(setError, () => setError('install_failed'))
              }}
            >
              {confirm === 'remove' ? t('packs.remove') : t('packs.update')}
            </SecondaryButton>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A pack's failure as one tidy notice: the connection art for network failures (what arrived
 * is kept), a plain line in the error color otherwise.
 */
export function PackNotice({ code, text }: { code: string; text: string }) {
  const connection = isConnectionError(code)
  return (
    <div
      role="alert"
      data-testid="pack-notice"
      data-code={code}
      className={`flex items-center gap-sm rounded-md px-sm py-xs ${
        connection ? 'bg-tertiary-container/40 text-on-surface' : 'bg-surface-raised text-error'
      }`}
    >
      {connection && <OfflineArt size={32} />}
      <p className="min-w-0 flex-1 text-label">{text}</p>
    </div>
  )
}
