// End to end over real stdio: the CLI as a child process, the SDK client on the other side.
// Any stray byte on stdout would break the protocol, so a log there fails this test.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IDS, buildSampleFolder, data } from './helpers.ts'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
// Node runs the TypeScript source directly; @kamo/core needs full transforms, not just stripping.
const NODE_ARGS = ['--experimental-transform-types', '--no-warnings', CLI]

let dir: string

beforeAll(async () => {
  dir = await buildSampleFolder()
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('kamo-mcp CLI', () => {
  it('prints --version and --help', async () => {
    const run = promisify(execFile)
    const version = await run(process.execPath, [...NODE_ARGS, '--version'])
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
    const help = await run(process.execPath, [...NODE_ARGS, '--help'])
    expect(help.stdout).toContain(
      'claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"',
    )
  })

  it('serves the tools over stdio and logs only to stderr', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [...NODE_ARGS, '--dir', dir],
      stderr: 'pipe',
    })
    let stderr = ''
    transport.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    const errors: Error[] = []
    const client = new Client({ name: 'kamo-mcp-stdio-test', version: '0.0.0' })
    client.onerror = (error) => errors.push(error)
    await client.connect(transport)
    try {
      expect(client.getServerVersion()?.name).toBe('kamo')
      expect(client.getInstructions()).toMatch(/read-only/)
      const { tools } = await client.listTools()
      expect(tools).toHaveLength(6)
      const list = (await client.callTool({
        name: 'list_recordings',
        arguments: {},
      })) as CallToolResult
      expect(data(list).total).toBe(3)
      const frame = (await client.callTool({
        name: 'get_frame',
        arguments: { recordingId: IDS.onboarding, atMs: 3000 },
      })) as CallToolResult
      expect(frame.content.map((c) => c.type)).toEqual(['text', 'image'])
    } finally {
      await client.close()
    }
    expect(errors).toEqual([])
    expect(stderr).toContain(`reading ${dir} (from argument); read-only, no network`)
  })
})
