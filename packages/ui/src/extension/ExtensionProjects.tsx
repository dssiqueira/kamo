// "All projects" in the extension (E-03, flows.md → Projects in the extension): the same list
// as the desktop Home (ProjectList, playlists included), the space the projects take with the
// 2GB warning, and the discreet notice that projects live in this browser. Its footer also has
// "Copy diagnostics" (F-17), the extension's only help entry. Knows nothing about Chrome (rule 1).
import { formatFileSize, resolveLocale } from '@kamo/i18n'
import { useState } from 'react'
import { ProjectList, type ProjectListProps } from '../home/ProjectList.tsx'
import { useLocale, useT } from '../i18n.tsx'
import { GazingMascot } from '../mascot/GazingMascot.tsx'
import { TextDialog } from '../settings/TextDialog.tsx'
import type { ActionResult } from '../settings/types.ts'

export interface ExtensionDiagnosticsProps {
  /** Builds the text; shown before anything is copied (F-17). */
  load(): Promise<string>
  onCopy(text: string): ActionResult
  onOpenIssue(text: string): ActionResult
}

export interface ExtensionProjectsProps {
  list: ProjectListProps
  /** Bytes all projects take; null while counting. */
  usedBytes: number | null
  /** The 2GB mark (E-03): past it, the warning shows. */
  warningBytes: number
  /** An error from the last action (already translated), shown above the list. */
  error?: string | null | undefined
  /** F-17: "Copy diagnostics" in the footer. Omitted: no button. */
  diagnostics?: ExtensionDiagnosticsProps
}

export function ExtensionProjects({
  list,
  usedBytes,
  warningBytes,
  error,
  diagnostics,
}: ExtensionProjectsProps) {
  const t = useT()
  const locale = resolveLocale([useLocale()])
  const over = usedBytes !== null && usedBytes > warningBytes
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  return (
    <main className="min-h-screen bg-background px-md py-xl font-sans text-on-surface">
      <div className="mx-auto flex max-w-[960px] flex-col gap-lg">
        <header className="flex flex-wrap items-center gap-md">
          <GazingMascot size={48} />
          <h1 className="font-serif text-headline">{t('extension.projects.title')}</h1>
          {usedBytes !== null && usedBytes > 0 && (
            <span
              data-testid="projects-storage"
              className="ml-auto rounded-full bg-surface-raised px-md py-xs font-mono text-label text-on-surface-muted"
            >
              {t('extension.projects.storage', { size: formatFileSize(locale, usedBytes) })}
            </span>
          )}
        </header>
        {over && (
          <p role="alert" className="rounded-lg bg-surface p-md text-body text-warning">
            {t('extension.projects.storageWarning', {
              limit: formatFileSize(locale, warningBytes),
            })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-body text-error">
            {error}
          </p>
        )}
        <ProjectList {...list} />
        <footer className="flex flex-col gap-xs border-t border-border pt-md text-label text-on-surface-muted">
          <p>{t('extension.projects.notice')}</p>
          <p>{t('extension.projects.deleteHint')}</p>
          {diagnostics && (
            <p>
              <button
                type="button"
                data-testid="copy-diagnostics"
                onClick={() => setDiagnosticsOpen(true)}
                className="font-semibold text-tertiary-strong underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary"
              >
                {t('settings.help.copyDiagnostics')}
              </button>
            </p>
          )}
        </footer>
      </div>
      {diagnostics && (
        <TextDialog
          open={diagnosticsOpen}
          title={t('diagnostics.title')}
          intro={t('diagnostics.intro')}
          textLabel={t('diagnostics.label')}
          load={diagnostics.load}
          onClose={() => setDiagnosticsOpen(false)}
          actions={{ onCopy: diagnostics.onCopy, onOpenIssue: diagnostics.onOpenIssue }}
        />
      )}
    </main>
  )
}
