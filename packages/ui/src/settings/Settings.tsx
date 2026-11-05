// Settings (flows.md §7, F-15): appearance, language, folders, shortcuts, permissions, updates,
// help (F-17), optional packs and transcription (A-07, A-05), connect to an agent (M-01) and
// about. The Kamo Cloud section arrives with its own step.
import { LOCALES, type Locale } from '@kamo/i18n'
import { useEffect, useState } from 'react'
import { useLocale, useT, type Translate } from '../i18n.tsx'
import { Switch } from '../primitives/controls.tsx'
import { ExternalIcon, FolderIcon } from '../primitives/icons.tsx'
import { TextDialog } from './TextDialog.tsx'
import {
  InlineNotice,
  LinkButton,
  Row,
  Section,
  SecondaryButton,
  Segmented,
  StatusPill,
} from './parts.tsx'
import { ShortcutRecorder } from './ShortcutRecorder.tsx'
import { PacksSection, type PacksSectionProps } from '../packs/PacksSection.tsx'
import { AgentSection } from './AgentSection.tsx'
import type { ShortcutPlatform } from './shortcut.ts'
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
  agent?: { devServerPath: string | null; onOpenDocs(): void }

  /** Replays the welcome tour (F-13). Omitted where there is none (the extension). */
  onShowTour?(): void
}

const FOLDER_ERRORS: Record<string, string> = {
  busy: 'settings.folders.errors.busy',
  folder_not_writable: 'settings.folders.errors.notWritable',
}

export function Settings(props: SettingsProps) {
  const t = useT()
  const [dialog, setDialog] = useState<'diagnostics' | 'notices' | null>(null)

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-md p-lg">
        <h1 className="font-serif text-headline">{t('settings.title')}</h1>

        <Section id="settings-appearance" title={t('settings.appearance.title')}>
          <Row label={t('settings.appearance.theme')}>
            <Segmented
              label={t('settings.appearance.theme')}
              value={props.theme}
              onChange={props.onThemeChange}
              options={[
                { value: 'light', label: t('settings.appearance.light') },
                { value: 'dark', label: t('settings.appearance.dark') },
                { value: 'system', label: t('settings.appearance.system') },
              ]}
            />
          </Row>
        </Section>

        <Section id="settings-language" title={t('settings.language.title')}>
          <LanguageRow value={props.language} onChange={props.onLanguageChange} />
        </Section>

        <Section id="settings-window" title={t('settings.window.title')}>
          <div className="flex flex-col gap-xs">
            <Switch
              label={t('settings.window.closeToTray')}
              checked={props.closeToTray}
              onChange={props.onCloseToTrayChange}
            />
            <p className="text-label text-on-surface-muted">
              {t(
                props.platform === 'mac'
                  ? 'settings.window.closeToTrayHintMac'
                  : 'settings.window.closeToTrayHint',
              )}
            </p>
          </div>
        </Section>

        <Section id="settings-folders" title={t('settings.folders.title')}>
          <FolderRow kind="projects" {...props} />
          <FolderRow kind="export" {...props} />
        </Section>

        <Section id="settings-shortcuts" title={t('settings.shortcuts.title')}>
          <ShortcutRecorder
            platform={props.platform}
            value={props.stopShortcut}
            defaultValue={props.defaultStopShortcut}
            onChange={props.onStopShortcutChange}
          />
        </Section>

        <Section id="settings-permissions" title={t('settings.permissions.title')}>
          <PermissionRows permissions={props.permissions} onOpen={props.onOpenPermissionSettings} />
        </Section>

        {props.packs && <PacksSection {...props.packs} />}

        {props.agent && (
          <AgentSection
            platform={props.platform}
            projectsDir={props.folders?.projectsDir ?? null}
            devServerPath={props.agent.devServerPath}
            onCopy={props.onCopy}
            onOpenDocs={props.agent.onOpenDocs}
          />
        )}

        <Section id="settings-updates" title={t('settings.updates.title')}>
          <UpdatesRow {...props} />
        </Section>

        <Section id="settings-help" title={t('settings.help.title')}>
          <p className="text-body text-on-surface-muted">{t('settings.help.description')}</p>
          {/* Both show the text first (F-17); the dialog has Copy and Open issue. */}
          <div className="flex flex-wrap gap-sm">
            <SecondaryButton onClick={() => setDialog('diagnostics')}>
              {t('settings.help.copyDiagnostics')}
            </SecondaryButton>
            <SecondaryButton onClick={() => setDialog('diagnostics')}>
              <ExternalIcon />
              {t('settings.help.openIssue')}
            </SecondaryButton>
          </div>
          {props.onShowTour && (
            <div>
              <LinkButton onClick={props.onShowTour}>{t('settings.help.tour')}</LinkButton>
            </div>
          )}
        </Section>

        <Section id="settings-about" title={t('settings.about.title')}>
          <Row
            label={t('settings.about.version', { version: props.version })}
            description={t('settings.about.license')}
          >
            <SecondaryButton onClick={() => setDialog('notices')}>
              {t('settings.about.notices')}
            </SecondaryButton>
          </Row>
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

function LanguageRow({
  value,
  onChange,
}: {
  value: LanguageChoice
  onChange(value: LanguageChoice): void
}) {
  const t = useT()
  return (
    <Row label={<label htmlFor="settings-language-select">{t('settings.language.label')}</label>}>
      <select
        id="settings-language-select"
        value={value}
        onChange={(event) => onChange(event.target.value as LanguageChoice)}
        className="min-w-[200px] rounded-md border border-border bg-surface px-[12px] py-[7px] text-body text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary"
      >
        <option value="system">{t('settings.language.system')}</option>
        {LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {localeName(locale)}
          </option>
        ))}
      </select>
    </Row>
  )
}

function FolderRow({
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
    <div className="flex flex-col gap-xs">
      <Row
        label={t(prefix)}
        description={
          <>
            <span className="block break-all font-mono text-on-surface">{path ?? '…'}</span>
            <span className="block">{t(`${prefix}Hint`)}</span>
          </>
        }
      >
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
      </Row>
      {error && <InlineNotice tone="error">{t(error)}</InlineNotice>}
    </div>
  )
}

export function permissionStatusLabel(t: Translate, status: PermissionItem['status']): string {
  return t(`settings.permissions.status.${status}`)
}

function PermissionRows({
  permissions,
  onOpen,
}: {
  permissions: readonly PermissionItem[] | null
  onOpen(kind: PermissionKind): void
}) {
  const t = useT()
  if (!permissions) return null
  if (permissions.length === 0) {
    return <p className="text-body text-on-surface-muted">{t('settings.permissions.none')}</p>
  }
  return (
    <div className="flex flex-col gap-md">
      {permissions.map((permission) => (
        <Row
          key={permission.kind}
          label={
            <span className="flex flex-wrap items-center gap-sm">
              {t(`settings.permissions.${permission.kind}`)}
              <StatusPill
                status={permission.status}
                label={permissionStatusLabel(t, permission.status)}
              />
            </span>
          }
          description={t(`settings.permissions.${permission.kind}Hint`)}
        >
          <SecondaryButton onClick={() => onOpen(permission.kind)}>
            <ExternalIcon />
            {t('settings.permissions.openSystemSettings')}
          </SecondaryButton>
        </Row>
      ))}
    </div>
  )
}

function UpdatesRow({ version, update, onCheckUpdates, onRestartToUpdate }: SettingsProps) {
  const t = useT()
  const locale = useLocale()
  const [busy, setBusy] = useState(false)
  useEffect(() => setBusy(false), [update.state])

  const status = (() => {
    switch (update.state) {
      case 'unsupported':
        return t('settings.updates.status.unsupported')
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
    <div className="flex flex-col gap-xs">
      <Row label={t('settings.updates.version', { version })} description={status}>
        {update.state === 'ready' ? (
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
              update.state === 'checking' ||
              update.state === 'downloading'
            }
            onClick={onCheckUpdates}
          >
            {t('settings.updates.check')}
          </SecondaryButton>
        )}
      </Row>
      {busy && <InlineNotice tone="warning">{t('updates.busy')}</InlineNotice>}
    </div>
  )
}
