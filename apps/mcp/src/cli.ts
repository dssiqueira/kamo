#!/usr/bin/env node
// `kamo-mcp [--dir <path>]`: the local Kamo MCP over stdio. stdout carries the protocol, so
// every log goes to stderr. Read-only and offline (AGENTS.md rule 7).
import './threadpool.ts'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { parseArgs } from 'node:util'
import { resolveProjectsDir } from './folder.ts'
import { createKamoServer } from './server.ts'
import { VERSION } from './version.ts'

const HELP = `kamo-mcp ${VERSION}: local, read-only MCP server for your Kamo recordings.

Usage:
  kamo-mcp [--dir <projects folder>]

Options:
  --dir <path>   Kamo projects folder. Default: the folder set in the Kamo app
                 (its settings.json), otherwise ~/Kamo/projects.
  -h, --help     Show this help.
  -v, --version  Show the version.

Claude Code:
  claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"

It speaks MCP over stdio, only reads the projects folder and never uses the network.
`

function log(message: string): void {
  process.stderr.write(`[kamo-mcp] ${message}\n`)
}

async function main(): Promise<void> {
  let values: {
    dir?: string | undefined
    help?: boolean | undefined
    version?: boolean | undefined
  }
  try {
    ;({ values } = parseArgs({
      options: {
        dir: { type: 'string', short: 'd' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      strict: true,
      allowPositionals: false,
    }))
  } catch (error) {
    log(error instanceof Error ? error.message : String(error))
    process.stderr.write(HELP)
    process.exitCode = 2
    return
  }
  // Not serving yet, so stdout is free for the answer.
  if (values.help) {
    process.stdout.write(HELP)
    return
  }
  if (values.version) {
    process.stdout.write(`${VERSION}\n`)
    return
  }

  const folder = await resolveProjectsDir({ dir: values.dir })
  const { server } = createKamoServer({ dir: folder.dir })
  await server.connect(new StdioServerTransport())
  log(`v${VERSION} reading ${folder.dir} (from ${folder.source}); read-only, no network`)
}

main().catch((error: unknown) => {
  log(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exit(1)
})
