// "Transcribe" without a transcription pack (flows.md §5, A-05): explains the optional pack,
// lets the user pick Light or Accurate as two cards, downloads only on the user's click (with
// progress, pause/resume and cancel in the chosen card) and, once it is in, asks the one-time
// automatic-mode question before transcribing. Never opens on its own. When the list of packs
// cannot be loaded it shows that once, with one "Try again", and nothing per pack.
import { formatFileSize, resolveLocale } from '@kamo/i18n'
import { useEffect, useRef, useState } from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { LockIcon } from '../primitives/icons.tsx'
import { Dialog, PrimaryButton, SecondaryButton } from '../settings/parts.tsx'
import {
  defaultChoice,
  offerStage,
  recommendedPack,
  selectable,
  transcriptionPacks,
} from './offer-state.ts'
import {
  CatalogNotice,
  PackSize,
  ProgressBar,
  packErrorText,
  packHint,
  packName,
} from './PackList.tsx'
import { AutoTranscribeQuestion } from './PacksSection.tsx'
import type { PackActions, PackView, PackViewId, PacksView } from './types.ts'

export interface TranscribeOfferProps extends PackActions {
  open: boolean
  packs: PacksView
  /** Absent: never asked. */
  autoTranscribe: boolean | undefined
  onAutoTranscribeChange(value: boolean): void
  /** A pack is installed (and the question answered): transcribe now. */
  onReady(): void
  onClose(): void
}

export function TranscribeOffer(props: TranscribeOfferProps) {
  const t = useT()
  const locale = useLocale()
  const [choice, setChoice] = useState<PackViewId>(() => defaultChoice(props.packs, locale))
  const [started, setStarted] = useState<PackViewId | null>(null)
  const readied = useRef(false)
  const latestPacks = useRef(props.packs)
  latestPacks.current = props.packs
  const { open, onReady } = props
  const view = offerStage(props.packs, started)
  const asking = view.stage === 'ready' && props.autoTranscribe === undefined

  useEffect(() => {
    if (!open) {
      setStarted(null)
      readied.current = false
      return
    }
    // Each time it opens: a download left paused, else the recommended pack.
    setChoice(defaultChoice(latestPacks.current, locale))
  }, [open, locale])

  // Installed (and nothing left to ask): hand over to the transcription.
  useEffect(() => {
    if (!open || view.stage !== 'ready' || asking || readied.current) return
    readied.current = true
    onReady()
  }, [open, view.stage, asking, onReady])

  const list = transcriptionPacks(props.packs)
  const selected = list.find((pack) => pack.id === choice)
  const recommended = recommendedPack(locale)

  const footer = (() => {
    if (view.stage === 'ready') return null
    if (view.stage !== 'choosing') {
      return <SecondaryButton onClick={props.onClose}>{t('common.close')}</SecondaryButton>
    }
    return (
      <>
        <SecondaryButton onClick={props.onClose}>{t('transcription.offer.notNow')}</SecondaryButton>
        <PrimaryButton
          disabled={view.loading || !selected || !selectable(selected)}
          onClick={() => {
            setStarted(choice)
            props.onInstall(choice)
          }}
        >
          {t('transcription.offer.download')}
        </PrimaryButton>
      </>
    )
  })()

  return (
    <Dialog
      open={props.open}
      title={t('transcription.offer.title')}
      closeLabel={t('common.close')}
      onClose={props.onClose}
      footer={footer}
    >
      <div className="flex flex-col gap-md" data-testid="transcribe-offer" data-stage={view.stage}>
        {view.stage === 'ready' ? (
          asking && (
            <>
              <div className="flex items-center gap-md" role="status">
                <Mascot pose="head-happy" size={56} className="shrink-0" />
                <div className="flex min-w-0 flex-col gap-xs">
                  <p className="text-title">{t('transcription.offer.installedTitle')}</p>
                  <p className="text-body text-on-surface-muted">
                    {t('transcription.offer.installedBody', { name: packName(t, view.pack) })}
                  </p>
                </div>
              </div>
              <AutoTranscribeQuestion onAnswer={props.onAutoTranscribeChange} />
            </>
          )
        ) : view.stage === 'unavailable' ? (
          <CatalogNotice
            packs={props.packs}
            mascot
            body={(code) =>
              code === 'catalog_unpublished' ? t('transcription.offer.unpublished') : null
            }
            onRetry={() => {
              // Back to the choice: the retry loads the list, it does not start a download.
              setStarted(null)
              props.onRetryCatalog()
            }}
          />
        ) : (
          <>
            <p className="text-body text-on-surface-muted">{t('transcription.offer.body')}</p>
            {view.stage === 'working' ? (
              <ProgressCard
                pack={view.pack}
                actions={props}
                onCancel={() => {
                  setStarted(null)
                  props.onCancel(view.pack.id)
                }}
              />
            ) : (
              <PackChoice
                packs={list}
                choice={choice}
                recommended={recommended}
                onChange={setChoice}
                loading={view.loading}
              />
            )}
          </>
        )}
        {view.stage !== 'ready' && (
          <p className="flex items-center gap-xs text-label text-on-surface-muted">
            <LockIcon size={14} />
            {t('packs.local')}
          </p>
        )}
      </div>
    </Dialog>
  )
}

/** Light and Accurate as two cards: a native radio group (arrow keys, one tab stop). */
function PackChoice({
  packs,
  choice,
  recommended,
  loading,
  onChange,
}: {
  packs: PackView[]
  choice: PackViewId
  recommended: PackViewId
  loading: boolean
  onChange(id: PackViewId): void
}) {
  const t = useT()
  return (
    <fieldset className="flex flex-col gap-sm" aria-busy={loading}>
      <legend className="sr-only">{t('transcription.offer.choose')}</legend>
      <div className="grid grid-cols-2 gap-sm">
        {packs.map((pack) => {
          const checked = pack.id === choice
          const enabled = selectable(pack)
          return (
            <label
              key={pack.id}
              data-testid={`transcribe-offer-${pack.id}`}
              className={`flex flex-col gap-xs rounded-md border-2 p-md transition-colors duration-[120ms] ${
                !enabled
                  ? 'cursor-not-allowed border-border opacity-60'
                  : checked
                    ? 'cursor-pointer border-tertiary bg-tertiary-container/40'
                    : 'cursor-pointer border-border hover:bg-surface-raised'
              }`}
            >
              <span className="flex flex-wrap items-center gap-x-sm gap-y-xs">
                <input
                  type="radio"
                  name="transcription-pack"
                  value={pack.id}
                  checked={checked}
                  disabled={!enabled}
                  onChange={() => onChange(pack.id)}
                  className={`size-[16px] shrink-0 accent-tertiary ${FOCUS_RING}`}
                />
                <span className="text-title">
                  {t(pack.quality === 'accurate' ? 'packs.accurate.short' : 'packs.light.short')}
                </span>
                {pack.id === recommended && enabled && (
                  <span className="ms-auto rounded-full bg-tertiary-container px-[8px] py-[2px] text-label text-on-surface">
                    {t('transcription.offer.recommended')}
                  </span>
                )}
              </span>
              <span className="text-body text-on-surface-muted">{packHint(t, pack)}</span>
              <span className="mt-auto pt-xs text-label tabular-nums text-on-surface-muted">
                {enabled ? (
                  <>
                    <PackSize pack={pack} />
                    {pack.state === 'paused' && pack.progress && (
                      <>
                        {' · '}
                        {t('packs.status.paused', {
                          progress: pack.progress.receivedBytes / pack.progress.totalBytes,
                        })}
                      </>
                    )}
                  </>
                ) : (
                  t('packs.errors.unsupportedPlatform')
                )}
              </span>
            </label>
          )
        })}
      </div>
      {loading && (
        <p className="text-label text-on-surface-muted" role="status">
          {t('packs.catalog.loading')}
        </p>
      )}
    </fieldset>
  )
}

function fraction(pack: PackView): number {
  const { progress } = pack
  return progress && progress.totalBytes > 0 ? progress.receivedBytes / progress.totalBytes : 0
}

/** The chosen pack on its way: progress, what it is doing, and Pause / Resume / Cancel. */
function ProgressCard({
  pack,
  actions,
  onCancel,
}: {
  pack: PackView
  actions: PackActions
  onCancel(): void
}) {
  const t = useT()
  const fileLocale = resolveLocale([useLocale()])
  const name = packName(t, pack)
  const size = (bytes: number) => formatFileSize(fileLocale, bytes)
  const error = pack.state === 'downloading' || pack.state === 'verifying' ? null : pack.error

  const status = error
    ? packErrorText(t, error, pack.requiredBytes ? size(pack.requiredBytes) : undefined, pack.kind)
    : pack.state === 'downloading'
      ? t('packs.status.downloading', { progress: fraction(pack) })
      : pack.state === 'paused'
        ? t('packs.status.paused', { progress: fraction(pack) })
        : pack.state === 'verifying'
          ? t('packs.status.verifying')
          : t('packs.status.starting')

  const buttons = (() => {
    switch (pack.state) {
      case 'downloading':
        return (
          <>
            <SecondaryButton onClick={() => actions.onPause(pack.id)}>
              {t('packs.pause')}
            </SecondaryButton>
            <SecondaryButton onClick={onCancel}>{t('common.cancel')}</SecondaryButton>
          </>
        )
      case 'paused':
      case 'failed':
        return (
          <>
            <SecondaryButton onClick={() => actions.onInstall(pack.id)}>
              {t(pack.state === 'paused' ? 'packs.resume' : 'common.retry')}
            </SecondaryButton>
            <SecondaryButton onClick={onCancel}>{t('common.cancel')}</SecondaryButton>
          </>
        )
      case 'not_installed':
        return error ? (
          <SecondaryButton onClick={onCancel}>{t('common.cancel')}</SecondaryButton>
        ) : null
      default:
        return null
    }
  })()

  return (
    <div
      className="flex flex-col gap-sm rounded-md border-2 border-tertiary bg-tertiary-container/40 p-md"
      data-testid="transcribe-offer-progress"
      data-state={pack.state}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-md gap-y-xs">
        <p className="text-title">{name}</p>
        <p className="text-label tabular-nums text-on-surface-muted">
          {pack.progress ? (
            t('packs.progressBytes', {
              received: size(pack.progress.receivedBytes),
              total: size(pack.progress.totalBytes),
            })
          ) : (
            <PackSize pack={pack} />
          )}
        </p>
      </div>
      <ProgressBar value={fraction(pack)} label={t('packs.progressLabel', { name })} />
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p
          role={error ? 'alert' : 'status'}
          className={`min-w-0 flex-1 text-label ${error ? 'text-error' : 'text-on-surface-muted'}`}
        >
          {status}
        </p>
        {buttons && <div className="flex flex-wrap gap-sm">{buttons}</div>}
      </div>
    </div>
  )
}
