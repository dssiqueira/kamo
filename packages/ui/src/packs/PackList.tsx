// The optional packs (A-07): one row per pack with its size, what it unlocks, its status and
// Download / Pause / Resume / Cancel / Update / Remove. Used by Settings → Packs and by the
// "Transcribe" offer. Remove and Update always ask first.
import { formatFileSize, resolveLocale } from '@kamo/i18n'
import { useState } from 'react'
import { useLocale, useT, type Translate } from '../i18n.tsx'
import { InlineNotice, Row, SecondaryButton } from '../settings/parts.tsx'
import type { PackActions, PackView, PacksView } from './types.ts'

const ERROR_KEYS: Record<string, string> = {
  offline: 'packs.errors.offline',
  download_failed: 'packs.errors.downloadFailed',
  checksum_mismatch: 'packs.errors.checksumMismatch',
  disk_space: 'packs.errors.diskSpace',
  unsupported_platform: 'packs.errors.unsupportedPlatform',
  manifest_invalid: 'packs.errors.manifestInvalid',
  pack_busy: 'packs.errors.packBusy',
  install_failed: 'packs.errors.installFailed',
  unknown_pack: 'packs.errors.unknownPack',
}

export function packErrorText(t: Translate, code: string, size?: string): string {
  return t(ERROR_KEYS[code] ?? 'packs.errors.installFailed', { size: size ?? '' })
}

export function packName(t: Translate, pack: Pick<PackView, 'quality'>): string {
  return t(pack.quality === 'light' ? 'packs.light.name' : 'packs.accurate.name')
}

function useFileSize() {
  const locale = resolveLocale([useLocale()])
  return (bytes: number) => formatFileSize(locale, bytes)
}

/** "148 MB" or "About 150 MB" before the list loaded. */
export function PackSize({ pack }: { pack: Pick<PackView, 'sizeBytes' | 'sizeExact'> }) {
  const t = useT()
  const size = useFileSize()(pack.sizeBytes)
  return <>{pack.sizeExact ? size : t('packs.sizeApprox', { size })}</>
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
      return pack.updateAvailable
        ? t('packs.status.update', { version: pack.availableVersion ?? '' })
        : t('packs.status.installed', { version: pack.installedVersion ?? '' })
    case 'not_installed':
      return t('packs.status.notInstalled')
  }
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-[6px] w-full overflow-hidden rounded-full bg-surface-raised"
    >
      <div
        className="h-full rounded-full bg-tertiary transition-[width] duration-200"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

export function PackRow({
  pack,
  actions,
  showHint = true,
}: {
  pack: PackView
  actions: PackActions
  showHint?: boolean
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
        return pack.error === 'unsupported_platform' ? null : (
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
    <div className="flex flex-col gap-xs">
      <Row
        label={name}
        description={
          <>
            {showHint && (
              <span className="block">
                {t(pack.quality === 'light' ? 'packs.light.hint' : 'packs.accurate.hint')}
              </span>
            )}
            <span className="block">
              <PackSize pack={pack} />
              {' · '}
              {statusText(t, pack)}
            </span>
          </>
        }
      >
        {buttons}
      </Row>
      {(busy || pack.state === 'paused') && pack.progress && (
        <ProgressBar value={fraction(pack)} label={t('packs.progressLabel', { name })} />
      )}
      {shownError && pack.state !== 'downloading' && (
        <InlineNotice tone={shownError === 'unsupported_platform' ? 'info' : 'error'}>
          {packErrorText(t, shownError, pack.requiredBytes ? size(pack.requiredBytes) : undefined)}
        </InlineNotice>
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
              : t('packs.updateConfirm', {
                  version: pack.availableVersion ?? '',
                  size: size(pack.sizeBytes),
                })}
          </p>
          <div className="flex gap-sm">
            <SecondaryButton onClick={() => setConfirm(null)}>{t('common.cancel')}</SecondaryButton>
            <SecondaryButton
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

/** Loading / error line for the list of packs on GitHub. */
export function CatalogNotice({ packs, onRetry }: { packs: PacksView; onRetry(): void }) {
  const t = useT()
  if (packs.catalog === 'loading') {
    return <InlineNotice tone="info">{t('packs.catalog.loading')}</InlineNotice>
  }
  if (packs.catalog !== 'error') return null
  return (
    <div className="flex flex-wrap items-center gap-sm">
      <InlineNotice tone="error">{packErrorText(t, packs.catalogError ?? 'offline')}</InlineNotice>
      <SecondaryButton onClick={onRetry}>{t('common.retry')}</SecondaryButton>
    </div>
  )
}
