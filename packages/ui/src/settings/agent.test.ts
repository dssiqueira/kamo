import { describe, expect, it } from 'vitest'
import { canUseNpx, claudeCommand, mcpClientJson, shellQuote, unsafeForCmd } from './agent.ts'

describe('claudeCommand', () => {
  it('pins the published version and passes the projects folder on Mac', () => {
    expect(
      claudeCommand({
        platform: 'mac',
        projectsDir: '/Users/ana/Kamo/projects',
        mcpVersion: '0.1.0',
      }),
    ).toBe('claude mcp add kamo -- npx -y @kamo/mcp@0.1.0 --dir /Users/ana/Kamo/projects')
  })

  it('quotes folders with spaces and goes through cmd on Windows', () => {
    expect(
      claudeCommand({
        platform: 'windows',
        projectsDir: 'C:\\Users\\Ana Lima\\Kamo\\projects',
        mcpVersion: '0.1.0-beta.1',
      }),
    ).toBe(
      'claude mcp add kamo -- cmd /c npx -y @kamo/mcp@0.1.0-beta.1 --dir "C:\\Users\\Ana Lima\\Kamo\\projects"',
    )
  })

  it('runs a development build with Node when asked', () => {
    expect(
      claudeCommand(
        {
          platform: 'linux',
          projectsDir: '/home/ana/My Kamo',
          mcpVersion: '0.1.0',
          devServerPath: '/src/kamo/apps/mcp/dist/cli.js',
        },
        true,
      ),
    ).toBe('claude mcp add kamo -- node /src/kamo/apps/mcp/dist/cli.js --dir "/home/ana/My Kamo"')
  })

  it('never offers npx while the package is not on npm: only the development build', () => {
    const input = {
      platform: 'mac' as const,
      projectsDir: '/x',
      mcpVersion: null,
      devServerPath: '/src/kamo/apps/mcp/dist/cli.js',
    }
    expect(canUseNpx(input)).toBe(false)
    expect(claudeCommand(input)).toBe(
      'claude mcp add kamo -- node /src/kamo/apps/mcp/dist/cli.js --dir /x',
    )
    expect(canUseNpx({ platform: 'mac', projectsDir: '/x', mcpVersion: '0.1.0' })).toBe(true)
  })

  it('quotes a Windows folder with % so cmd does not expand it', () => {
    expect(
      claudeCommand({ platform: 'windows', projectsDir: 'C:\\%TEMP%', mcpVersion: '1.0.0' }),
    ).toBe('claude mcp add kamo -- cmd /c npx -y @kamo/mcp@1.0.0 --dir "C:\\%TEMP%"')
  })
})

describe('shellQuote', () => {
  it('uses single quotes when double quotes would expand', () => {
    expect(shellQuote('/Users/ana/$weird', 'mac')).toBe("'/Users/ana/$weird'")
    expect(shellQuote("/Users/ana/it's $x", 'mac')).toBe("'/Users/ana/it'\\''s $x'")
  })

  it("uses PowerShell's single quotes on Windows when the folder has $ or a backtick", () => {
    expect(shellQuote('C:\\Kamo projects', 'windows')).toBe('"C:\\Kamo projects"')
    expect(shellQuote('C:\\Kamo $(x)', 'windows')).toBe("'C:\\Kamo $(x)'")
    expect(shellQuote("C:\\Ana's `x`", 'windows')).toBe("'C:\\Ana''s `x`'")
  })
})

describe('unsafeForCmd', () => {
  it('flags Windows folders cmd /c would parse again', () => {
    expect(unsafeForCmd('C:\\Users\\ana\\Kamo', 'windows')).toBe(false)
    for (const path of ['C:\\a&b', 'C:\\%x%', 'C:\\a|b', 'C:\\a^b', 'C:\\a<b>']) {
      expect(unsafeForCmd(path, 'windows')).toBe(true)
    }
    expect(unsafeForCmd('/Users/a&b', 'mac')).toBe(false)
  })
})

describe('mcpClientJson', () => {
  it('is valid JSON with the folder escaped and the version pinned', () => {
    const json = mcpClientJson({
      platform: 'windows',
      projectsDir: 'C:\\Users\\ana\\Kamo',
      mcpVersion: '0.1.0',
    })
    expect(JSON.parse(json)).toEqual({
      mcpServers: {
        kamo: {
          command: 'cmd',
          args: ['/c', 'npx', '-y', '@kamo/mcp@0.1.0', '--dir', 'C:\\Users\\ana\\Kamo'],
        },
      },
    })
    expect(
      JSON.parse(mcpClientJson({ platform: 'mac', projectsDir: '/x', mcpVersion: '0.1.0' }))
        .mcpServers.kamo,
    ).toEqual({
      command: 'npx',
      args: ['-y', '@kamo/mcp@0.1.0', '--dir', '/x'],
    })
  })
})
