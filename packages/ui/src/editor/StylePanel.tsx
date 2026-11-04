import {
  WALLPAPERS,
  drawWallpaper,
  type CursorSettings,
  type Style,
  type WebcamPatch,
  type WebcamPosition,
  type WebcamSettings,
  type WebcamSize,
} from '@kamo/core'
import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING, Switch } from '../primitives/controls.tsx'

export interface StylePanelProps {
  style: Style
  cursor: CursorSettings
  autoZoom: boolean
  noClicks: boolean
  onStyle(style: Style): void
  onCursor(cursor: CursorSettings): void
  onAutoZoom(on: boolean): void
  onRegenerate(): void
  /** null when recorded without the camera: the Webcam section is not shown (A-03) */
  webcam?: WebcamSettings | null
  onWebcam?(patch: WebcamPatch): void
}

/** Side panel (flows.md §5): background, padding, corners, shadow, cursor, zooms, webcam. */
export function StylePanel(props: StylePanelProps) {
  const { style, cursor, onStyle, onCursor } = props
  const t = useT()
  const solid = style.background.kind === 'color' ? style.background.value : '#FAF7F2'

  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-lg overflow-y-auto border-s border-border bg-surface p-md">
      <Section title={t('editor.panel.background')}>
        <div className="grid grid-cols-4 gap-sm">
          {WALLPAPERS.map((wallpaper) => {
            const selected =
              style.background.kind === 'preset' && style.background.value === wallpaper.id
            return (
              <button
                key={wallpaper.id}
                type="button"
                aria-label={t(wallpaper.labelKey)}
                aria-pressed={selected}
                title={t(wallpaper.labelKey)}
                onClick={() =>
                  onStyle({ ...style, background: { kind: 'preset', value: wallpaper.id } })
                }
                className={`aspect-square overflow-hidden rounded-md border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary ${
                  selected ? 'border-tertiary' : 'border-border'
                }`}
                style={{ backgroundColor: wallpaper.swatch }}
              >
                <WallpaperSwatch id={wallpaper.id} />
              </button>
            )
          })}
        </div>
        <label className="flex items-center justify-between gap-sm text-body">
          {t('editor.panel.color')}
          <input
            type="color"
            value={solid}
            onChange={(e) =>
              onStyle({
                ...style,
                background: { kind: 'color', value: e.target.value.toUpperCase() },
              })
            }
            className="h-[28px] w-[44px] cursor-pointer rounded-sm border border-border bg-surface"
          />
        </label>
      </Section>

      <Section title={t('editor.panel.frame')}>
        <Slider
          label={t('editor.panel.padding')}
          value={style.padding}
          min={0}
          max={20}
          step={1}
          onChange={(padding) => onStyle({ ...style, padding })}
        />
        <Slider
          label={t('editor.panel.corners')}
          value={style.radius}
          min={0}
          max={32}
          step={1}
          onChange={(radius) => onStyle({ ...style, radius })}
        />
        <Switch
          label={t('editor.panel.shadow')}
          checked={style.shadow}
          onChange={(shadow) => onStyle({ ...style, shadow })}
        />
      </Section>

      <Section title={t('editor.panel.cursor')}>
        <Slider
          label={t('editor.panel.cursorSize')}
          value={cursor.size}
          min={1}
          max={3}
          step={0.25}
          onChange={(size) => onCursor({ ...cursor, size })}
        />
        <Switch
          label={t('editor.panel.ripple')}
          checked={cursor.clickRipple}
          onChange={(clickRipple) => onCursor({ ...cursor, clickRipple })}
        />
        <Switch
          label={t('editor.panel.hideCursor')}
          checked={cursor.hidden}
          onChange={(hidden) => onCursor({ ...cursor, hidden })}
        />
      </Section>

      <Section title={t('editor.panel.zooms')}>
        <Switch
          label={t('editor.panel.autoZoom')}
          checked={props.autoZoom}
          onChange={props.onAutoZoom}
        />
        <button
          type="button"
          onClick={props.onRegenerate}
          className="rounded-md bg-surface-raised px-md py-sm text-body transition-colors duration-[120ms] hover:bg-border focus-visible:outline-2 focus-visible:outline-tertiary"
        >
          {t('editor.panel.regenerate')}
        </button>
        {props.noClicks && (
          <p className="text-label text-on-surface-muted">{t('editor.panel.noClicks')}</p>
        )}
      </Section>

      {props.webcam && props.onWebcam && (
        <WebcamSection webcam={props.webcam} onWebcam={props.onWebcam} />
      )}
    </aside>
  )
}

const WEBCAM_POSITIONS: readonly WebcamPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]
const WEBCAM_SIZES: readonly WebcamSize[] = ['small', 'medium', 'large']
const POSITION_KEY: Record<WebcamPosition, string> = {
  'top-left': 'editor.webcam.topLeft',
  'top-right': 'editor.webcam.topRight',
  'bottom-left': 'editor.webcam.bottomLeft',
  'bottom-right': 'editor.webcam.bottomRight',
}
const SIZE_KEY: Record<WebcamSize, string> = {
  small: 'editor.webcam.small',
  medium: 'editor.webcam.medium',
  large: 'editor.webcam.large',
}

/** Webcam bubble (A-03): on/off, corner, size and shrink on zoom. */
function WebcamSection({
  webcam,
  onWebcam,
}: {
  webcam: WebcamSettings
  onWebcam(patch: WebcamPatch): void
}) {
  const t = useT()
  const option = (selected: boolean) =>
    `rounded-md border text-label transition-colors duration-[120ms] disabled:opacity-50 ${FOCUS_RING} ${
      selected
        ? 'border-tertiary bg-tertiary-container text-on-surface'
        : 'border-border bg-surface text-on-surface-muted hover:bg-surface-raised'
    }`
  return (
    <Section title={t('editor.webcam.title')}>
      <Switch
        label={t('editor.webcam.show')}
        checked={webcam.visible}
        onChange={(visible) => onWebcam({ visible })}
      />
      <div
        role="radiogroup"
        aria-label={t('editor.webcam.position')}
        className="flex flex-col gap-xs"
      >
        <span className="text-body">{t('editor.webcam.position')}</span>
        <div className="grid w-[132px] grid-cols-2 gap-xs">
          {WEBCAM_POSITIONS.map((position) => {
            const selected = !webcam.anchor && webcam.position === position
            const [vertical, horizontal] = position.split('-')
            return (
              <button
                key={position}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={t(POSITION_KEY[position])}
                title={t(POSITION_KEY[position])}
                disabled={!webcam.visible}
                data-testid={`webcam-position-${position}`}
                onClick={() => onWebcam({ position })}
                className={`relative h-[40px] ${option(selected)}`}
              >
                <span
                  aria-hidden
                  className={`absolute size-[12px] rounded-full ${
                    selected ? 'bg-tertiary' : 'bg-border'
                  } ${vertical === 'top' ? 'top-[5px]' : 'bottom-[5px]'} ${
                    horizontal === 'left' ? 'left-[5px]' : 'right-[5px]'
                  }`}
                />
              </button>
            )
          })}
        </div>
        <span className="text-label text-on-surface-muted">{t('editor.webcam.dragHint')}</span>
      </div>
      <div role="radiogroup" aria-label={t('editor.webcam.size')} className="flex flex-col gap-xs">
        <span className="text-body">{t('editor.webcam.size')}</span>
        <div className="grid grid-cols-3 gap-xs">
          {WEBCAM_SIZES.map((size) => {
            const selected = webcam.size === size
            return (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!webcam.visible}
                data-testid={`webcam-size-${size}`}
                onClick={() => onWebcam({ size })}
                className={`px-sm py-xs ${option(selected)}`}
              >
                {t(SIZE_KEY[size])}
              </button>
            )
          })}
        </div>
      </div>
      <Switch
        label={t('editor.webcam.shrinkOnZoom')}
        checked={webcam.shrinkOnZoom}
        onChange={(shrinkOnZoom) => onWebcam({ shrinkOnZoom })}
      />
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-sm">
      <h2 className="text-title">{title}</h2>
      {children}
    </section>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange(value: number): void
}

function Slider({ label, value, min, max, step, onChange }: SliderProps) {
  return (
    <label className="flex flex-col gap-xs text-body">
      <span className="flex justify-between">
        {label}
        <span className="font-mono text-label text-on-surface-muted">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-tertiary"
      />
    </label>
  )
}

/** The real wallpaper, drawn by the same core code as the video (not a flat swatch). */
function WallpaperSwatch({ id }: { id: string }) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (ctx)
      drawWallpaper(ctx, { kind: 'preset', value: id }, { width: SWATCH_PX, height: SWATCH_PX })
  }, [id])
  return (
    <canvas
      ref={canvas}
      width={SWATCH_PX}
      height={SWATCH_PX}
      className="h-full w-full"
      aria-hidden
    />
  )
}

const SWATCH_PX = 96
