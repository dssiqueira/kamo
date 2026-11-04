import { describe, expect, it } from 'vitest'
import { sendTo, type SendTarget } from './safe-send.ts'

function target({
  window = false,
  contents = false,
  throws = false,
}: { window?: boolean; contents?: boolean; throws?: boolean } = {}) {
  const sent: unknown[][] = []
  const value: SendTarget = {
    isDestroyed: () => window,
    get webContents() {
      // Electron throws "Object has been destroyed" when a destroyed window is touched.
      if (window) throw new Error('Object has been destroyed')
      return {
        isDestroyed: () => contents,
        send: (channel: string, ...args: unknown[]) => {
          if (throws) throw new Error('Object has been destroyed')
          sent.push([channel, ...args])
        },
      }
    },
  }
  return { value, sent }
}

describe('sendTo', () => {
  it('sends to a live window', () => {
    const { value, sent } = target()
    expect(sendTo(value, 'kamo:status', { a: 1 })).toBe(true)
    expect(sent).toEqual([['kamo:status', { a: 1 }]])
  })

  it('skips a missing or destroyed window without throwing', () => {
    expect(sendTo(undefined, 'kamo:status')).toBe(false)
    expect(sendTo(null, 'kamo:status')).toBe(false)
    expect(sendTo(target({ window: true }).value, 'kamo:status')).toBe(false)
  })

  it('skips a window whose page is already gone (closing, quitting)', () => {
    const { value, sent } = target({ contents: true })
    expect(sendTo(value, 'kamo:status')).toBe(false)
    expect(sent).toEqual([])
  })

  it('swallows a page destroyed between the check and the send', () => {
    expect(sendTo(target({ throws: true }).value, 'kamo:status')).toBe(false)
  })
})
