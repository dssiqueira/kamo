// Upper bounds on the bytes Kamo's own recorder, decoder and export pages hand to main in one
// IPC call (L12). Those pages are sender-checked, so this only matters if one of them were
// compromised: it then cannot fill the disk in one call or make a huge sparse file. Real calls
// are far below: MediaRecorder slices of a second or two, 4MB export chunks, one GIF frame.
export const MAX_IPC_CHUNK_BYTES = 64 * 1024 * 1024

/** Export files are written at positions up to this size (256 GiB, hours of 4K60). */
export const MAX_EXPORT_POSITION = 2 ** 38

/** Throws unless `bytes` is a Uint8Array no bigger than MAX_IPC_CHUNK_BYTES. */
export function assertChunk(bytes: unknown, what: string): asserts bytes is Uint8Array {
  if (!(bytes instanceof Uint8Array)) throw new Error(`${what} must be bytes`)
  if (bytes.byteLength > MAX_IPC_CHUNK_BYTES) throw new Error(`${what} is too big`)
}
