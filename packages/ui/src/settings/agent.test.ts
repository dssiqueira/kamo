import { describe, expect, it } from 'vitest'
import { claudeCommand, mcpClientJson, shellQuote } from './agent.ts'

describe('claudeCommand', () => {
  it('passes the projects folder on Mac', () => {
    expect(claudeCommand({ platform: 'mac', projectsDir: '/Users/ana/Kamo/projects' })).toBe(
      'claude mcp add kamo -- npx -y @kamo/mcp --dir /Users/ana/Kamo/projects',
    )
  })

  it('quotes folders with spaces and goes through cmd on Windows', () => {
    expect(
      claudeCommand({ platform: 'windows', projectsDir: 'C:\\Users\\Ana Lima\\Kamo\\projects' }),
    ).toBe(
      'claude mcp add kamo -- cmd /c npx -y @kamo/mcp --dir "C:\\Users\\Ana Lima\\Kamo\\projects"',
    )
  })

  it('runs a development build with Node when asked', () => {
    expect(
      claudeCommand(
        {
          platform: 'linux',
          projectsDir: '/home/ana/My Kamo',
          devServerPath: '/src/kamo/apps/mcp/dist/cli.js',
        },
        true,
      ),
    ).toBe('claude mcp add kamo -- node /src/kamo/apps/mcp/dist/cli.js --dir "/home/ana/My Kamo"')
  })
})

describe('shellQuote', () => {
  it('uses single quotes when double quotes would expand', () => {
    expect(shellQuote('/Users/ana/$weird', 'mac')).toBe("'/Users/ana/$weird'")
    expect(shellQuote("/Users/ana/it's $x", 'mac')).toBe("'/Users/ana/it'\\''s $x'")
    expect(shellQuote('C:\\Kamo $x', 'windows')).toBe('"C:\\Kamo $x"')
  })
})

describe('mcpClientJson', () => {
  it('is valid JSON with the folder escaped', () => {
    const json = mcpClientJson({ platform: 'windows', projectsDir: 'C:\\Users\\ana\\Kamo' })
    expect(JSON.parse(json)).toEqual({
      mcpServers: {
        kamo: {
          command: 'cmd',
          args: ['/c', 'npx', '-y', '@kamo/mcp', '--dir', 'C:\\Users\\ana\\Kamo'],
        },
      },
    })
    expect(
      JSON.parse(mcpClientJson({ platform: 'mac', projectsDir: '/x' })).mcpServers.kamo,
    ).toEqual({
      command: 'npx',
      args: ['-y', '@kamo/mcp', '--dir', '/x'],
    })
  })
})
