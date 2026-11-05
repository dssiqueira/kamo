import { describe, expect, it } from 'vitest'
import { fromExtensionPage, fromPage, OFFSCREEN_PAGE, SERVICE_WORKER_PAGE } from './sender.ts'

const ID = 'abcdefghijklmnopabcdefghijklmnop'
const page = (path: string) => ({ id: ID, url: `chrome-extension://${ID}/${path}` })

describe('message senders (L5)', () => {
  it("accepts the extension's own pages and service worker", () => {
    expect(fromExtensionPage(page('popup.html'), ID)).toBe(true)
    expect(fromExtensionPage(page('permission.html?device=microphone'), ID)).toBe(true)
    expect(fromPage(page(OFFSCREEN_PAGE), OFFSCREEN_PAGE, ID)).toBe(true)
    expect(fromPage(page(SERVICE_WORKER_PAGE), SERVICE_WORKER_PAGE, ID)).toBe(true)
  })

  it('refuses the content script in a web page, other extensions and other pages', () => {
    // The content script has this extension's id but the recorded page's URL.
    expect(fromExtensionPage({ id: ID, url: 'https://example.com/' }, ID)).toBe(false)
    expect(fromExtensionPage({ id: 'other', url: 'chrome-extension://other/popup.html' }, ID)).toBe(
      false,
    )
    expect(fromExtensionPage({ id: ID, url: `chrome-extension://other/popup.html` }, ID)).toBe(
      false,
    )
    expect(fromExtensionPage({ id: ID }, ID)).toBe(false)
    expect(fromExtensionPage(undefined, ID)).toBe(false)
    expect(fromPage(page('popup.html'), OFFSCREEN_PAGE, ID)).toBe(false)
    expect(fromPage({ id: ID, url: 'https://x.test/offscreen.html' }, OFFSCREEN_PAGE, ID)).toBe(
      false,
    )
  })
})
