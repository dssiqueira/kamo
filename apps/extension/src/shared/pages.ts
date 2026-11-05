// The extension's own pages (vite.config.ts entry points), opened in normal tabs.

/** The editor of one project (E-03): `editor.html?project=<id>`. */
export const EDITOR_PAGE = 'editor.html'
/** "All projects" (E-03, flows.md → Projects in the extension). */
export const PROJECTS_PAGE = 'projects.html'
/** Opened once, on install (E-05). */
export const WELCOME_PAGE = 'welcome.html'

/** Path (relative to the extension root) of the editor for `projectId`. */
export function editorPath(projectId: string): string {
  return `${EDITOR_PAGE}?project=${encodeURIComponent(projectId)}`
}
