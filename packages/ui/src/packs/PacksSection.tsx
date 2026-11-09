// Settings → Optional packs and Settings → Transcription (flows.md §7, A-07, A-05, D-042). The
// models are listed from what the app knows (nothing is fetched to show them); a download
// starts only from a Download click.
import { useLocale, useT } from '../i18n.tsx'
import { LockIcon } from '../primitives/icons.tsx'
import { Switch } from '../primitives/controls.tsx'
import { Row, SecondaryButton, Section } from '../settings/parts.tsx'
import { ParcelArt, WaveToTextArt } from './illustrations.tsx'
import { PackRow, packName } from './PackList.tsx'
import type { PackActions, PackViewId, PacksView, TranscriptionLanguageChoice } from './types.ts'

export const TRANSCRIPTION_LANGUAGE_CHOICES: readonly TranscriptionLanguageChoice[] = [
  'auto',
  'en',
  'pt',
  'es',
  'zh',
  'ja',
  'de',
  'fr',
  'ko',
]

export interface PacksSectionProps extends PackActions {
  packs: PacksView
  /** Absent: never asked; the question shows once a transcription pack is installed. */
  autoTranscribe: boolean | undefined
  onAutoTranscribeChange(value: boolean): void
  language: TranscriptionLanguageChoice
  onLanguageChange(value: TranscriptionLanguageChoice): void
  /** The installed pack that transcribes (when both are installed). */
  activePack: PackViewId | null
  onActivePackChange(id: PackViewId): void
}

/** A language's own name ("Português", "日本語") from Intl, no strings. */
export function languageName(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
  } catch {
    return code
  }
}

const SELECT =
  'min-w-[200px] rounded-md border border-border bg-surface px-[12px] py-[7px] text-body text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary'

export function PacksSection(props: PacksSectionProps) {
  const t = useT()
  const locale = useLocale()
  const installed = props.packs.packs.filter((pack) => pack.installedVersion !== null)
  const programMissing = props.packs.program === 'missing'

  return (
    <>
      <Section id="settings-packs" title={t('packs.title')}>
        <div className="flex flex-col gap-md">
          <div className="flex items-center gap-md rounded-lg bg-tertiary-container/35 p-md">
            <WaveToTextArt size={44} />
            <div className="flex min-w-0 flex-1 flex-col gap-xs">
              <p className="font-serif text-[24px] leading-tight">{t('packs.headline')}</p>
              <p className="text-body text-on-surface-muted">{t('packs.description')}</p>
            </div>
          </div>
          {programMissing && (
            <div
              role="status"
              data-testid="packs-program-missing"
              className="flex items-center gap-md rounded-md border border-dashed border-border p-md"
            >
              <ParcelArt size={52} />
              <div className="flex min-w-0 flex-1 flex-col gap-xs">
                <p className="text-body font-medium">{t('packs.program.title')}</p>
                <p className="text-label text-on-surface-muted">{t('packs.program.body')}</p>
              </div>
            </div>
          )}
          {props.packs.packs.map((pack) => (
            <PackRow key={pack.id} pack={pack} actions={props} programMissing={programMissing} />
          ))}
          <p className="flex items-start gap-xs text-label text-on-surface-muted">
            <span className="flex shrink-0">
              <LockIcon size={14} />
            </span>
            <span className="min-w-0">{t('packs.local')}</span>
          </p>
        </div>
      </Section>

      {installed.length > 0 && (
        <Section id="settings-transcription" title={t('transcription.title')}>
          {props.autoTranscribe === undefined && (
            <AutoTranscribeQuestion onAnswer={props.onAutoTranscribeChange} />
          )}
          <div className="flex flex-col gap-xs">
            <Switch
              label={t('transcription.auto')}
              checked={props.autoTranscribe === true}
              onChange={props.onAutoTranscribeChange}
            />
            <p className="text-label text-on-surface-muted">{t('transcription.autoHint')}</p>
          </div>
          <Row
            label={
              <label htmlFor="settings-transcription-language">{t('transcription.language')}</label>
            }
          >
            <select
              id="settings-transcription-language"
              value={props.language}
              onChange={(event) =>
                props.onLanguageChange(event.target.value as TranscriptionLanguageChoice)
              }
              className={SELECT}
            >
              {TRANSCRIPTION_LANGUAGE_CHOICES.map((code) => (
                <option key={code} value={code}>
                  {code === 'auto' ? t('transcription.languageAuto') : languageName(code, locale)}
                </option>
              ))}
            </select>
          </Row>
          {installed.length > 1 && (
            <Row
              label={<label htmlFor="settings-transcription-pack">{t('transcription.pack')}</label>}
            >
              <select
                id="settings-transcription-pack"
                value={props.activePack ?? installed[0]!.id}
                onChange={(event) => props.onActivePackChange(event.target.value as PackViewId)}
                className={SELECT}
              >
                {installed.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {packName(t, pack)}
                  </option>
                ))}
              </select>
            </Row>
          )}
        </Section>
      )}
    </>
  )
}

/** Asked once, after a transcription pack is installed (A-05). */
export function AutoTranscribeQuestion({
  onAnswer,
  centered = false,
}: {
  onAnswer(auto: boolean): void
  /** In a centered moment (the Transcribe offer): no panel, everything on the axis. */
  centered?: boolean
}) {
  const t = useT()
  return (
    <div
      role="group"
      aria-labelledby="auto-transcribe-question"
      className={
        centered
          ? 'flex flex-col items-center gap-sm border-t border-border pt-lg text-center'
          : 'flex flex-col gap-sm rounded-md bg-surface-raised p-md'
      }
    >
      <p id="auto-transcribe-question" className="text-body font-medium">
        {t('transcription.ask.title')}
      </p>
      <p className="text-label text-on-surface-muted">{t('transcription.ask.body')}</p>
      <div className={`flex flex-wrap gap-sm ${centered ? 'justify-center pt-xs' : ''}`}>
        <SecondaryButton raised={!centered} onClick={() => onAnswer(true)}>
          {t('transcription.ask.yes')}
        </SecondaryButton>
        <SecondaryButton raised={!centered} onClick={() => onAnswer(false)}>
          {t('transcription.ask.no')}
        </SecondaryButton>
      </div>
    </div>
  )
}
