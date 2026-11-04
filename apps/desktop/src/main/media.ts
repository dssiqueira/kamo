// `kamo-media://project/<id>/<path>`: lets the sandboxed renderer show project videos and
// thumbnails without file:// access. Serves only media files inside the projects folder,
// with HTTP Range support so <video> can seek. The renderer CSP allows this scheme only in
// img-src and media-src (electron.vite.config.ts).
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative } from 'node:path'
import { Readable } from 'node:stream'
import { resolveInProject } from './storage/paths.ts'

export const MEDIA_SCHEME = 'kamo-media'
const PROJECT_HOST = 'project'

/** Only what the UI shows; never project.json, events or in-progress files. */
export const MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/** URL the renderer uses for a project file, e.g. `frames/0000.jpg`. */
export function mediaUrl(projectId: string, path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `${MEDIA_SCHEME}://${PROJECT_HOST}/${encodeURIComponent(projectId)}/${encoded}`
}

/**
 * Maps a `kamo-media:` URL to an absolute file inside `root`, or null when the URL is not a
 * project media file (wrong host, traversal, forbidden name or unknown type).
 */
export function resolveMediaPath(root: string, url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.hostname !== PROJECT_HOST) return null
  if (parsed.search || parsed.username || parsed.password || parsed.port) return null

  let segments: string[]
  try {
    segments = parsed.pathname.split('/').slice(1).map(decodeURIComponent)
  } catch {
    return null
  }
  // An encoded separator would smuggle a second segment past the checks below.
  if (segments.some((segment) => segment.includes('/') || segment.includes('\\'))) return null
  const [projectId, ...rest] = segments
  if (!projectId || rest.length === 0) return null
  const path = rest.join('/')
  if (!(extname(path).toLowerCase() in MEDIA_TYPES)) return null
  try {
    return resolveInProject(root, projectId, path)
  } catch {
    return null
  }
}

export type ByteRange = { start: number; end: number }

/**
 * Parses a single-range `Range` header (RFC 9110) for a file of `size` bytes.
 * - `null`: no usable range (absent, malformed, several ranges): serve the whole file (200)
 * - `'unsatisfiable'`: answer 416
 * - a range with inclusive `end`
 */
export function parseRange(
  header: string | null,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, from = '', to = ''] = match
  if (from === '' && to === '') return null

  if (from === '') {
    // Suffix range: the last N bytes.
    const length = Number(to)
    if (length === 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - length), end: size - 1 }
  }
  const start = Number(from)
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1)
  if (to !== '' && Number(to) < start) return null
  if (start >= size) return 'unsatisfiable'
  return { start, end }
}

function isInside(root: string, file: string): boolean {
  const rel = relative(root, file)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

const notFound = () => new Response(null, { status: 404 })

/** Serves one request; `root` is the projects folder. */
export async function serveMedia(request: Request, root: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  }
  const file = resolveMediaPath(root, request.url)
  if (!file) return notFound()

  let size: number
  let realFile: string
  try {
    // A link inside a project must not point outside the projects folder.
    const realRoot = await realpath(root)
    realFile = await realpath(file)
    if (!isInside(realRoot, realFile)) return notFound()
    const stats = await stat(realFile)
    if (!stats.isFile()) return notFound()
    size = stats.size
  } catch {
    return notFound()
  }

  const headers = new Headers({
    'Content-Type': MEDIA_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  const range = parseRange(request.headers.get('Range'), size)
  if (range === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }

  const { start, end } = range ?? { start: 0, end: size - 1 }
  const length = size === 0 ? 0 : end - start + 1
  headers.set('Content-Length', String(length))
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  const status = range ? 206 : 200
  if (request.method === 'HEAD' || length === 0) return new Response(null, { status, headers })

  const stream = Readable.toWeb(createReadStream(realFile, { start, end })) as ReadableStream
  return new Response(stream, { status, headers })
}
