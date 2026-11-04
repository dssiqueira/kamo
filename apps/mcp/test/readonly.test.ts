// AGENTS.md rule 7: the local MCP only reads the projects folder and never touches the network.
// Proven twice: statically (no write or network API anywhere in src/) and at runtime (every
// tool runs with fetch, sockets, DNS and file writes replaced by throwing stubs).
import dgram from 'node:dgram'
import dns from 'node:dns'
import fs from 'node:fs'
import { writeFile as esmWriteFile, readFile, readdir, rm } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import { join } from 'node:path'
import tls from 'node:tls'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IDS, buildSampleFolder, call, connect } from './helpers.ts'

const SRC = new URL('../src/', import.meta.url)

/** Modules that open sockets, resolve names or start processes. */
const FORBIDDEN_MODULES = [
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'dns',
  'dns/promises',
  'child_process',
  'cluster',
  'worker_threads',
  'inspector',
  'undici',
  'ws',
]
/** SDK transports other than stdio (HTTP, SSE, WebSocket) and the client side. */
const FORBIDDEN_SDK =
  /@modelcontextprotocol\/sdk\/(client\b|server\/(sse|streamableHttp|webStandardStreamableHttp|express|auth)\b)/
/** Write and network APIs: distinctive names, matched anywhere outside comments. */
const FORBIDDEN_NAMES = [
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'createWriteStream',
  'mkdir',
  'mkdirSync',
  'mkdtemp',
  'rmSync',
  'rmdir',
  'rename',
  'renameSync',
  'unlink',
  'unlinkSync',
  'copyFile',
  'cpSync',
  'symlink',
  'truncate',
  'chmod',
  'chown',
  'utimes',
  'fetch',
  'WebSocket',
  'EventSource',
  'XMLHttpRequest',
  'sendBeacon',
]
/** Short names that also exist as English words: matched only outside strings and comments. */
const FORBIDDEN_SHORT = ['rm', 'cp', 'open', 'http', 'https', 'net', 'dns', 'dgram', 'tls']

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

function stripStrings(code: string): string {
  return code
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
}

/** Every forbidden use in one source file, as readable strings. */
export function findForbidden(source: string): string[] {
  const code = stripComments(source)
  const bare = stripStrings(code)
  const found: string[] = []
  const specifiers = code.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)
  for (const [, specifier = ''] of specifiers) {
    const name = specifier.replace(/^node:/, '')
    if (FORBIDDEN_MODULES.includes(name)) found.push(`imports ${specifier}`)
    if (FORBIDDEN_SDK.test(specifier)) found.push(`imports ${specifier}`)
  }
  for (const name of FORBIDDEN_NAMES) {
    if (new RegExp(`\\b${name}\\b`).test(code)) found.push(`uses ${name}`)
  }
  for (const name of FORBIDDEN_SHORT) {
    if (new RegExp(`\\b${name}\\b`).test(bare)) found.push(`uses ${name}`)
  }
  // stdout is the MCP protocol: logs go to stderr only.
  if (/console\.(log|info|debug|table|dir)\b/.test(code)) found.push('logs to stdout')
  return found
}

async function sourceFiles(dir: URL): Promise<URL[]> {
  const files: URL[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...(await sourceFiles(new URL(`${entry.name}/`, dir))))
    else if (/\.(ts|js|mjs|cjs)$/.test(entry.name)) files.push(new URL(entry.name, dir))
  }
  return files
}

describe('source scan', () => {
  it('flags forbidden APIs (self-check)', () => {
    expect(findForbidden(`import { writeFile } from 'node:fs/promises'`)).toContain(
      'uses writeFile',
    )
    expect(findForbidden(`import http from 'node:http'`)).toContain('imports node:http')
    expect(findForbidden(`const net = await import("net")`)).toContain('imports net')
    expect(findForbidden(`await fetch(url)`)).toContain('uses fetch')
    expect(findForbidden(`fs.rm(path)`)).toContain('uses rm')
    expect(findForbidden(`console.log('hi')`)).toContain('logs to stdout')
    expect(
      findForbidden(`import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'`),
    ).toContain('imports @modelcontextprotocol/sdk/server/sse.js')
    // Words in prose are fine.
    expect(findForbidden(`const help = 'open the app, no network, rm nothing'`)).toEqual([])
    expect(findForbidden(`// we never fetch or writeFile here`)).toEqual([])
  })

  it('src/ has no file-write, network or stdout-logging API', async () => {
    const files = await sourceFiles(SRC)
    expect(files.length).toBeGreaterThan(3)
    const problems: string[] = []
    for (const file of files) {
      for (const problem of findForbidden(await readFile(file, 'utf8'))) {
        problems.push(`${file.pathname.split('/src/')[1]}: ${problem}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('only the stdio transport is used', async () => {
    const cli = await readFile(new URL('cli.ts', SRC), 'utf8')
    expect(cli).toContain(`'@modelcontextprotocol/sdk/server/stdio.js'`)
  })
})

describe('runtime: no network, no writes', () => {
  let dir: string
  const attempts: string[] = []
  const restore: (() => void)[] = []

  function trap(target: object, key: string, label: string) {
    const record = target as Record<string, unknown>
    const original = record[key]
    record[key] = (..._args: unknown[]) => {
      attempts.push(label)
      throw new Error(`blocked by test: ${label}`)
    }
    restore.push(() => {
      record[key] = original
    })
  }

  beforeAll(async () => {
    dir = await buildSampleFolder()
    trap(globalThis, 'fetch', 'fetch')
    trap(globalThis, 'WebSocket', 'WebSocket')
    trap(net.Socket.prototype, 'connect', 'net.Socket#connect')
    for (const key of ['connect', 'createConnection', 'createServer']) trap(net, key, `net.${key}`)
    for (const key of ['request', 'get', 'createServer']) trap(http, key, `http.${key}`)
    for (const key of ['request', 'get', 'createServer']) trap(https, key, `https.${key}`)
    trap(tls, 'connect', 'tls.connect')
    trap(dgram, 'createSocket', 'dgram.createSocket')
    for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6']) trap(dns, key, `dns.${key}`)
    trap(dns.promises, 'lookup', 'dns.promises.lookup')
    const writes = [
      'writeFile',
      'appendFile',
      'mkdir',
      'mkdtemp',
      'rm',
      'rmdir',
      'rename',
      'unlink',
      'copyFile',
      'cp',
      'symlink',
      'truncate',
      'chmod',
      'utimes',
    ]
    for (const key of writes) {
      trap(fs, key, `fs.${key}`)
      trap(fs, `${key}Sync`, `fs.${key}Sync`)
      trap(fs.promises, key, `fs.promises.${key}`)
    }
    trap(fs, 'createWriteStream', 'fs.createWriteStream')
    // Pushes the stubs into the ESM named exports (`import { writeFile } from 'node:fs/promises'`).
    syncBuiltinESMExports()
  })

  afterAll(async () => {
    for (const undo of restore.reverse()) undo()
    syncBuiltinESMExports()
    await rm(dir, { recursive: true, force: true })
  })

  it('the traps are armed (named ESM imports included)', () => {
    expect(() => esmWriteFile(join(dir, 'x.txt'), 'x')).toThrow('blocked by test')
    expect(() => globalThis.fetch('https://example.com')).toThrow('blocked by test')
    expect(() => net.connect(80, 'example.com')).toThrow('blocked by test')
    expect(attempts).toEqual(['fs.promises.writeFile', 'fetch', 'net.connect'])
    attempts.length = 0
  })

  it('every tool answers with network and writes blocked', async () => {
    const mcp = await connect(dir)
    try {
      const calls: [string, Record<string, unknown>][] = [
        ['list_recordings', {}],
        ['list_recordings', { from: '2026-10-01', to: '2026-12-31', limit: 1 }],
        ['search_recordings', { query: 'faturamento' }],
        ['get_recording', { recordingId: IDS.billing }],
        ['get_recording', { recordingId: 'broken-project' }],
        ['get_transcript', { recordingId: IDS.billing, fromMs: 0, toMs: 5000 }],
        ['get_transcript', { recordingId: IDS.onboarding }],
        [
          'get_click_timeline',
          { recordingId: IDS.billing, includeScrolls: true, includeMoves: true },
        ],
        ['get_frame', { recordingId: IDS.billing, atMs: 4000 }],
        ['get_frame', { recordingId: IDS.pending, atMs: 0 }],
      ]
      for (const [name, args] of calls) {
        const result = await call(mcp.client, name, args)
        expect(result.content.length, name).toBeGreaterThan(0)
        expect(JSON.stringify(result), name).not.toContain('blocked by test')
      }
      // The project folder is still exactly what the test wrote.
      expect((await readdir(join(dir, IDS.billing))).sort()).toEqual([
        'events.jsonl',
        'frames',
        'project.json',
        'transcript.json',
      ])
    } finally {
      await mcp.close()
    }
    expect(attempts).toEqual([])
  })
})
