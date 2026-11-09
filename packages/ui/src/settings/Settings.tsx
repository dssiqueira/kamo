// Settings (flows.md §7, F-15): appearance, language, folders, shortcuts, permissions, updates,
// help (F-17), optional packs and transcription (A-07, A-05), connect to an agent (M-01) and
// about. The Kamo Cloud section arrives with its own step. Every section has the same shape: a
// title, a hero (paper-cut art, serif headline, one line) and its settings as cards.
import { LOCALES, type Locale } from '@kamo/i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocale, useT, type Translate } from '../i18n.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import {
  AppWindowIcon,
  ClipboardIcon,
  DocumentIcon,
  ExportIcon,
  ExternalIcon,
  FolderIcon,
  GlobeIcon,
  MicIcon,
  MonitorIcon,
  MoonIcon,
  MouseIcon,
  RefreshIcon,
  SunIcon,
  ThemeIcon,
  TimerIcon,
  VideoCameraIcon,
} from '../primitives/icons.tsx'
import { TextDialog } from './TextDialog.tsx'
import {
  InlineNotice,
  LinkButton,
  SELECT_CLASS,
  Section,
  SecondaryButton,
  Segmented,
  SettingCard,
  StatusPill,
  SwitchCard,
} from './parts.tsx'
import {
  CountdownArt,
  FolderArt,
  HelpArt,
  KeysArt,
  LanguageArt,
  OpenArt,
  ShieldArt,
  ThemeArt,
  TrayArt,
  UpdateArt,
} from './illustrations.tsx'
import { ShortcutRecorder } from './ShortcutRecorder.tsx'
import { PacksSection, type PacksSectionProps } from '../packs/PacksSection.tsx'
import { AgentSection } from './AgentSection.tsx'
import type { ShortcutPlatform } from './shortcut.ts'
import { openSystemSettingsKey } from './types.ts'
import type {
  ActionResult,
  FolderKind,
  LanguageChoice,
  PermissionItem,
  PermissionKind,
  ThemeChoice,
  UpdateState,
} from './types.ts'

export interface SettingsProps {
  platform: ShortcutPlatform
  version: string

  theme: ThemeChoice
  onThemeChange(theme: ThemeChoice): void
  language: LanguageChoice
  onLanguageChange(language: LanguageChoice): void

  /** Closing the main window keeps Kamo running in the tray (menu bar on Mac). */
  closeToTray: boolean
  onCloseToTrayChange(closeToTray: boolean): void

  /** A soft tick on each number of the 3-2-1 (F-01). Omitted where there is no setting. */
  countdownSound?: { enabled: boolean; onChange(enabled: boolean): void }

  /** Null while loading. */
  folders: { projectsDir: string; exportDir: string } | null
  onChangeFolder(kind: FolderKind): ActionResult
  onShowFolder(kind: FolderKind): void

  stopShortcut: string
  defaultStopShortcut: string
  /** Null resets the default. */
  onStopShortcutChange(accelerator: string | null): ActionResult

  permissions: readonly PermissionItem[] | null
  onOpenPermissionSettings(kind: PermissionKind): void

  update: UpdateState
  onCheckUpdates(): void
  onRestartToUpdate(): ActionResult

  /** Builds the diagnostics text (F-17); shown before anything is copied. */
  onLoadDiagnostics(): Promise<string>
  onCopy(text: string): ActionResult
  onOpenIssue(text: string): ActionResult
  onLoadNotices(): Promise<string>

  /** Optional packs and transcription (A-07, A-05). Omitted where packs do not exist yet. */
  packs?: PacksSectionProps

  /**
   * Connect to an agent (M-01, step 26): the local MCP command. Omitted where there is no
   * projects folder an MCP server could read (the extension).
   */
  agent?: {
    devServerPath: string | null
    mcpVersion?: string | null
    /** Where to clone the repository to build the MCP server from source (not on npm yet). */
    sourceDir?: string | null
    onOpenDocs(): void
  }

  /** Replays the welcome tour (F-13). Omitted where there is none (the extension). */
  onShowTour?(): void
}

const FOLDER_ERRORS: Record<string, string> = {
  busy: 'settings.folders.errors.busy',
  folder_not_writable: 'settings.folders.errors.notWritable',
}

/** The hero art's height: every scene shares one canvas, so the headlines line up. */
const ART = 48
/** A card's icon, on its 40px tile. */
const ICON = 20

export function Settings(props: SettingsProps) {
  const t = useT()
  const [dialog, setDialog] = useState<'diagnostics' | 'notices' | null>(null)

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-md p-lg">
        <h1 className="font-serif text-headline">{t('settings.title')}</h1>

        <Section
          id="settings-appearance"
          title={t('settings.appearance.title')}
          hero={{
            art: <ThemeArt size={ART} />,
            headline: t('settings.appearance.headline'),
            description: t('settings.appearance.intro'),
          }}
        >
          <SettingCard
            icon={<ThemeIcon size={ICON} />}
            title={t('settings.appearance.theme')}
            controls={
              <Segmented
                label={t('settings.appearance.theme')}
                value={props.theme}
                onChange={props.onThemeChange}
                options={[
                  { value: 'light', label: t('settings.appearance.light'), icon: <SunIcon /> },
                  { value: 'dark', label: t('settings.appearance.dark'), icon: <MoonIcon /> },
                  {
                    value: 'system',
                    label: t('settings.appearance.system'),
                    icon: <MonitorIcon />,
                  },
                ]}
              />
            }
          />
        </Section>

        <Section
          id="settings-language"
          title={t('settings.language.title')}
          hero={{
            art: <LanguageArt size={ART} />,
            headline: t('settings.language.headline'),
            description: t('settings.language.intro'),
          }}
        >
          <LanguageCard value={props.language} onChange={props.onLanguageChange} />
        </Section>

        <Section
          id="settings-window"
          title={t('settings.window.title')}
          hero={{
            art: <TrayArt size={ART} />,
            headline: t('settings.window.headline'),
            description: t('settings.window.intro'),
          }}
        >
          <SwitchCard
            icon={<AppWindowIcon size={ICON} />}
            label={t('settings.window.closeToTray')}
            hint={t(
              props.platform === 'mac'
                ? 'settings.window.closeToTrayHintMac'
                : 'settings.window.closeToTrayHint',
            )}
            checked={props.closeToTray}
            onChange={props.onCloseToTrayChange}
          />
        </Section>

        {props.countdownSound && (
          <Section
            id="settings-recording"
            title={t('settings.recording.title')}
            hero={{
              art: <CountdownArt size={ART} />,
              headline: t('settings.recording.headline'),
              description: t('settings.recording.intro'),
            }}
          >
            <SwitchCard
              icon={<TimerIcon size={ICON} />}
              label={t('settings.recording.countdownSound')}
              hint={t('settings.recording.countdownSoundHint')}
              checked={props.countdownSound.enabled}
              onChange={props.countdownSound.onChange}
            />
          </Section>
        )}

        <Section
          id="settings-folders"
          title={t('settings.folders.title')}
          hero={{
            art: <FolderArt size={ART} />,
            headline: t('settings.folders.headline'),
            description: t('settings.folders.intro'),
          }}
        >
          <FolderCard kind="projects" {...props} />
          <FolderCard kind="export" {...props} />
        </Section>

        <Section
          id="settings-shortcuts"
          title={t('settings.shortcuts.title')}
          hero={{
            art: <KeysArt size={ART} />,
            headline: t('settings.shortcuts.headline'),
            description: t('settings.shortcuts.intro'),
          }}
        >
          <ShortcutRecorder
            platform={props.platform}
            value={props.stopShortcut}
            defaultValue={props.defaultStopShortcut}
            onChange={props.onStopShortcutChange}
          />
        </Section>

        <Section
          id="settings-permissions"
          title={t('settings.permissions.title')}
          hero={{
            art: <ShieldArt size={ART} />,
            headline: t('settings.permissions.headline'),
            description: t('settings.permissions.intro'),
          }}
        >
          <PermissionCards
            permissions={props.permissions}
            onOpen={props.onOpenPermissionSettings}
            platform={props.platform}
          />
        </Section>

        {props.packs && <PacksSection {...props.packs} />}

        {props.agent && (
          <AgentSection
            platform={props.platform}
            projectsDir={props.folders?.projectsDir ?? null}
            devServerPath={props.agent.devServerPath}
            mcpVersion={props.agent.mcpVersion ?? null}
            sourceDir={props.agent.sourceDir ?? null}
            onCopy={props.onCopy}
            onOpenDocs={props.agent.onOpenDocs}
          />
        )}

        <Section
          id="settings-updates"
          title={t('settings.updates.title')}
          hero={{
            art: <UpdateArt size={ART} />,
            headline: t('settings.updates.headline'),
            description: t('settings.updates.intro'),
          }}
        >
          <UpdatesCard {...props} />
        </Section>

        <Section
          id="settings-help"
          title={t('settings.help.title')}
          hero={{
            art: <HelpArt size={ART} />,
            headline: t('settings.help.headline'),
            description: t('settings.help.description'),
          }}
        >
          {/* Both show the text first (F-17); the dialog has Copy and Open issue. */}
          <SettingCard
            icon={<ClipboardIcon size={ICON} />}
            title={t('diagnostics.title')}
            controls={
              <>
                <SecondaryButton onClick={() => setDialog('diagnostics')}>
                  {t('settings.help.copyDiagnostics')}
                </SecondaryButton>
                <SecondaryButton onClick={() => setDialog('diagnostics')}>
                  <ExternalIcon />
                  {t('settings.help.openIssue')}
                </SecondaryButton>
              </>
            }
          />
          {props.onShowTour && (
            <div>
              <LinkButton onClick={props.onShowTour}>{t('settings.help.tour')}</LinkButton>
            </div>
          )}
        </Section>

        <Section
          id="settings-about"
          title={t('settings.about.title')}
          hero={{
            art: <OpenArt size={ART} />,
            headline: t('settings.about.headline'),
            description: t('settings.about.license'),
          }}
        >
          <SettingCard
            icon={<Mascot pose="icon" size={28} />}
            title={t('settings.about.version', { version: props.version })}
            controls={
              <SecondaryButton onClick={() => setDialog('notices')}>
                <DocumentIcon />
                {t('settings.about.notices')}
              </SecondaryButton>
            }
          />
        </Section>
      </div>

      <TextDialog
        open={dialog === 'diagnostics'}
        title={t('diagnostics.title')}
        intro={t('diagnostics.intro')}
        textLabel={t('diagnostics.label')}
        load={props.onLoadDiagnostics}
        onClose={() => setDialog(null)}
        actions={{ onCopy: props.onCopy, onOpenIssue: props.onOpenIssue }}
      />
      <TextDialog
        open={dialog === 'notices'}
        title={t('settings.about.notices')}
        textLabel={t('settings.about.notices')}
        load={props.onLoadNotices}
        onClose={() => setDialog(null)}
      />
    </main>
  )
}

/** A locale's name in that language, e.g. "Português (Brasil)", "日本語" (Intl, no strings). */
export function localeName(locale: Locale): string {
  // zh-CN reads better as "简体中文" than "中文（中国）".
  const code = locale === 'zh-CN' ? 'zh-Hans' : locale
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? locale
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
  } catch {
    return locale
  }
}

function LanguageCard({
  value,
  onChange,
}: {
  value: LanguageChoice
  onChange(value: LanguageChoice): void
}) {
  const t = useT()
  return (
    <SettingCard
      icon={<GlobeIcon size={ICON} />}
      title={<label htmlFor="settings-language-select">{t('settings.language.label')}</label>}
      controls={
        <select
          id="settings-language-select"
          value={value}
          onChange={(event) => onChange(event.target.value as LanguageChoice)}
          className={SELECT_CLASS}
        >
          <option value="system">{t('settings.language.system')}</option>
          {LOCALES.map((locale) => (
            <option key={locale} value={locale} lang={locale}>
              {localeName(locale)}
            </option>
          ))}
        </select>
      }
    />
  )
}

function FolderCard({
  kind,
  folders,
  onChangeFolder,
  onShowFolder,
}: SettingsProps & { kind: FolderKind }) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const path = folders ? (kind === 'projects' ? folders.projectsDir : folders.exportDir) : null
  const prefix = kind === 'projects' ? 'settings.folders.projects' : 'settings.folders.export'
  return (
    <SettingCard
      icon={kind === 'projects' ? <FolderIcon size={ICON} /> : <ExportIcon size={ICON} />}
      title={t(prefix)}
      description={t(`${prefix}Hint`)}
      controls={
        <>
          <SecondaryButton
            disabled={!folders}
            onClick={() => {
              setError(null)
              void onChangeFolder(kind).then(
                (code) =>
                  setError(code ? (FOLDER_ERRORS[code] ?? 'settings.folders.errors.failed') : null),
                () => setError('settings.folders.errors.failed'),
              )
            }}
          >
            {t('settings.folders.change')}
          </SecondaryButton>
          <SecondaryButton disabled={!folders} onClick={() => onShowFolder(kind)}>
            <FolderIcon />
            {t('settings.folders.show')}
          </SecondaryButton>
        </>
      }
      notice={error && <InlineNotice tone="error">{t(error)}</InlineNotice>}
    >
      <span className="block rounded-sm bg-surface-raised px-xs py-[2px] font-mono text-label break-all text-on-surface">
        {path ?? '…'}
      </span>
    </SettingCard>
  )
}

export function permissionStatusLabel(t: Translate, status: PermissionItem['status']): string {
  return t(`settings.permissions.status.${status}`)
}

const PERMISSION_ICON: Record<PermissionKind, ReactNode> = {
  screen: <MonitorIcon size={ICON} />,
  microphone: <MicIcon size={ICON} />,
  camera: <VideoCameraIcon size={ICON} />,
  inputMonitoring: <MouseIcon size={ICON} />,
}

function PermissionCards({
  permissions,
  onOpen,
  platform,
}: {
  permissions: readonly PermissionItem[] | null
  onOpen(kind: PermissionKind): void
  platform: ShortcutPlatform
}) {
  const t = useT()
  if (!permissions) return null
  if (permissions.length === 0) {
    return <p className="text-body text-on-surface-muted">{t('settings.permissions.none')}</p>
  }
  return (
    <>
      {permissions.map((permission) => (
        <SettingCard
          key={permission.kind}
          icon={PERMISSION_ICON[permission.kind]}
          title={t(`settings.permissions.${permission.kind}`)}
          chips={
            <StatusPill
              status={permission.status}
              label={permissionStatusLabel(t, permission.status)}
            />
          }
          description={t(`settings.permissions.${permission.kind}Hint`)}
          controls={
            <SecondaryButton onClick={() => onOpen(permission.kind)}>
              <ExternalIcon />
              {t(openSystemSettingsKey(platform))}
            </SecondaryButton>
          }
        />
      ))}
    </>
  )
}

function UpdatesCard({ version, update, onCheckUpdates, onRestartToUpdate }: SettingsProps) {
  const t = useT()
  const locale = useLocale()
  const [busy, setBusy] = useState(false)
  useEffect(() => setBusy(false), [update.state])

  const status = (() => {
    switch (update.state) {
      case 'unsupported':
        return t('settings.updates.status.unsupported')
      case 'store':
        return t('settings.updates.status.store')
      case 'idle':
        return t('settings.updates.status.idle')
      case 'checking':
        return t('settings.updates.status.checking')
      case 'up-to-date':
        return t('settings.updates.status.upToDate', {
          time: new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(update.checkedAt),
        })
      case 'downloading':
        return t('settings.updates.status.downloading', {
          version: update.version,
          progress: update.percent / 100,
        })
      case 'ready':
        return t('settings.updates.status.ready', { version: update.version })
      case 'error':
        return t('settings.updates.status.error')
    }
  })()

  return (
    <SettingCard
      icon={<RefreshIcon size={ICON} />}
      title={t('settings.updates.version', { version })}
      description={status}
      controls={
        update.state === 'ready' ? (
          <SecondaryButton
            onClick={() => {
              void onRestartToUpdate().then((code) => setBusy(code === 'busy'))
            }}
          >
            {t('updates.restart')}
          </SecondaryButton>
        ) : (
          <SecondaryButton
            disabled={
              update.state === 'unsupported' ||
              update.state === 'store' ||
              update.state === 'checking' ||
              update.state === 'downloading'
            }
            onClick={onCheckUpdates}
          >
            {t('settings.updates.check')}
          </SecondaryButton>
        )
      }
      notice={busy && <InlineNotice tone="warning">{t('updates.busy')}</InlineNotice>}
    />
  )
}
