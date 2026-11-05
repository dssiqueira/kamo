// Uploads the extension zip to the Chrome Web Store and submits it for review (release
// workflow, step 15). Uses the official Chrome Web Store API v2 with plain fetch: no
// third-party action ever sees the OAuth refresh token.
//
// Usage: node scripts/chrome-web-store.ts <extension.zip>
// Env: CWS_PUBLISHER_ID, CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN
// (docs/release-checklist.md → Secrets says how to get them).
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

const API = 'https://chromewebstore.googleapis.com'

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

async function accessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('CWS_CLIENT_ID'),
      client_secret: env('CWS_CLIENT_SECRET'),
      refresh_token: env('CWS_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  })
  const body = (await response.json()) as { access_token?: string; error?: string }
  if (!response.ok || !body.access_token) {
    throw new Error(`OAuth token refresh failed (${response.status}): ${body.error ?? 'no token'}`)
  }
  return body.access_token
}

async function call(token: string, method: string, url: string, body?: Uint8Array | string) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(typeof body === 'string' ? { 'content-type': 'application/json' } : {}),
    },
    ...(body === undefined ? {} : { body }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${url} → ${response.status}: ${text}`)
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>
}

async function main(): Promise<void> {
  const zip = process.argv[2]
  if (!zip) throw new Error('usage: node scripts/chrome-web-store.ts <extension.zip>')
  const item = `publishers/${env('CWS_PUBLISHER_ID')}/items/${env('CWS_EXTENSION_ID')}`
  const token = await accessToken()

  const upload = await call(token, 'POST', `${API}/upload/v2/${item}:upload`, readFileSync(zip))
  console.log('upload:', JSON.stringify(upload))
  let state = String(upload['uploadState'] ?? '')
  // Big packages are processed asynchronously: wait for the store to finish.
  for (let attempt = 0; state === 'IN_PROGRESS' && attempt < 24; attempt++) {
    await sleep(5000)
    const status = await call(token, 'GET', `${API}/v2/${item}:fetchStatus`)
    state = String(status['lastAsyncUploadState'] ?? status['uploadState'] ?? '')
    console.log('status:', JSON.stringify(status))
  }
  if (state !== 'SUCCEEDED')
    throw new Error(`upload did not succeed (state: ${state || 'unknown'})`)

  const published = await call(token, 'POST', `${API}/v2/${item}:publish`, '{}')
  console.log('publish:', JSON.stringify(published))
  console.log('Submitted for review. Track it in the Chrome Web Store developer dashboard.')
}

main().catch((error: unknown) => {
  console.error(`::error::Chrome Web Store: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
})
