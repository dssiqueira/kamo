// Settings → Connect to an agent (flows.md §7, M-01, step 26): the ready-to-copy command that
// adds the local MCP server to Claude Code, the JSON for other MCP clients, what the agent can
// read and a link to the full instructions.
import { useEffect, useState } from 'react'
import { useT } from '../i18n.tsx'
import { CheckIcon, ExternalIcon } from '../primitives/icons.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import {
  canUseNpx,
  claudeCommand,
  mcpClientJson,
  unsafeForCmd,
  type AgentSetupInput,
} from './agent.ts'
import { LinkButton, Section, SecondaryButton } from './parts.tsx'
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
  onCopy(text: string): ActionResult
  /** Opens the setup instructions for other MCP clients (apps/mcp/README.md). */
  onOpenDocs(): void
}

export function AgentSection({
  platform,
  projectsDir,
  devServerPath = null,
  mcpVersion = null,
  onCopy,
  onOpenDocs,
}: AgentSectionProps) {
  const t = useT()
  if (!projectsDir) return null
  const input: AgentSetupInput = { platform, projectsDir, devServerPath, mcpVersion }
  // Without the package on npm, only the development build can be offered (never an npx
  // command that would run whatever owns the name).
  const npx = canUseNpx(input)

  return (
    <Section id="settings-agent" title={t('settings.agent.title')}>
      <p className="text-body text-on-surface-muted">{t('settings.agent.description')}</p>

      {!npx && (
        <p className="text-body text-on-surface-muted" data-testid="agent-not-published">
          {t('settings.agent.notPublished')}
        </p>
      )}
      {!npx && devServerPath && (
        <p className="text-label text-on-surface-muted">{t('settings.agent.devHint')}</p>
      )}
      {npx && unsafeForCmd(projectsDir, platform) && (
        <p className="text-body text-on-surface-muted" data-testid="agent-unsafe-folder">
          {t('settings.agent.unsafeFolder')}
        </p>
      )}

      {(npx || devServerPath) && (
        <>
          <Snippet
            id="agent-claude"
            label={t('settings.agent.claudeCode')}
            text={claudeCommand(input)}
            onCopy={onCopy}
          />
          <Snippet
            id="agent-json"
            label={t('settings.agent.otherClients')}
            text={mcpClientJson(input)}
            onCopy={onCopy}
          />
        </>
      )}

      <ul className="flex list-disc flex-col gap-xs ps-[20px] text-label text-on-surface-muted">
        <li>{t('settings.agent.readOnly')}</li>
        <li>{t('settings.agent.node')}</li>
      </ul>

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

/** A label, the text in a mono box and a Copy button that says "Copied" for a moment. */
function Snippet({
  id,
  label,
  text,
  onCopy,
}: {
  id: string
  label: string
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
    <div className="flex flex-col gap-xs">
      <div className="flex items-center justify-between gap-sm">
        <span id={`${id}-label`} className="text-body font-medium">
          {label}
        </span>
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
      </div>
      <pre
        aria-labelledby={`${id}-label`}
        data-testid={id}
        className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-surface-raised p-sm font-mono text-label text-on-surface select-all"
      >
        {text}
      </pre>
    </div>
  )
}
