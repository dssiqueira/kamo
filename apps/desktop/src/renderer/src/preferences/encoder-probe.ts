// F-17: whether this machine has a hardware H.264 encoder for the export (1080p30). Asked from a
// renderer because WebCodecs lives there; main only gets the yes/no for the diagnostics text.
const CONFIG: VideoEncoderConfig = {
  codec: 'avc1.640028',
  width: 1920,
  height: 1080,
  framerate: 30,
  bitrate: 8_000_000,
  hardwareAcceleration: 'prefer-hardware',
}

/** True/false from WebCodecs; null when it cannot be asked (no WebCodecs, or it threw). */
export async function probeHardwareH264(): Promise<boolean | null> {
  if (typeof VideoEncoder === 'undefined') return null
  try {
    const support = await VideoEncoder.isConfigSupported(CONFIG)
    return support.supported === true
  } catch {
    return null
  }
}
