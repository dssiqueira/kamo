// "All projects" in the extension (E-03, flows.md → Projects in the extension): the same list
// as the desktop Home (ProjectList, playlists included), the space the projects take with the
// 2GB warning, and the discreet notice that projects live in this browser. Knows nothing about
// Chrome (rule 1).
import { formatFileSize, resolveLocale } from '@kamo/i18n'
import { ProjectList, type ProjectListProps } from '../home/ProjectList.tsx'
import { useLocale, useT } from '../i18n.tsx'
import { GazingMascot } from '../mascot/GazingMascot.tsx'

export interface ExtensionProjectsProps {
  list: ProjectListProps
  /** Bytes all projects take; null while counting. */
  usedBytes: number | null
  /** The 2GB mark (E-03): past it, the warning shows. */
  warningBytes: number
  /** An error from the last action (already translated), shown above the list. */
  error?: string | null | undefined
}

export function ExtensionProjects({
  list,
  usedBytes,
  warningBytes,
  error,
}: ExtensionProjectsProps) {
  const t = useT()
  const locale = resolveLocale([useLocale()])
  const over = usedBytes !== null && usedBytes > warningBytes
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
        </footer>
      </div>
    </main>
  )
}
