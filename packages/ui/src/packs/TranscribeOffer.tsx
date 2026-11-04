// "Transcribe" without a transcription pack (flows.md §5, A-05): explains the optional pack,
// shows both sizes and the quality choice, downloads only on the user's click and, once it is
// in, asks the one-time automatic-mode question before transcribing. Never opens on its own.
import { useEffect, useRef, useState } from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { Dialog, PrimaryButton, SecondaryButton } from '../settings/parts.tsx'
import { CatalogNotice, PackRow, PackSize, packName } from './PackList.tsx'
import { AutoTranscribeQuestion } from './PacksSection.tsx'
import type { PackActions, PackViewId, PacksView } from './types.ts'

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

/** The Light model is weak in Chinese and Japanese (features.md A-05). */
function recommendsAccurate(locale: string): boolean {
  return /^(zh|ja)\b/i.test(locale)
}

export function TranscribeOffer(props: TranscribeOfferProps) {
  const t = useT()
  const locale = useLocale()
  const [choice, setChoice] = useState<PackViewId>(
    recommendsAccurate(locale) ? 'transcribe-accurate' : 'transcribe-light',
  )
  const [started, setStarted] = useState(false)
  const readied = useRef(false)
  const { open, onReady } = props
  const installed = props.packs.packs.some((pack) => pack.installedVersion !== null)
  const asking = installed && props.autoTranscribe === undefined

  useEffect(() => {
    if (!open) {
      setStarted(false)
      readied.current = false
    }
  }, [open])

  // Installed (and nothing left to ask): hand over to the transcription.
  useEffect(() => {
    if (!open || !installed || asking || readied.current) return
    readied.current = true
    onReady()
  }, [open, installed, asking, onReady])

  const selected = props.packs.packs.find((pack) => pack.id === choice)

  return (
    <Dialog
      open={props.open}
      title={t('transcription.offer.title')}
      closeLabel={t('common.close')}
      onClose={props.onClose}
      footer={
        asking ? null : started ? (
          <SecondaryButton onClick={props.onClose}>{t('common.close')}</SecondaryButton>
        ) : (
          <>
            <SecondaryButton onClick={props.onClose}>
              {t('transcription.offer.notNow')}
            </SecondaryButton>
            <PrimaryButton
              disabled={!selected || selected.error === 'unsupported_platform'}
              onClick={() => {
                setStarted(true)
                props.onInstall(choice)
              }}
            >
              {t('transcription.offer.download')}
            </PrimaryButton>
          </>
        )
      }
    >
      {asking ? (
        <AutoTranscribeQuestion
          onAnswer={(auto) => {
            props.onAutoTranscribeChange(auto)
          }}
        />
      ) : (
        <div className="flex flex-col gap-md">
          <p className="text-body text-on-surface-muted">{t('transcription.offer.body')}</p>
          {started && selected ? (
            <PackRow pack={selected} actions={props} />
          ) : (
            <fieldset className="flex flex-col gap-sm">
              <legend className="sr-only">{t('transcription.offer.choose')}</legend>
              {props.packs.packs.map((pack) => (
                <label
                  key={pack.id}
                  className={`flex cursor-pointer items-start gap-sm rounded-md border p-sm ${
                    choice === pack.id ? 'border-tertiary bg-surface-raised' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="transcription-pack"
                    value={pack.id}
                    checked={choice === pack.id}
                    onChange={() => setChoice(pack.id)}
                    className="mt-[3px] size-[16px] shrink-0 accent-tertiary"
                  />
                  <span className="flex flex-col gap-xs">
                    <span className="text-body font-medium">
                      {packName(t, pack)} · <PackSize pack={pack} />
                    </span>
                    <span className="text-label text-on-surface-muted">
                      {t(pack.quality === 'light' ? 'packs.light.hint' : 'packs.accurate.hint')}
                    </span>
                  </span>
                </label>
              ))}
              {recommendsAccurate(locale) && (
                <p className="text-label text-on-surface-muted">
                  {t('transcription.offer.recommendAccurate')}
                </p>
              )}
            </fieldset>
          )}
          <CatalogNotice packs={props.packs} onRetry={props.onRetryCatalog} />
          <p className="text-label text-on-surface-muted">{t('packs.local')}</p>
        </div>
      )}
    </Dialog>
  )
}
