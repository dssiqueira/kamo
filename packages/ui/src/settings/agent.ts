// "Connect to an agent" (M-01, step 26): the ready-to-copy commands that add the local MCP
// server (`@kamo/mcp`, apps/mcp) to Claude Code or any MCP client, always with the projects
// folder passed as `--dir`. Pure, so the quoting is tested.
import type { ShortcutPlatform } from './shortcut.ts'

/** The npm package of the local MCP server (apps/mcp). */
export const MCP_PACKAGE = '@kamo/mcp'
/** Name the server is registered under in the agent. */
export const MCP_SERVER_NAME = 'kamo'

export interface AgentSetupInput {
  platform: ShortcutPlatform
  projectsDir: string
  /**
   * A development build of the server (`apps/mcp/dist/cli.js`), run with Node instead of
   * npx. Only offered by unpackaged builds of the app.
   */
  devServerPath?: string | null
}

/**
 * One shell argument. Windows paths cannot contain `"`, so double quotes always work in
 * PowerShell and cmd. On Mac and Linux double quotes are kept (like the docs) unless the text
 * has a character they would expand; then single quotes.
 */
export function shellQuote(value: string, platform: ShortcutPlatform): string {
  if (platform === 'windows' || !/[$`"\\!]/.test(value)) return `"${value}"`
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * The server's command line: npx on Mac and Linux; on Windows through `cmd /c`, which native
 * Windows needs to start npx from Claude Code and most MCP clients.
 */
function serverArgv({ platform, projectsDir, devServerPath }: AgentSetupInput, dev: boolean) {
  const tail = ['--dir', projectsDir]
  if (dev && devServerPath) return { command: 'node', args: [devServerPath, ...tail] }
  if (platform === 'windows') {
    return { command: 'cmd', args: ['/c', 'npx', '-y', MCP_PACKAGE, ...tail] }
  }
  return { command: 'npx', args: ['-y', MCP_PACKAGE, ...tail] }
}

const PLAIN_ARG = /^[\w@%+=:,./-]+$/

/** `claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"`. */
export function claudeCommand(input: AgentSetupInput, dev = false): string {
  const { command, args } = serverArgv(input, dev)
  const quoted = [command, ...args].map((arg) =>
    PLAIN_ARG.test(arg) ? arg : shellQuote(arg, input.platform),
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
