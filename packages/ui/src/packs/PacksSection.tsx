// Settings → Optional packs and Settings → Transcription (flows.md §7, A-07, A-05, D-042). The
// models are listed from what the app knows (nothing is fetched to show them); a download
// starts only from a Download click.
import { useLocale, useT } from '../i18n.tsx'
import { CaptionsIcon, GlobeIcon, LockIcon, SlidersIcon } from '../primitives/icons.tsx'
import {
  SELECT_CLASS,
  SecondaryButton,
  Section,
  SettingCard,
  SwitchCard,
} from '../settings/parts.tsx'
import { CaptionArt } from '../settings/illustrations.tsx'
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

export function PacksSection(props: PacksSectionProps) {
  const t = useT()
  const locale = useLocale()
  const installed = props.packs.packs.filter((pack) => pack.installedVersion !== null)
  const programMissing = props.packs.program === 'missing'

  return (
    <>
      <Section
        id="settings-packs"
        title={t('packs.title')}
        hero={{
          art: <WaveToTextArt size={40} />,
          headline: t('packs.headline'),
          description: t('packs.description'),
        }}
        note={{ icon: <LockIcon size={14} />, text: t('packs.local') }}
      >
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
      </Section>

      {installed.length > 0 && (
        <Section
          id="settings-transcription"
          title={t('transcription.title')}
          hero={{
            art: <CaptionArt size={48} />,
            headline: t('transcription.headline'),
            description: t('transcription.intro'),
          }}
        >
          {props.autoTranscribe === undefined && (
            <AutoTranscribeQuestion onAnswer={props.onAutoTranscribeChange} />
          )}
          <SwitchCard
            icon={<CaptionsIcon size={20} />}
            label={t('transcription.auto')}
            hint={t('transcription.autoHint')}
            checked={props.autoTranscribe === true}
            onChange={props.onAutoTranscribeChange}
          />
          <SettingCard
            icon={<GlobeIcon size={20} />}
            title={
              <label htmlFor="settings-transcription-language">{t('transcription.language')}</label>
            }
            controls={
              <select
                id="settings-transcription-language"
                value={props.language}
                onChange={(event) =>
                  props.onLanguageChange(event.target.value as TranscriptionLanguageChoice)
                }
                className={SELECT_CLASS}
              >
                {TRANSCRIPTION_LANGUAGE_CHOICES.map((code) => (
                  <option key={code} value={code}>
                    {code === 'auto' ? t('transcription.languageAuto') : languageName(code, locale)}
                  </option>
                ))}
              </select>
            }
          />
          {installed.length > 1 && (
            <SettingCard
              icon={<SlidersIcon size={20} />}
              title={<label htmlFor="settings-transcription-pack">{t('transcription.pack')}</label>}
              controls={
                <select
                  id="settings-transcription-pack"
                  value={props.activePack ?? installed[0]!.id}
                  onChange={(event) => props.onActivePackChange(event.target.value as PackViewId)}
                  className={SELECT_CLASS}
                >
                  {installed.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {packName(t, pack)}
                    </option>
                  ))}
                </select>
              }
            />
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
