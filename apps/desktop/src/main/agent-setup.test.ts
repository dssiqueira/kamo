import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findDevMcpServer, MCP_DOCS_URL, sourceCheckoutDir } from './agent-setup.ts'

describe('findDevMcpServer', () => {
  const repo = join('/src', 'kamo')
  const cli = join(repo, 'apps', 'mcp', 'dist', 'cli.js')
  const exists = (path: string) => path === cli

  it('finds the built server from the desktop app folder or a build inside it', () => {
    expect(findDevMcpServer(join(repo, 'apps', 'desktop'), false, exists)).toBe(cli)
    expect(findDevMcpServer(join(repo, 'apps', 'desktop', 'out', 'main'), false, exists)).toBe(cli)
  })

  it('is null when packaged or not built', () => {
    expect(findDevMcpServer(join(repo, 'apps', 'desktop'), true, exists)).toBeNull()
    expect(findDevMcpServer(join(repo, 'apps', 'desktop'), false, () => false)).toBeNull()
  })

  it('points the docs at the MCP README', () => {
    expect(MCP_DOCS_URL).toMatch(/^https:\/\/github\.com\/dssiqueira\/kamo\/.*apps\/mcp/)
  })
})

describe('sourceCheckoutDir', () => {
  it('suggests a kamo folder in the home folder', () => {
    expect(sourceCheckoutDir(join('/home', 'ana'))).toBe(join('/home', 'ana', 'kamo'))
  })
})
