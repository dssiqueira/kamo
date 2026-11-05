import { describe, expect, it } from 'vitest'
import {
  CI_SMOKE_BUILD,
  debugHooksAllowed,
  MCP_ON_NPM_BUILD,
  publishedMcpVersion,
} from './build-flags.ts'

describe('build flags', () => {
  it('are off when the build did not set them', () => {
    expect(CI_SMOKE_BUILD).toBe(false)
    expect(MCP_ON_NPM_BUILD).toBe(false)
  })

  it('allow the debug hooks in development, and when packaged only in a CI smoke build', () => {
    expect(debugHooksAllowed(false, false)).toBe(true)
    expect(debugHooksAllowed(true, false)).toBe(false)
    expect(debugHooksAllowed(true, true)).toBe(true)
  })

  it('give the npx version only for a packaged release that published @kamo/mcp', () => {
    expect(publishedMcpVersion(true, '0.1.0', true)).toBe('0.1.0')
    expect(publishedMcpVersion(true, '0.1.0-beta.2', true)).toBe('0.1.0-beta.2')
    expect(publishedMcpVersion(true, '0.1.0', false)).toBeNull()
    expect(publishedMcpVersion(false, '0.1.0', true)).toBeNull()
    expect(publishedMcpVersion(true, '0.0.0', true)).toBeNull()
    expect(publishedMcpVersion(true, '1.0.0 && x', true)).toBeNull()
  })
})
