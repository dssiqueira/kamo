// Settings → Connect to an agent (flows.md §7, M-01, step 26): the ready-to-copy command that
// adds the local MCP server to Claude Code, the JSON for other MCP clients, what the agent can
// read and a link to the full instructions.
import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '../i18n.tsx'
import {
  BracesIcon,
  CheckIcon,
  ExternalIcon,
  InfoIcon,
  LockIcon,
  TerminalIcon,
} from '../primitives/icons.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import {
  canUseNpx,
  claudeCommand,
  mcpClientJson,
  needsSourceBuild,
  sourceBuildCommands,
  unsafeForCmd,
  type AgentSetupInput,
} from './agent.ts'
import { AgentArt } from './illustrations.tsx'
import { LinkButton, Section, SectionNote, SecondaryButton, SettingCard } from './parts.tsx'
import type { ShortcutPlatform } from './shortcut.ts'
import type { ActionResult } from './types.ts'

export interface AgentSectionProps {
  platform: ShortcutPlatform
  /** null while loading */
  projectsDir: string | null
  /** apps/mcp/dist/cli.js in an unpackaged (development) build; null in a release */
  devServerPath?: string | null
  /** The @kamo/mcp version on npm that matches this app; null while it is not published. */
  mcpVersion?: string | null
  /**
   * Where to clone the repository to build the server from source, offered while the package
   * is not on npm and there is no development build (e.g. `~/kamo`).
   */
  sourceDir?: string | null
  onCopy(text: string): ActionResult
  /** Opens the setup instructions for other MCP clients (apps/mcp/README.md). */
  onOpenDocs(): void
}

export function AgentSection({
  platform,
  projectsDir,
  devServerPath = null,
  mcpVersion = null,
  sourceDir = null,
  onCopy,
  onOpenDocs,
}: AgentSectionProps) {
  const t = useT()
  if (!projectsDir) return null
  const input: AgentSetupInput = { platform, projectsDir, devServerPath, mcpVersion, sourceDir }
  // Without the package on npm, never an npx command that would run whatever owns the name:
  // the development build, or the steps to build the server from source.
  const npx = canUseNpx(input)
  const fromSource = needsSourceBuild(input)

  return (
    <Section
      id="settings-agent"
      title={t('settings.agent.title')}
      hero={{
        art: <AgentArt size={48} />,
        headline: t('settings.agent.headline'),
        description: t('settings.agent.description'),
      }}
    >
      {!npx && (
        <p className="text-body text-on-surface-muted" data-testid="agent-not-published">
          {t(fromSource ? 'settings.agent.fromSource' : 'settings.agent.notPublished')}
        </p>
      )}
      {fromSource && (
        <Snippet
          id="agent-source"
          icon={<TerminalIcon size={20} />}
          label={t('settings.agent.sourceBuild')}
          hint={t('settings.agent.sourceHint')}
          text={sourceBuildCommands(input)}
          onCopy={onCopy}
        />
      )}
      {!npx && devServerPath && (
        <p className="text-label text-on-surface-muted">{t('settings.agent.devHint')}</p>
      )}
      {npx && unsafeForCmd(projectsDir, platform) && (
        <p className="text-body text-on-surface-muted" data-testid="agent-unsafe-folder">
          {t('settings.agent.unsafeFolder')}
        </p>
      )}

      {(npx || devServerPath || fromSource) && (
        <>
          <Snippet
            id="agent-claude"
            icon={<TerminalIcon size={20} />}
            label={t('settings.agent.claudeCode')}
            text={claudeCommand(input)}
            onCopy={onCopy}
          />
          <Snippet
            id="agent-json"
            icon={<BracesIcon size={20} />}
            label={t('settings.agent.otherClients')}
            text={mcpClientJson(input)}
            onCopy={onCopy}
          />
        </>
      )}

      <div className="flex flex-col gap-xs">
        <SectionNote icon={<LockIcon size={14} />}>{t('settings.agent.readOnly')}</SectionNote>
        <SectionNote icon={<InfoIcon size={14} />}>{t('settings.agent.node')}</SectionNote>
      </div>

      <div>
        <LinkButton onClick={onOpenDocs}>
          <ExternalIcon />
          {t('settings.agent.docs')}
        </LinkButton>
      </div>

      {npx && devServerPath && (
        <details className="flex flex-col gap-sm" data-testid="agent-dev">
          <summary
            className={`cursor-pointer rounded-sm text-body text-tertiary-strong ${FOCUS_RING}`}
          >
            {t('settings.agent.devTitle')}
          </summary>
          <div className="mt-sm flex flex-col gap-sm">
            <p className="text-label text-on-surface-muted">{t('settings.agent.devHint')}</p>
            <Snippet
              id="agent-dev-claude"
              icon={<TerminalIcon size={20} />}
              label={t('settings.agent.claudeCode')}
              text={claudeCommand(input, true)}
              onCopy={onCopy}
            />
          </div>
        </details>
      )}
    </Section>
  )
}

/**
 * A command card: its name, a Copy button that says "Copied" for a moment and the text in a
 * mono box under it.
 */
function Snippet({
  id,
  icon,
  label,
  hint,
  text,
  onCopy,
}: {
  id: string
  icon: ReactNode
  label: string
  hint?: string
  text: string
  onCopy(text: string): ActionResult
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <SettingCard
      icon={icon}
      title={<span id={`${id}-label`}>{label}</span>}
      description={hint}
      controls={
        <SecondaryButton
          onClick={() =>
            void onCopy(text).then((error) => {
              if (!error) setCopied(true)
            })
          }
        >
          {copied ? <CheckIcon size={16} /> : null}
          {copied ? t('settings.agent.copied') : t('settings.agent.copy')}
        </SecondaryButton>
      }
      footer={
        <pre
          aria-labelledby={`${id}-label`}
          data-testid={id}
          className="overflow-x-auto rounded-md border border-border bg-surface-raised p-sm font-mono text-label break-all whitespace-pre-wrap text-on-surface select-all"
        >
          {text}
        </pre>
      }
    />
  )
}
