// Settings → Connect to an agent (M-01, step 26): where the full instructions live and, in a
// development build, the local MCP server built in this repository (apps/mcp/dist/cli.js), so
// it can be tried before `@kamo/mcp` is on npm.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** apps/mcp/README.md on GitHub: setup for Claude Code and other MCP clients. */
export const MCP_DOCS_URL = 'https://github.com/dssiqueira/kamo/tree/main/apps/mcp#readme'

/**
 * Where Settings suggests cloning the repository to build the server from source while
 * `@kamo/mcp` is not on npm: `kamo` in the user's home folder.
 */
export function sourceCheckoutDir(home: string): string {
  return join(home, 'kamo')
}

/**
 * `apps/mcp/dist/cli.js` next to this app in the repository, looking up from the app path
 * (apps/desktop, or a build folder inside it). Null when packaged or not built.
 */
export function findDevMcpServer(
  appPath: string,
  packaged: boolean,
  exists: (path: string) => boolean = existsSync,
): string | null {
  if (packaged) return null
  let dir = appPath
  for (let i = 0; i < 4; i++) {
    for (const candidate of [
      join(dir, 'apps', 'mcp', 'dist', 'cli.js'),
      join(dir, 'mcp', 'dist', 'cli.js'),
    ]) {
      if (exists(candidate)) return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}
