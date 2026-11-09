// "Transcribe" without a transcription pack (flows.md §5, A-05): explains the optional pack,
// lets the user pick Light or Accurate as two cards, downloads only on the user's click (the
// chosen card grows into the progress, with pause/resume and cancel) and, once it is in, asks
// the one-time automatic-mode question, then follows the first transcript to "All set". Never
// opens on its own. The models come from Hugging Face (D-042); a failed download is one calm
// notice inside the chosen card, with Try again. A build without whisper-cli says so once.
import { formatFileSize, formatNumber, resolveLocale } from '@kamo/i18n'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DecorPiece } from '../decor/Decor.tsx'
import { useLocale, useT, type Translate } from '../i18n.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { useSpringTo } from '../motion/useSpring.ts'
import { LockIcon } from '../primitives/icons.tsx'
import { Dialog, PrimaryButton, SecondaryButton, type DialogHero } from '../settings/parts.tsx'
import { PackArt, ParcelArt, WaveToTextArt } from './illustrations.tsx'
import {
  addRateSample,
  defaultChoice,
  estimateSecondsLeft,
  finishStage,
  offerStage,
  recommendedPack,
  transcriptionPacks,
  type RateSample,
} from './offer-state.ts'
import {
  PackMeters,
  PackNotice,
  ProgressBar,
  SizeChip,
  packErrorText,
  packHint,
  packName,
} from './PackList.tsx'
import { AutoTranscribeQuestion } from './PacksSection.tsx'
import type { CardTranscriptState, PackActions, PackView, PackViewId, PacksView } from './types.ts'

export interface TranscribeOfferProps extends PackActions {
  open: boolean
  packs: PacksView
  /** Absent: never asked. */
  autoTranscribe: boolean | undefined
  onAutoTranscribeChange(value: boolean): void
  /** A pack is installed (and the question answered): transcribe now. */
  onReady(): void
  /**
   * The first transcript, once `onReady` ran: the offer follows it to "All set". Absent: the
   * host closes the offer on `onReady`.
   */
  transcript?: CardTranscriptState
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

  let title = t('transcription.offer.title')
  let hero: DialogHero
  let body: ReactNode = null
  let footer: ReactNode = null

  if (view.stage === 'ready') {
    const finish = finishStage(asking, props.transcript)
    const name = packName(t, view.pack)
    switch (finish) {
      case 'asking':
        title = t('transcription.offer.installedTitle')
        hero = {
          align: 'center',
          art: <Mascot pose="head-happy" size={88} backdrop />,
          subtitle: t('transcription.offer.installedBody', { name }),
        }
        body = <AutoTranscribeQuestion centered onAnswer={props.onAutoTranscribeChange} />
        break
      case 'transcribing': {
        const progress = props.transcript?.state === 'running' ? props.transcript.progress : 0
        title = t('transcription.offer.transcribing.title')
        hero = {
          align: 'center',
          art: <WaveToTextArt size={64} moving />,
          subtitle: t('transcription.offer.transcribing.body'),
        }
        body = (
          <div
            className="mx-auto flex w-full max-w-[440px] flex-col items-center gap-sm"
            role="status"
          >
            <BigPercent value={progress} />
            <ProgressBar
              value={progress}
              size="lg"
              label={t('transcription.offer.transcribing.title')}
            />
          </div>
        )
        footer = <SecondaryButton onClick={props.onClose}>{t('common.close')}</SecondaryButton>
        break
      }
      case 'done':
        title = t('transcription.offer.done.title')
        hero = {
          align: 'center',
          art: (
            <span className="flex items-end">
              <Mascot pose="head-happy" size={96} backdrop />
              <DecorPiece art="flower" height={44} className="-ms-[18px]" />
            </span>
          ),
          subtitle: t('transcription.offer.done.body'),
        }
        footer = (
          <PrimaryButton onClick={props.onClose}>
            {t('transcription.offer.done.button')}
          </PrimaryButton>
        )
        break
      case 'failed':
      case 'no_audio':
        title = t(
          finish === 'failed'
            ? 'transcription.offer.failedTitle'
            : 'transcription.offer.noAudioTitle',
        )
        hero = {
          align: 'center',
          art: <Mascot pose="head-look-side" size={88} backdrop />,
          subtitle: t(
            finish === 'failed' ? 'transcription.status.failed' : 'transcription.offer.noAudioBody',
          ),
        }
        footer = <SecondaryButton onClick={props.onClose}>{t('common.close')}</SecondaryButton>
        break
    }
  } else if (view.stage === 'unavailable') {
    title = t('packs.program.title')
    hero = {
      align: 'center',
      art: (
        <span className="flex items-end" data-testid="packs-program-missing">
          <Mascot pose="head-look-side" size={92} backdrop />
          <ParcelArt size={72} className="-ms-[14px]" />
        </span>
      ),
      subtitle: <span role="status">{t('packs.program.body')}</span>,
    }
    footer = <SecondaryButton onClick={props.onClose}>{t('common.close')}</SecondaryButton>
  } else {
    const working = view.stage === 'working' ? view.pack : null
    hero = {
      art: <Mascot pose={working ? 'head-look-up' : 'head-look'} size={64} backdrop />,
      subtitle: t('transcription.offer.subtitle'),
    }
    body = (
      <PackStage
        packs={list}
        choice={choice}
        recommended={recommended}
        working={working}
        actions={props}
        onChange={setChoice}
        onCancel={(id) => {
          setStarted(null)
          props.onCancel(id)
        }}
      />
    )
    footer = (
      <>
        <p className="flex min-w-0 flex-1 basis-[220px] items-center gap-xs text-label text-on-surface-muted">
          <span className="flex shrink-0">
            <LockIcon size={14} />
          </span>
          <span className="min-w-0">{t('transcription.offer.private')}</span>
        </p>
        {working ? (
          <SecondaryButton onClick={props.onClose}>{t('common.close')}</SecondaryButton>
        ) : (
          <span className="flex flex-wrap justify-end gap-sm">
            <SecondaryButton onClick={props.onClose}>
              {t('transcription.offer.notNow')}
            </SecondaryButton>
            <PrimaryButton
              disabled={view.stage !== 'choosing' || !selected}
              onClick={() => {
                setStarted(choice)
                props.onInstall(choice)
              }}
            >
              {t('transcription.offer.download')}
            </PrimaryButton>
          </span>
        )}
      </>
    )
  }

  return (
    <Dialog
      open={props.open}
      title={title}
      hero={hero}
      closeLabel={t('common.close')}
      onClose={props.onClose}
      footer={footer}
    >
      {/* Without a body (empty states), the marker takes no room: display none, no gap. */}
      <div
        className={body ? 'flex flex-col gap-md' : 'hidden'}
        data-testid="transcribe-offer"
        data-stage={view.stage}
      >
        {body}
      </div>
    </Dialog>
  )
}

/** 0..1 as a big serif percentage that counts with the spring, like the bar under it. */
function BigPercent({ value }: { value: number }) {
  const locale = resolveLocale([useLocale()])
  const shown = Math.min(1, Math.max(0, useSpringTo(Math.min(1, Math.max(0, value)))))
  return (
    <span aria-hidden className="font-serif text-[56px] leading-none tabular-nums">
      {formatNumber(locale, Math.floor(shown * 100) / 100, { style: 'percent' })}
    </span>
  )
}

/**
 * Light and Accurate side by side. Choosing: a native radio group (arrow keys, one tab stop).
 * Once a download starts, the chosen card grows over the other one, which fades out, and
 * becomes the progress (spring, rule 10; reduced motion jumps).
 */
function PackStage({
  packs,
  choice,
  recommended,
  working,
  actions,
  onChange,
  onCancel,
}: {
  packs: PackView[]
  choice: PackViewId
  recommended: PackViewId
  working: PackView | null
  actions: PackActions
  onChange(id: PackViewId): void
  onCancel(id: PackViewId): void
}) {
  const t = useT()
  const grow = Math.min(1, Math.max(0, useSpringTo(working ? 1 : 0)))
  const focus = working?.id ?? choice
  const cards = packs.filter((pack) => pack.id === focus || grow < 0.995)
  return (
    <fieldset className="flex min-w-0 flex-col gap-sm">
      <legend className="sr-only">{t('transcription.offer.choose')}</legend>
      <div className="flex items-stretch">
        {cards.map((pack, i) => {
          const leaving = working !== null && pack.id !== working.id
          const fade = leaving ? grow : 0
          return (
            <div
              key={pack.id}
              className={`flex min-w-0 ${leaving ? 'overflow-hidden' : ''}`}
              style={{
                flex: `${leaving ? 1 - grow : 1} 1 0`,
                opacity: leaving ? Math.max(0, 1 - fade * 2) : 1,
                // The gap between the cards closes with the leaving one.
                marginInlineStart: i > 0 ? 12 * (1 - fade) : 0,
              }}
            >
              {working && pack.id === working.id ? (
                <ProgressCard pack={working} actions={actions} onCancel={onCancel} />
              ) : (
                <PackCard
                  pack={pack}
                  checked={pack.id === choice}
                  recommended={pack.id === recommended}
                  frozen={working !== null}
                  onChange={onChange}
                />
              )}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

const CARD = 'flex w-full min-w-[272px] flex-col gap-sm rounded-lg border-2 p-md'
const CARD_SELECTED =
  'border-tertiary bg-tertiary-container/35 shadow-[0_0_0_4px_rgb(62_140_132/0.14)]'

function PackCard({
  pack,
  checked,
  recommended,
  frozen,
  onChange,
}: {
  pack: PackView
  checked: boolean
  recommended: boolean
  /** Leaving (a download started): shown, not choosable. */
  frozen: boolean
  onChange(id: PackViewId): void
}) {
  const t = useT()
  const enabled = !frozen
  const nameId = `transcribe-offer-${pack.id}-name`
  const detailsId = `transcribe-offer-${pack.id}-details`
  return (
    <label
      data-testid={`transcribe-offer-${pack.id}`}
      className={`${CARD} transition-[background-color,border-color,box-shadow] duration-[120ms] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-tertiary ${
        checked
          ? `cursor-pointer ${CARD_SELECTED}`
          : 'cursor-pointer border-border hover:border-tertiary/50 hover:bg-surface-raised/60'
      }`}
    >
      <input
        type="radio"
        name="transcription-pack"
        value={pack.id}
        checked={checked}
        disabled={!enabled}
        aria-labelledby={nameId}
        aria-describedby={detailsId}
        onChange={() => onChange(pack.id)}
        className="sr-only"
      />
      <span className="flex items-start justify-between gap-sm">
        <PackArt quality={pack.quality} size={60} />
        <RadioDot checked={checked} />
      </span>
      <span className="flex flex-wrap items-center gap-x-sm gap-y-xs">
        <span id={nameId} className="font-serif text-[30px] leading-none">
          {t(pack.quality === 'accurate' ? 'packs.accurate.short' : 'packs.light.short')}
        </span>
        {recommended && (
          <span className="rounded-full bg-tertiary-container px-[10px] py-[2px] text-label text-on-surface">
            {t('transcription.offer.recommended')}
          </span>
        )}
      </span>
      <span id={detailsId} className="flex flex-1 flex-col gap-sm">
        <span className="min-h-[3em] text-body text-on-surface-muted">{packHint(t, pack)}</span>
        <PackMeters pack={pack} />
        <span className="mt-auto flex flex-wrap items-center gap-sm pt-xs text-label text-on-surface-muted">
          <SizeChip pack={pack} />
          {pack.state === 'paused' && pack.progress && (
            <span className="tabular-nums">
              {t('packs.status.paused', {
                progress: pack.progress.receivedBytes / pack.progress.totalBytes,
              })}
            </span>
          )}
        </span>
      </span>
    </label>
  )
}

/** The radio's look (the native input stays, visually hidden, for keyboard and readers). */
function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-[120ms] ${
        checked ? 'border-tertiary bg-tertiary' : 'border-border bg-surface'
      }`}
    >
      {checked && <span className="block size-[8px] rounded-full bg-surface" />}
    </span>
  )
}

function fraction(pack: PackView): number {
  const { progress } = pack
  return progress && progress.totalBytes > 0 ? progress.receivedBytes / progress.totalBytes : 0
}

/** Seconds left at the rate seen lately, or null while it cannot tell. */
function useSecondsLeft(pack: PackView): number | null {
  const samples = useRef<RateSample[]>([])
  const [left, setLeft] = useState<number | null>(null)
  const received = pack.progress?.receivedBytes ?? 0
  const total = pack.progress?.totalBytes ?? 0
  useEffect(() => {
    if (pack.state !== 'downloading' || total <= 0) {
      // Paused or done: the next stretch starts a fresh estimate.
      samples.current = []
      setLeft(null)
      return
    }
    samples.current = addRateSample(samples.current, { at: performance.now(), bytes: received })
    setLeft(estimateSecondsLeft(samples.current, total))
  }, [pack.state, received, total])
  return left
}

/** "about 3 minutes left" / "less than a minute left", the duration through Intl. */
function timeLeftText(t: Translate, locale: string, seconds: number): string {
  if (seconds < 60) return t('transcription.offer.timeLeftSoon')
  const minutes = Math.ceil(seconds / 60)
  const time =
    minutes < 90
      ? formatNumber(resolveLocale([locale]), minutes, {
          style: 'unit',
          unit: 'minute',
          unitDisplay: 'long',
        })
      : formatNumber(resolveLocale([locale]), Math.round(minutes / 60), {
          style: 'unit',
          unit: 'hour',
          unitDisplay: 'long',
        })
  return t('transcription.offer.timeLeft', { time })
}

/** The chosen pack on its way: big percentage, the bar, bytes and time left, Pause / Cancel. */
function ProgressCard({
  pack,
  actions,
  onCancel,
}: {
  pack: PackView
  actions: PackActions
  onCancel(id: PackViewId): void
}) {
  const t = useT()
  const locale = useLocale()
  const fileLocale = resolveLocale([locale])
  const name = packName(t, pack)
  const size = (bytes: number) => formatFileSize(fileLocale, bytes)
  const secondsLeft = useSecondsLeft(pack)
  const error = pack.state === 'downloading' || pack.state === 'verifying' ? null : pack.error

  const status = error
    ? t('transcription.offer.stopped')
    : pack.state === 'downloading'
      ? t('transcription.offer.downloading')
      : pack.state === 'paused'
        ? t('transcription.offer.paused')
        : pack.state === 'verifying'
          ? t('packs.status.verifying')
          : t('packs.status.starting')

  const details = [
    pack.progress
      ? t('packs.progressBytes', {
          received: size(pack.progress.receivedBytes),
          total: size(pack.progress.totalBytes),
        })
      : null,
    pack.state === 'downloading' && secondsLeft !== null
      ? timeLeftText(t, locale, secondsLeft)
      : null,
  ].filter((part): part is string => part !== null)

  const buttons = (() => {
    switch (pack.state) {
      case 'downloading':
        return (
          <>
            <SecondaryButton raised onClick={() => actions.onPause(pack.id)}>
              {t('packs.pause')}
            </SecondaryButton>
            <SecondaryButton raised onClick={() => onCancel(pack.id)}>
              {t('common.cancel')}
            </SecondaryButton>
          </>
        )
      case 'paused':
      case 'failed':
        return (
          <>
            <SecondaryButton raised onClick={() => actions.onInstall(pack.id)}>
              {t(pack.state === 'paused' ? 'packs.resume' : 'common.retry')}
            </SecondaryButton>
            <SecondaryButton raised onClick={() => onCancel(pack.id)}>
              {t('common.cancel')}
            </SecondaryButton>
          </>
        )
      case 'not_installed':
        return error ? (
          <SecondaryButton raised onClick={() => onCancel(pack.id)}>
            {t('common.cancel')}
          </SecondaryButton>
        ) : null
      default:
        return null
    }
  })()

  return (
    <div
      className={`${CARD} ${CARD_SELECTED}`}
      data-testid="transcribe-offer-progress"
      data-state={pack.state}
    >
      <div className="flex items-center gap-md">
        <PackArt quality={pack.quality} size={60} />
        <div className="flex min-w-0 flex-1 flex-col gap-xs">
          <p className="font-serif text-[30px] leading-none">
            {t(pack.quality === 'accurate' ? 'packs.accurate.short' : 'packs.light.short')}
          </p>
          <p className="text-label text-on-surface-muted">{name}</p>
        </div>
        <WaveToTextArt size={40} moving={pack.state === 'downloading'} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-md gap-y-xs pt-xs">
        {error && !pack.progress ? <span /> : <BigPercent value={fraction(pack)} />}
        <p
          role={error ? undefined : 'status'}
          className="min-w-0 pb-[6px] text-body font-medium text-on-surface-muted"
        >
          {status}
        </p>
      </div>
      <ProgressBar
        value={fraction(pack)}
        size="lg"
        onTint
        label={t('packs.progressLabel', { name })}
      />
      {error && (
        <PackNotice
          code={error}
          text={packErrorText(t, error, pack.requiredBytes ? size(pack.requiredBytes) : undefined)}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="min-w-0 text-label tabular-nums text-on-surface-muted">
          {details.join(' · ')}
        </p>
        {buttons && <div className="ms-auto flex flex-wrap gap-sm">{buttons}</div>}
      </div>
    </div>
  )
}
