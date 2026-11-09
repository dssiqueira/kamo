// The optional packs (A-07): one row per pack with its size, what it unlocks, its status and
// Download / Pause / Resume / Cancel / Update / Remove. Used by Settings → Packs and by the
// "Transcribe" offer. Remove and Update always ask first.
import { formatFileSize, resolveLocale } from '@kamo/i18n'
import { useState } from 'react'
import { useLocale, useT, type Translate } from '../i18n.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
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
  catalog_unpublished: 'packs.catalog.unpublished',
  catalog_failed: 'packs.catalog.failed',
}

/** Why the list of packs did not load (main's `catalogError`): a calm sentence each. */
const CATALOG_KEYS: Record<string, { title: string; body: string }> = {
  catalog_unpublished: {
    title: 'packs.catalog.titles.unpublished',
    body: 'packs.catalog.unpublished',
  },
  offline: { title: 'packs.catalog.titles.offline', body: 'packs.catalog.offline' },
  manifest_invalid: { title: 'packs.catalog.titles.failed', body: 'packs.errors.manifestInvalid' },
  catalog_failed: { title: 'packs.catalog.titles.failed', body: 'packs.catalog.failed' },
}

export function catalogErrorText(t: Translate, code: string): { title: string; body: string } {
  const keys = CATALOG_KEYS[code] ?? CATALOG_KEYS.catalog_failed!
  return { title: t(keys.title), body: t(keys.body) }
}

export function packErrorText(
  t: Translate,
  code: string,
  size?: string,
  kind: PackView['kind'] = 'transcription',
): string {
  // The compatibility pack is busy while an export uses it, not a transcription.
  if (code === 'pack_busy' && kind === 'compatibility') return t('packs.compatibility.busy')
  return t(ERROR_KEYS[code] ?? 'packs.errors.installFailed', { size: size ?? '' })
}

export function packName(t: Translate, pack: Pick<PackView, 'kind' | 'quality'>): string {
  if (pack.kind === 'compatibility') return t('packs.compatibility.name')
  return t(pack.quality === 'light' ? 'packs.light.name' : 'packs.accurate.name')
}

/** What a pack unlocks, under its name. */
export function packHint(t: Translate, pack: Pick<PackView, 'kind' | 'quality'>): string {
  if (pack.kind === 'compatibility') return t('packs.compatibility.hint')
  return t(pack.quality === 'light' ? 'packs.light.hint' : 'packs.accurate.hint')
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
  catalogUnavailable = false,
}: {
  pack: PackView
  actions: PackActions
  showHint?: boolean
  /** The list of packs failed to load: no Download, and no size it cannot vouch for. */
  catalogUnavailable?: boolean
}) {
  const t = useT()
  const size = useFileSize()
  const [confirm, setConfirm] = useState<'remove' | 'update' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = packName(t, pack)
  const busy = pack.state === 'downloading' || pack.state === 'verifying'
  const shownError = error ?? pack.error
  const unknown = catalogUnavailable && pack.state === 'not_installed' && !pack.sizeExact

  const buttons = (() => {
    switch (pack.state) {
      case 'not_installed':
        return pack.error === 'unsupported_platform' || unknown ? null : (
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
            {showHint && <span className="block">{packHint(t, pack)}</span>}
            <span className="block">
              {!unknown && (
                <>
                  <PackSize pack={pack} />
                  {' · '}
                </>
              )}
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
          {packErrorText(
            t,
            shownError,
            pack.requiredBytes ? size(pack.requiredBytes) : undefined,
            pack.kind,
          )}
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
              ? t(
                  pack.kind === 'compatibility'
                    ? 'packs.compatibility.removeConfirm'
                    : 'packs.removeConfirm',
                  { name },
                )
              : t('packs.updateConfirm', {
                  version: pack.availableVersion ?? '',
                  size: size(pack.sizeBytes),
                })}
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
 * Loading line, or the one notice for a list of packs that did not load (not published yet,
 * offline, unreadable), with its single "Try again". Calm: an unpublished list is not an error.
 */
export function CatalogNotice({
  packs,
  onRetry,
  mascot = false,
  body,
}: {
  packs: PacksView
  onRetry(): void
  /** Kamo looking aside, for the friendly empty state of an offer. */
  mascot?: boolean
  /** Replaces the default sentence (e.g. the transcription offer names its packs). */
  body?: (code: string) => string | null
}) {
  const t = useT()
  if (packs.catalog === 'loading') {
    return <InlineNotice tone="info">{t('packs.catalog.loading')}</InlineNotice>
  }
  if (packs.catalog !== 'error') return null
  const code = packs.catalogError ?? 'offline'
  const text = catalogErrorText(t, code)
  return (
    <div
      role={code === 'catalog_unpublished' ? 'status' : 'alert'}
      data-testid="packs-catalog-error"
      data-code={code}
      className="flex items-center gap-md rounded-md bg-surface-raised p-md"
    >
      {mascot && <Mascot pose="head-look-side" size={64} className="shrink-0" />}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-xs">
        <p className="text-title">{text.title}</p>
        <p className="text-body text-on-surface-muted">{body?.(code) ?? text.body}</p>
        <div className="pt-xs">
          <SecondaryButton raised onClick={onRetry}>
            {t('common.retry')}
          </SecondaryButton>
        </div>
      </div>
    </div>
  )
}
