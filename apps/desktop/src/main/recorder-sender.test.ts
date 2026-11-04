import { describe, expect, it } from 'vitest'
import { acceptRecorderSender } from './recorder-sender.ts'

describe('acceptRecorderSender', () => {
  it('handles the current recorder page', () => {
    expect(acceptRecorderSender('current')).toBe(true)
  })

  it('drops the last messages of a recorder page that is already gone', () => {
    expect(acceptRecorderSender('stale')).toBe(false)
  })

  it('still rejects any other sender', () => {
    expect(() => acceptRecorderSender('foreign')).toThrow('Untrusted IPC sender')
  })
})
