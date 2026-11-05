import { MAX_BACKGROUND_IMAGE_BYTES } from '@kamo/core'
import { describe, expect, it } from 'vitest'
import { checkBackgroundImage } from './background-image.ts'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])

describe('checkBackgroundImage (A-04 in the extension)', () => {
  it('names the copy after the type its bytes say and their hash, like the desktop', async () => {
    const result = await checkBackgroundImage(new Blob([PNG]))
    expect(result).toMatchObject({
      ok: true,
      name: expect.stringMatching(/^background-[0-9a-f]{16}\.png$/),
    })
    const again = await checkBackgroundImage(new Blob([PNG]))
    expect(again.ok && result.ok && again.name === result.name).toBe(true)
    const jpeg = await checkBackgroundImage(new File([JPEG], 'photo.png'))
    expect(jpeg).toMatchObject({ ok: true, name: expect.stringMatching(/\.jpg$/) })
  })

  it('refuses what is not a PNG, JPEG or WebP, and what is too big', async () => {
    expect(await checkBackgroundImage(new Blob(['GIF89a']))).toEqual({
      ok: false,
      code: 'unsupported',
    })
    expect(await checkBackgroundImage(new Blob([]))).toEqual({ ok: false, code: 'unsupported' })
    const big = { size: MAX_BACKGROUND_IMAGE_BYTES + 1 } as Blob
    expect(await checkBackgroundImage(big)).toEqual({ ok: false, code: 'too_big' })
  })
})
