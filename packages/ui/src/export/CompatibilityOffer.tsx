// "Download the compatibility package and try again?" (A-07, D-040): shown on the export's
// error screen only when it stopped for lack of a working encoder. Nothing downloads until
// the user clicks; once the pack is installed the export starts again by itself, because
// that is what the button said.
import { formatFileSize, resolveLocale } from '@kamo/i18n'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { packErrorText, ProgressBar } from '../packs/PackList.tsx'
import type { PackView } from '../packs/types.ts'
import { compatibilityReady, type ExportCompatibility } from './useExportRun.ts'

const BUTTON_PRIMARY = `rounded-md bg-primary px-[20px] py-[12px] text-title text-on-primary transition-colors duration-[120ms] hover:bg-[#97CB90] disabled:opacity-50 disabled:hover:bg-primary ${FOCUS_RING}`
const BUTTON_SECONDARY = `rounded-md bg-surface-raised px-md py-[10px] text-title text-on-surface transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`

const noSubscribe = () => () => {}
const noSnapshot = () => null

/** The pack's live state, or null without a compatibility pack (the extension). */
export function useCompatibilityPack(compat: ExportCompatibility | undefined): PackView | null {
  return useSyncExternalStore(
    compat ? compat.subscribe : noSubscribe,
    compat ? compat.getSnapshot : noSnapshot,
  )
}

function fraction(pack: PackView): number {
  const { progress } = pack
  return progress && progress.totalBytes > 0 ? progress.receivedBytes / progress.totalBytes : 0
}

/**
 * "Download and try again": remembers the click and calls `retry` once the pack is installed.
 * Lives in the sheet, not in the offer, because the offer goes away as the pack lands.
 */
export function useCompatibilityRetry(
  compat: ExportCompatibility | undefined,
  pack: PackView | null,
  retry: () => void,
): { download(): void; cancel(): void } {
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    if (!asked || !compatibilityReady(pack)) return
    setAsked(false)
    retry()
  }, [asked, pack, retry])
  return {
    download: () => {
      setAsked(true)
      compat?.install()
    },
    cancel: () => {
      setAsked(false)
      compat?.cancel()
    },
  }
}

export function CompatibilityOffer({
  pack,
  onDownload,
  onCancel,
}: {
  pack: PackView
  /** Download and install, then export again (useCompatibilityRetry). */
  onDownload(): void
  onCancel(): void
}) {
  const t = useT()
  const locale = resolveLocale([useLocale()])
  const busy = pack.state === 'downloading' || pack.state === 'verifying'

  const error = !busy && pack.state !== 'paused' ? pack.error : null
  return (
    <div className="flex flex-col gap-sm" data-testid="export-compat-offer">
      <p className="text-body font-medium">{t('export.compat.question')}</p>
      <p className="text-label text-on-surface-muted">{t('export.compat.body')}</p>
      <p className="text-label text-on-surface-muted" data-testid="export-compat-size">
        {t('export.compat.size', {
          size: pack.sizeExact
            ? formatFileSize(locale, pack.sizeBytes)
            : t('packs.sizeApprox', { size: formatFileSize(locale, pack.sizeBytes) }),
        })}
      </p>
      {(busy || pack.state === 'paused') && pack.progress && (
        <div className="flex flex-col gap-xs">
          <ProgressBar
            value={fraction(pack)}
            label={t('packs.progressLabel', { name: t('packs.compatibility.name') })}
          />
          <p className="text-label text-on-surface-muted" role="status">
            {pack.state === 'verifying'
              ? t('packs.status.verifying')
              : pack.state === 'paused'
                ? t('packs.status.paused', { progress: fraction(pack) })
                : t('packs.status.downloading', { progress: fraction(pack) })}
          </p>
        </div>
      )}
      {error && (
        <p className="text-label text-error" data-testid="export-compat-error">
          {packErrorText(
            t,
            error,
            pack.requiredBytes ? formatFileSize(locale, pack.requiredBytes) : undefined,
            pack.kind,
          )}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-sm">
        {busy ? (
          <button type="button" onClick={onCancel} className={BUTTON_SECONDARY}>
            {t('common.cancel')}
          </button>
        ) : (
          <button
            type="button"
            data-testid="export-compat-download"
            onClick={onDownload}
            className={BUTTON_PRIMARY}
          >
            {t('export.compat.download')}
          </button>
        )}
      </div>
    </div>
  )
}
