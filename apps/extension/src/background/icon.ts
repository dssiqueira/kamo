// Toolbar icon. Recording: a small coral dot (flows.md step 4), drawn here so the extension
// ships no extra image; muted grey while paused. Otherwise, Kamo's own icon.

const IDLE_ICON = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' }
const SIZES = [16, 32] as const

let current: string | null = null

function dot(size: number, color: string): ImageData {
  const canvas = new OffscreenCanvas(size, size)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2d context unavailable')
  context.fillStyle = color
  context.beginPath()
  context.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2)
  context.fill()
  return context.getImageData(0, 0, size, size)
}

/** `pausedColor` replaces the coral while the recording is paused. */
export async function setRecordingIcon(color: string, pausedColor: string | null): Promise<void> {
  const fill = pausedColor ?? color
  if (current === fill) return
  current = fill
  const imageData = Object.fromEntries(SIZES.map((size) => [size, dot(size, fill)]))
  await chrome.action.setIcon({ imageData })
}

export async function setIdleIcon(): Promise<void> {
  if (current === 'idle') return
  current = 'idle'
  await chrome.action.setIcon({ path: IDLE_ICON })
}
