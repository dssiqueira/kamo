import {
  CAPTION_PRESETS,
  type CaptionPosition,
  type CaptionPreset,
  type Transcript,
} from '@kamo/core'
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { captionSample, paintCaptionThumbnail, thumbnailFonts } from './caption-gallery.ts'

const PRESET_KEY: Record<CaptionPreset, string> = {
  clean: 'editor.captions.clean',
  bold: 'editor.captions.bold',
  kamo: 'editor.captions.kamo',
  minimal: 'editor.captions.minimal',
  soft: 'editor.captions.soft',
  neon: 'editor.captions.neon',
  typewriter: 'editor.captions.typewriter',
  caps: 'editor.captions.caps',
  cinema: 'editor.captions.cinema',
  marker: 'editor.captions.marker',
  classic: 'editor.captions.classic',
  duo: 'editor.captions.duo',
}

/** Columns of the grid (arrow up and down move by a row). */
const COLUMNS = 3
/** Thumbnails repaint this long after the playhead or the sample stops changing. */
const REPAINT_MS = 160

export interface CaptionStyleGalleryProps {
  value: CaptionPreset
  onChange(preset: CaptionPreset): void
  disabled: boolean
  transcript: Transcript | null
  /** where the captions sit: the thumbnails show that part of the video */
  position: CaptionPosition
  /** the editor's video, at the playhead; missing: a plain backdrop */
  video?: RefObject<HTMLVideoElement | null> | undefined
  /** the playhead, ms of video time */
  timeMs?: number | undefined
}

/**
 * The caption styles as a gallery (A-06): one thumbnail per preset, painted by the core
 * renderer over the video at the playhead with the start of the caption there (a sample
 * sentence without speech). A radio group: arrows move and pick, Home and End jump.
 */
export function CaptionStyleGallery({
  value,
  onChange,
  disabled,
  transcript,
  position,
  video,
  timeMs = 0,
}: CaptionStyleGalleryProps) {
  const t = useT()
  const locale = useLocale()
  const canvases = useRef(new Map<CaptionPreset, HTMLCanvasElement>())
  const buttons = useRef(new Map<CaptionPreset, HTMLButtonElement>())
  const fallback = t('editor.captions.sample')
  const text = captionSample(transcript, timeMs, fallback)
  const language = transcript && text !== fallback ? transcript.language : locale
  // A new frame comes with a seek or once the video has data; the thumbnails follow it.
  const [frameTick, setFrameTick] = useState(0)

  useEffect(() => {
    const element = video?.current
    if (!element) return
    const bump = () => setFrameTick((n) => n + 1)
    element.addEventListener('seeked', bump)
    element.addEventListener('loadeddata', bump)
    return () => {
      element.removeEventListener('seeked', bump)
      element.removeEventListener('loadeddata', bump)
    }
  }, [video])

  const frameKey = Math.round(timeMs / 40)
  useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      const fonts = typeof document !== 'undefined' ? document.fonts : undefined
      const loads = fonts
        ? thumbnailFonts(CAPTION_PRESETS, language).map((font) => fonts.load(font).catch(() => []))
        : []
      void Promise.all(loads).then(() => {
        if (!live) return
        for (const preset of CAPTION_PRESETS) {
          const canvas = canvases.current.get(preset)
          if (!canvas) continue
          const ratio = window.devicePixelRatio || 1
          const width = Math.round(canvas.clientWidth * ratio)
          const height = Math.round(canvas.clientHeight * ratio)
          if (canvas.width !== width) canvas.width = width
          if (canvas.height !== height) canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          paintCaptionThumbnail(ctx, {
            preset,
            text,
            language,
            video: video?.current ?? null,
            position,
          })
        }
      })
    }, REPAINT_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [text, language, position, frameKey, frameTick, video])

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: CaptionPreset) => {
    const i = CAPTION_PRESETS.indexOf(from)
    const last = CAPTION_PRESETS.length - 1
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: COLUMNS,
      ArrowLeft: -1,
      ArrowUp: -COLUMNS,
    }
    let next: number
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else if (event.key in step) next = Math.max(0, Math.min(last, i + (step[event.key] ?? 0)))
    else return
    event.preventDefault()
    const preset = CAPTION_PRESETS[next] as CaptionPreset
    if (preset === from) return
    onChange(preset)
    buttons.current.get(preset)?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('editor.captions.style')}
      aria-disabled={disabled || undefined}
      className="flex flex-col gap-xs"
      data-testid="captions-gallery"
    >
      <span className="text-body">{t('editor.captions.style')}</span>
      <div className={`grid grid-cols-3 gap-xs ${disabled ? 'opacity-50' : ''}`}>
        {CAPTION_PRESETS.map((preset) => {
          const selected = value === preset
          return (
            <button
              key={preset}
              ref={(el) => {
                if (el) buttons.current.set(preset, el)
                else buttons.current.delete(preset)
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              data-testid={`captions-preset-${preset}`}
              onClick={() => onChange(preset)}
              onKeyDown={(event) => move(event, preset)}
              className={`group flex min-w-0 flex-col gap-[3px] rounded-md p-[3px] text-start transition-colors duration-[120ms] ${FOCUS_RING} ${
                selected ? 'bg-tertiary-container' : 'hover:bg-surface-raised'
              }`}
            >
              <span
                className={`block overflow-hidden rounded-sm border-[1.5px] ${
                  selected ? 'border-tertiary' : 'border-transparent'
                }`}
              >
                <canvas
                  ref={(el) => {
                    if (el) canvases.current.set(preset, el)
                    else canvases.current.delete(preset)
                  }}
                  aria-hidden
                  className="block aspect-[16/10] w-full bg-[#1A1D1B]"
                />
              </span>
              <span
                className={`truncate px-[2px] text-label ${
                  selected ? 'text-on-surface' : 'text-on-surface-muted'
                }`}
              >
                {t(PRESET_KEY[preset])}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
