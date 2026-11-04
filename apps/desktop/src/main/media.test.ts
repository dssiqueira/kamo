import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mediaUrl, parseRange, resolveMediaPath, serveMedia } from './media.ts'

describe('parseRange', () => {
  it('serves the whole file without a usable range', () => {
    for (const header of [
      null,
      '',
      'bytes=',
      'bytes=-',
      'items=0-1',
      'bytes=0-1,4-5',
      'bytes=5-2',
    ]) {
      expect(parseRange(header, 100)).toBeNull()
    }
  })

  it('parses closed, open and suffix ranges', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 })
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 })
  })

  it('clamps the end to the file size', () => {
    expect(parseRange('bytes=50-1000', 100)).toEqual({ start: 50, end: 99 })
  })

  it('reports ranges past the end as unsatisfiable', () => {
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable')
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable')
    expect(parseRange('bytes=0-', 0)).toBe('unsatisfiable')
  })
})

describe('resolveMediaPath', () => {
  const root = join(tmpdir(), 'kamo-root')
  const id = '3f1c2b9e-1111-4222-8333-944455556666'

  it('maps project media URLs into the project folder', () => {
    expect(resolveMediaPath(root, mediaUrl(id, 'screen.mp4'))).toBe(join(root, id, 'screen.mp4'))
    expect(resolveMediaPath(root, mediaUrl(id, 'frames/0000.jpg'))).toBe(
      join(root, id, 'frames', '0000.jpg'),
    )
  })

  it('rejects traversal, encoded separators and other hosts', () => {
    for (const url of [
      `kamo-media://project/${id}/../../secret.mp4`,
      `kamo-media://project/${id}/frames/..%2F..%2Fsecret.jpg`,
      `kamo-media://project/${id}/%2e%2e/x.jpg`,
      `kamo-media://project/..%2F..%2Fx/screen.mp4`,
      `kamo-media://project/${id}/frames%5C0000.jpg`,
      `kamo-media://project/${id}/C:%2Fx.jpg`,
      `kamo-media://other/${id}/screen.mp4`,
      `kamo-media://project/${id}`,
      `kamo-media://project/${id}/screen.mp4?x=1`,
      `file:///${id}/screen.mp4`,
      `kamo-media://project/%E0%A4%A/screen.mp4`,
      'not a url',
    ]) {
      expect(resolveMediaPath(root, url), url).toBeNull()
    }
  })

  it('serves only media types, never project.json or in-progress files', () => {
    for (const path of ['project.json', 'events.jsonl', 'screen.mp4.partial', 'recording.lock']) {
      expect(resolveMediaPath(root, mediaUrl(id, path)), path).toBeNull()
    }
  })
})

describe('serveMedia', () => {
  let dir: string
  let root: string
  const id = 'p1'
  const bytes = Buffer.from('0123456789')

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kamo-media-'))
    root = join(dir, 'projects')
    await mkdir(join(root, id, 'frames'), { recursive: true })
    await writeFile(join(root, id, 'screen.mp4'), bytes)
    await writeFile(join(root, id, 'frames', '0000.jpg'), 'jpg')
    await writeFile(join(dir, 'outside.jpg'), 'secret')
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
    serveMedia(new Request(mediaUrl(id, path), { method, headers }), root)

  it('serves the whole file with its type', async () => {
    const response = await get('screen.mp4')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('video/mp4')
    expect(response.headers.get('Content-Length')).toBe('10')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(await response.text()).toBe('0123456789')
  })

  it('answers range requests with 206', async () => {
    const response = await get('screen.mp4', { Range: 'bytes=2-5' })
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(await response.text()).toBe('2345')
  })

  it('answers 416 for a range past the end', async () => {
    const response = await get('screen.mp4', { Range: 'bytes=10-' })
    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */10')
  })

  it('answers HEAD without a body', async () => {
    const response = await get('frames/0000.jpg', {}, 'HEAD')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Content-Length')).toBe('3')
    expect(response.body).toBeNull()
  })

  it('answers 404 for missing files and folders, 405 for writes', async () => {
    expect((await get('frames/0005.jpg')).status).toBe(404)
    expect((await serveMedia(new Request(mediaUrl('nope', 'screen.mp4')), root)).status).toBe(404)
    expect((await get('screen.mp4', {}, 'POST')).status).toBe(405)
  })

  it('does not follow links out of the projects folder', async () => {
    try {
      await symlink(join(dir, 'outside.jpg'), join(root, id, 'frames', 'link.jpg'))
    } catch {
      return // creating symlinks needs a privilege on Windows
    }
    expect((await get('frames/link.jpg')).status).toBe(404)
  })
})
