// What ties an interrupted recording to its microphone, computer-sound and camera takes.
//
// The audio and the camera are recorded by hidden pages into temp folders of their own
// (userData/recording-audio/<id>/ and recording-camera/<id>/, D-024, A-03), and a clean stop
// moves them into the project. A crash of main leaves them there, so:
// - each take folder gets a `take.json` as its tracks start: mime type, start time and size,
//   everything recovery needs to place the file on the video timeline;
// - the project's recording marker gets a `media` link: the take folder ids and the moment the
//   first video frame was confirmed (video time 0).
// Recovery (interrupted.ts) follows the link, checks the files and attaches what plays.
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { isValidProjectId } from './storage/paths.ts'

/** Folder names under userData (temp takes; nothing there is kept once attached). */
export const AUDIO_TEMP_FOLDER = 'recording-audio'
export const CAMERA_TEMP_FOLDER = 'recording-camera'

/** Written in each take folder as the recorder reports its tracks. */
export const TAKE_FILE = 'take.json'

/**
 * Take folders left by a crash are kept this long for recovery (Home offers the recording on
 * the next launch); recovering or discarding the recording removes them sooner.
 */
export const TAKE_KEEP_MS = 14 * 24 * 60 * 60 * 1000

const Time = z.number().int().positive()
const Mime = z.string().max(128)
const Size = z.number().int().nonnegative().max(16_384)

const AudioTakeInfoSchema = z.object({
  tracks: z.object({
    mic: z.object({ startedAt: Time, mimeType: Mime }).optional(),
    system: z.object({ startedAt: Time, mimeType: Mime }).optional(),
  }),
})
export type AudioTakeInfo = z.infer<typeof AudioTakeInfoSchema>

const CameraTakeInfoSchema = z.object({
  startedAt: Time,
  mimeType: Mime,
  width: Size,
  height: Size,
})
export type CameraTakeInfo = z.infer<typeof CameraTakeInfoSchema>

/** The `media` field of the recording marker. */
const MediaLinkSchema = z.object({
  videoStartedAt: Time,
  audio: z.string().refine(isValidProjectId).optional(),
  camera: z.string().refine(isValidProjectId).optional(),
})
export type MediaLink = z.infer<typeof MediaLinkSchema>

/** Writes the take's description (small, rewritten whole; a torn write only costs recovery). */
export async function writeTakeInfo(dir: string, info: AudioTakeInfo | CameraTakeInfo) {
  await writeFile(join(dir, TAKE_FILE), JSON.stringify(info))
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
    return null
  }
}

export async function readAudioTakeInfo(dir: string): Promise<AudioTakeInfo | null> {
  const result = AudioTakeInfoSchema.safeParse(await readJson(join(dir, TAKE_FILE)))
  return result.success ? result.data : null
}

export async function readCameraTakeInfo(dir: string): Promise<CameraTakeInfo | null> {
  const result = CameraTakeInfoSchema.safeParse(await readJson(join(dir, TAKE_FILE)))
  return result.success ? result.data : null
}

/** The marker's `media` field, or null when it has none (older marker, or no audio/camera). */
export function parseMediaLink(marker: unknown): MediaLink | null {
  if (!marker || typeof marker !== 'object' || !('media' in marker)) return null
  const result = MediaLinkSchema.safeParse((marker as { media: unknown }).media)
  return result.success ? result.data : null
}

/** A take folder id from a link (always a UUID, never a path). */
export function takeDir(root: string, id: string): string {
  if (!isValidProjectId(id)) throw new Error('invalid take id')
  return join(root, id)
}

/**
 * Removes take folders older than `keepMs` (by modification time). Recent ones may belong to
 * an interrupted recording that Home still offers; never throws.
 */
export async function pruneTakes(root: string, keepMs = TAKE_KEEP_MS, now = Date.now()) {
  await mkdir(root, { recursive: true }).catch(() => {})
  const names = await readdir(root).catch(() => [] as string[])
  await Promise.all(
    names.map(async (name) => {
      const path = join(root, name)
      const info = await stat(path).catch(() => null)
      if (!info || now - info.mtimeMs < keepMs) return
      await rm(path, { recursive: true, force: true }).catch(() => {})
    }),
  )
}
