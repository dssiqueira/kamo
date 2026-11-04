import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_BACKGROUND_IMAGE_BYTES } from '@kamo/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BackgroundImageError,
  importBackgroundImage,
  pruneBackgroundImages,
} from './background-image.ts'
import { isExportMediaFile, mediaSize } from './export-media.ts'

const PROJECT = '5daa8b40-b93d-48bb-af08-7c43450dc41c'
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9])

let root: string
let projectDir: string
let outside: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kamo-background-'))
  projectDir = join(root, 'projects', PROJECT)
  outside = join(root, 'Pictures')
  await mkdir(projectDir, { recursive: true })
  await mkdir(outside, { recursive: true })
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: unknown) => (error instanceof BackgroundImageError ? error.code : String(error)),
  )

describe('importBackgroundImage', () => {
  it('copies the image into the project, so deleting the original changes nothing', async () => {
    const original = join(outside, 'wall.png')
    await writeFile(original, PNG)
    const name = await importBackgroundImage(projectDir, original)
    expect(name).toMatch(/^background-[0-9a-f]{16}\.png$/)
    await rm(original)
    expect(new Uint8Array(await readFile(join(projectDir, name)))).toEqual(PNG)
    // No temp file left behind.
    expect(await readdir(projectDir)).toEqual([name])
  })

  it('names the copy by its real type, whatever the extension says', async () => {
    const original = join(outside, 'photo.webp')
    await writeFile(original, JPEG)
    expect(await importBackgroundImage(projectDir, original)).toMatch(/\.jpg$/)
  })

  it('reuses the copy when the same image is picked again, and adds a new one otherwise', async () => {
    await writeFile(join(outside, 'a.png'), PNG)
    await writeFile(join(outside, 'b.jpg'), JPEG)
    const a = await importBackgroundImage(projectDir, join(outside, 'a.png'))
    expect(await importBackgroundImage(projectDir, join(outside, 'a.png'))).toBe(a)
    const b = await importBackgroundImage(projectDir, join(outside, 'b.jpg'))
    expect(b).not.toBe(a)
    expect((await readdir(projectDir)).sort()).toEqual([a, b].sort())
  })

  it('refuses what is not a PNG, JPEG or WebP, too big, or unreadable', async () => {
    await writeFile(join(outside, 'fake.png'), 'GIF89a not really a png')
    expect(await code(importBackgroundImage(projectDir, join(outside, 'fake.png')))).toBe(
      'image_unsupported',
    )
    await writeFile(join(outside, 'empty.png'), '')
    expect(await code(importBackgroundImage(projectDir, join(outside, 'empty.png')))).toBe(
      'image_unsupported',
    )
    const big = new Uint8Array(MAX_BACKGROUND_IMAGE_BYTES + 1)
    big.set(PNG)
    await writeFile(join(outside, 'big.png'), big)
    expect(await code(importBackgroundImage(projectDir, join(outside, 'big.png')))).toBe(
      'image_too_big',
    )
    expect(await code(importBackgroundImage(projectDir, join(outside, 'missing.png')))).toBe(
      'image_unreadable',
    )
    expect(await code(importBackgroundImage(projectDir, outside))).toBe('image_unreadable')
    expect(await readdir(projectDir)).toEqual([])
  })
})

describe('pruneBackgroundImages', () => {
  it('deletes the other background images and nothing else', async () => {
    const keep = 'background-00000000aaaaaaaa.png'
    for (const name of [keep, 'background-11111111bbbbbbbb.jpg', 'screen.mp4', 'project.json']) {
      await writeFile(join(projectDir, name), 'x')
    }
    expect(await pruneBackgroundImages(projectDir, keep)).toEqual([
      'background-11111111bbbbbbbb.jpg',
    ])
    expect((await readdir(projectDir)).sort()).toEqual([keep, 'project.json', 'screen.mp4'])
    await pruneBackgroundImages(projectDir, null)
    expect((await readdir(projectDir)).sort()).toEqual(['project.json', 'screen.mp4'])
  })
})

describe('export media', () => {
  it('lets the export read a background image by its name only', async () => {
    const name = 'background-0123456789abcdef.webp'
    await writeFile(join(projectDir, name), 'webp')
    expect(isExportMediaFile(name)).toBe(true)
    expect(await mediaSize(join(root, 'projects'), PROJECT, name)).toBe(4)
    expect(isExportMediaFile('background.png')).toBe(false)
    expect(isExportMediaFile('../background-0123456789abcdef.webp')).toBe(false)
    await expect(mediaSize(join(root, 'projects'), PROJECT, 'project.json')).rejects.toThrow()
  })
})
