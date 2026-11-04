import { createRenderer, sceneFrame, type Aspect, type Renderer, type Scene } from '@kamo/core'
import { useEffect, useRef } from 'react'

export interface FormatPreviewProps {
  scene: Scene
  aspect: Aspect
  /** the editor's video element, parked on the current frame */
  video: HTMLVideoElement | null
  /** raw video time of that frame */
  timeMs: number
  /** CSS size of the preview box */
  width: number
  height: number
}

/**
 * A small live render of the current frame in one format, with the same renderer and the
 * same scene as the preview and the export (rule 11): 1:1 shows the camera crop it will
 * really export.
 */
export function FormatPreview({ scene, aspect, video, timeMs, width, height }: FormatPreviewProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const renderer = useRef<Renderer | null>(null)
  const ratio = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1)
  const pixelWidth = Math.round(width * ratio)
  const pixelHeight = Math.round(height * ratio)

  useEffect(() => {
    if (!video) return
    const draw = () => {
      const ctx = canvas.current?.getContext('2d')
      if (!ctx || video.readyState < 2) return
      renderer.current ??= createRenderer(ctx)
      renderer.current.render(
        sceneFrame(scene, video, aspect, { width: pixelWidth, height: pixelHeight }, timeMs),
      )
    }
    draw()
    video.addEventListener('loadeddata', draw)
    video.addEventListener('seeked', draw)
    return () => {
      video.removeEventListener('loadeddata', draw)
      video.removeEventListener('seeked', draw)
    }
  }, [scene, aspect, video, timeMs, pixelWidth, pixelHeight])

  return (
    <canvas
      ref={canvas}
      width={pixelWidth}
      height={pixelHeight}
      aria-hidden
      className="rounded-sm bg-surface-raised"
      style={{ width, height }}
    />
  )
}
