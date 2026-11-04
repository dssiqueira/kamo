// Local MCP (AGENTS.md rule 7): read-only, stdio, no network. The CLI is `cli.ts`.
export { createKamoServer, type KamoServerOptions } from './server.ts'
export {
  appDataDir,
  normalizeProjectsDir,
  resolveProjectsDir,
  settingsFile,
  type FolderSource,
  type ResolvedFolder,
  type ResolveOptions,
} from './folder.ts'
export { Library, nearestFrame, normalizeText, type Recording, type Scan } from './library.ts'
export { timecode, parseDateBound } from './time.ts'
export { VERSION } from './version.ts'
