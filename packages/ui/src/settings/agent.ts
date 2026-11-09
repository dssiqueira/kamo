// "Connect to an agent" (M-01, step 26): the ready-to-copy commands that add the local MCP
// server (`@kamo/mcp`, apps/mcp) to Claude Code or any MCP client, always with the projects
// folder passed as `--dir`. Pure, so the quoting is tested.
import type { ShortcutPlatform } from './shortcut.ts'

/** The npm package of the local MCP server (apps/mcp). */
export const MCP_PACKAGE = '@kamo/mcp'
/** Name the server is registered under in the agent. */
export const MCP_SERVER_NAME = 'kamo'
/** The public repository, cloned to build the server from source while it is not on npm. */
export const KAMO_REPO_URL = 'https://github.com/dssiqueira/kamo.git'
/**
 * Node runs the built server from a checkout with this flag: in the repository, `@kamo/core`
 * resolves to its TypeScript source, which plain type stripping cannot load.
 */
export const NODE_SOURCE_FLAG = '--experimental-transform-types'

export interface AgentSetupInput {
  platform: ShortcutPlatform
  projectsDir: string
  /**
   * The `@kamo/mcp` version on npm that matches this app, pinned in the npx command so a later
   * publish is never picked up by itself. Null (or absent) while the package is not on npm:
   * then only the development build can be offered.
   */
  mcpVersion?: string | null
  /**
   * A development build of the server (`apps/mcp/dist/cli.js`), run with Node instead of
   * npx. Only offered by unpackaged builds of the app.
   */
  devServerPath?: string | null
  /**
   * Where the user is told to clone the repository to build the server from source (e.g.
   * `~/kamo`): what a release offers while the package is not on npm.
   */
  sourceDir?: string | null
}

/**
 * One shell argument, for the terminal the user pastes it into.
 * - Mac and Linux: double quotes (like the docs) unless the text has a character they would
 *   expand; then single quotes.
 * - Windows: double quotes, which PowerShell and cmd both read. A folder name with `$` or a
 *   backtick (PowerShell expands both inside double quotes) gets PowerShell's single quotes
 *   instead, `'` doubled. Windows paths cannot contain `"`.
 */
export function shellQuote(value: string, platform: ShortcutPlatform): string {
  if (platform === 'windows') {
    if (!/[$`]/.test(value)) return `"${value}"`
    return `'${value.replaceAll("'", "''")}'`
  }
  if (!/[$`"\\!]/.test(value)) return `"${value}"`
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * True when a Windows folder has a character cmd.exe interprets even after quoting (`%`), or
 * when unquoted (`&|<>^`): the server starts through `cmd /c`, which parses its arguments
 * again, so the agent could end up with another folder or another command.
 */
export function unsafeForCmd(value: string, platform: ShortcutPlatform): boolean {
  return platform === 'windows' && /[%&|<>^]/.test(value)
}

/** `@kamo/mcp@<version>`, or null while the package is not on npm. */
function packageSpec(version: string | null | undefined): string | null {
  return version ? `${MCP_PACKAGE}@${version}` : null
}

/** True when the npx command can be offered: the matching @kamo/mcp is on npm. */
export function canUseNpx(input: AgentSetupInput): boolean {
  return packageSpec(input.mcpVersion) !== null
}

/** True when only the from-source instructions apply: not on npm and no development build. */
export function needsSourceBuild(input: AgentSetupInput): boolean {
  return !canUseNpx(input) && !input.devServerPath && Boolean(input.sourceDir)
}

/** `<sourceDir>/apps/mcp/dist/cli.js`, with the platform's separator. */
export function sourceServerPath(sourceDir: string, platform: ShortcutPlatform): string {
  const sep = platform === 'windows' ? '\\' : '/'
  const base = sourceDir.endsWith(sep) ? sourceDir.slice(0, -1) : sourceDir
  return [base, 'apps', 'mcp', 'dist', 'cli.js'].join(sep)
}

/**
 * The terminal lines that build the server from source: clone into `sourceDir`, install only
 * what the server needs (no Electron) and compile it. Empty without a `sourceDir`.
 */
export function sourceBuildCommands(input: AgentSetupInput): string {
  if (!input.sourceDir) return ''
  const dir = shellQuote(input.sourceDir, input.platform)
  return [
    `git clone ${KAMO_REPO_URL} ${dir}`,
    `cd ${dir}`,
    `pnpm install --filter "${MCP_PACKAGE}..."`,
    `pnpm --filter ${MCP_PACKAGE} build`,
  ].join('\n')
}

/**
 * The server's command line: npx on Mac and Linux; on Windows through `cmd /c`, which native
 * Windows needs to start npx from Claude Code and most MCP clients. The development build
 * runs with Node when asked, or whenever the package is not on npm; without one, the build
 * from source in `sourceDir`.
 */
function serverArgv(input: AgentSetupInput, dev: boolean) {
  const { platform, projectsDir, devServerPath, sourceDir } = input
  const tail = ['--dir', projectsDir]
  const spec = packageSpec(input.mcpVersion)
  if ((dev || !spec) && devServerPath) {
    return { command: 'node', args: [NODE_SOURCE_FLAG, devServerPath, ...tail] }
  }
  if (!spec && sourceDir) {
    return {
      command: 'node',
      args: [NODE_SOURCE_FLAG, sourceServerPath(sourceDir, platform), ...tail],
    }
  }
  const pkg = spec ?? MCP_PACKAGE
  if (platform === 'windows') {
    return { command: 'cmd', args: ['/c', 'npx', '-y', pkg, ...tail] }
  }
  return { command: 'npx', args: ['-y', pkg, ...tail] }
}

const PLAIN_ARG = /^[\w@%+=:,./-]+$/

/** `claude mcp add kamo -- npx -y @kamo/mcp@<version> --dir "<projects folder>"`. */
export function claudeCommand(input: AgentSetupInput, dev = false): string {
  const { command, args } = serverArgv(input, dev)
  const quoted = [command, ...args].map((arg) =>
    PLAIN_ARG.test(arg) && !(input.platform === 'windows' && arg.includes('%'))
      ? arg
      : shellQuote(arg, input.platform),
  )
  return `claude mcp add ${MCP_SERVER_NAME} -- ${quoted.join(' ')}`
}

/** The usual `mcpServers` JSON for other MCP clients (Claude Desktop, Cursor, …), args on one line. */
export function mcpClientJson(input: AgentSetupInput, dev = false): string {
  const { command, args } = serverArgv(input, dev)
  const list = args.map((arg) => JSON.stringify(arg)).join(', ')
  return [
    '{',
    '  "mcpServers": {',
    `    ${JSON.stringify(MCP_SERVER_NAME)}: {`,
    `      "command": ${JSON.stringify(command)},`,
    `      "args": [${list}]`,
    '    }',
    '  }',
    '}',
  ].join('\n')
}
