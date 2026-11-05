import {
  WALLPAPERS,
  drawWallpaper,
  type Aspect,
  type CursorSettings,
  type Style,
  type WebcamPatch,
  type WebcamPosition,
  type WebcamLayout,
  type WebcamShape,
  type WebcamSettings,
  type WebcamSize,
} from '@kamo/core'
import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING, Switch } from '../primitives/controls.tsx'
import { PlusIcon } from '../timeline/icons.tsx'
import type { BackgroundImageErrorCode } from './background-image.ts'
import {
  CaptionsElsewhere,
  CaptionsSection,
  type CaptionsSectionProps,
} from './CaptionsSection.tsx'

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
  /** the editor's format: the split layout only shows in 9:16 */
  aspect?: Aspect
  /** picks the split layout (and the 9:16 format, where it shows) */
  onSplitLayout?(): void
  /** "Your image" tile (A-04); missing when the platform cannot pick images */
  image?: ImageTileProps | undefined
  /** Captions (A-06); missing hides the section */
  captions?: CaptionsSectionProps | undefined
}

/** The background image tile (A-04). */
export interface ImageTileProps {
  /** the image in use or used last; null = none yet (the tile offers to add one) */
  thumbnailUrl: string | null
  /** the background is that image */
  selected: boolean
  /** the picker is open or the image is being checked */
  busy: boolean
  error: BackgroundImageErrorCode | null
  /** opens the picker (add or replace) */
  onPick(): void
  /** goes back to the last image */
  onSelect(): void
}

const IMAGE_ERROR_KEY: Record<BackgroundImageErrorCode, string> = {
  unsupported: 'editor.panel.imageErrors.unsupported',
  too_big: 'editor.panel.imageErrors.tooBig',
  unreadable: 'editor.panel.imageErrors.unreadable',
}

/**
 * Side panel (flows.md §5): background, padding, corners, shadow, cursor, zooms, webcam,
 * captions.
 */
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
          {props.image && <ImageTile {...props.image} />}
        </div>
        {props.image?.thumbnailUrl && (
          <button
            type="button"
            data-testid="background-image-replace"
            disabled={props.image.busy}
            onClick={props.image.onPick}
            className={`self-start rounded-sm text-label text-tertiary-strong hover:underline disabled:opacity-50 ${FOCUS_RING}`}
          >
            {t('editor.panel.imageReplace')}
          </button>
        )}
        {props.image?.error && (
          <p role="alert" data-testid="background-image-error" className="text-label text-error">
            {t(IMAGE_ERROR_KEY[props.image.error])}
          </p>
        )}
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
        <WebcamSection
          webcam={props.webcam}
          onWebcam={props.onWebcam}
          aspect={props.aspect ?? '16:9'}
          onSplitLayout={props.onSplitLayout}
        />
      )}
      {props.captions ? <CaptionsSection {...props.captions} /> : <CaptionsElsewhere />}
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
const WEBCAM_SHAPES: readonly WebcamShape[] = ['circle', 'square', 'landscape', 'portrait']
/** Full name, for the tooltip and screen readers. */
const SHAPE_KEY: Record<WebcamShape, string> = {
  circle: 'editor.webcam.circle',
  square: 'editor.webcam.square',
  landscape: 'editor.webcam.landscape',
  portrait: 'editor.webcam.portrait',
}
/** Short label under the icon. */
const SHAPE_LABEL_KEY: Record<WebcamShape, string> = {
  circle: 'editor.webcam.circleShort',
  square: 'editor.webcam.squareShort',
  landscape: 'editor.webcam.landscapeShort',
  portrait: 'editor.webcam.portraitShort',
}
const SHAPE_ICON: Record<WebcamShape, string> = {
  circle: 'size-[16px] rounded-full',
  square: 'size-[16px] rounded-[4px]',
  landscape: 'h-[12px] w-[21px] rounded-[3px]',
  portrait: 'h-[21px] w-[12px] rounded-[3px]',
}
const POSITION_KEY: Record<WebcamPosition, string> = {
  'top-left': 'editor.webcam.topLeft',
  'top-right': 'editor.webcam.topRight',
  'bottom-left': 'editor.webcam.bottomLeft',
  'bottom-right': 'editor.webcam.bottomRight',
}
const WEBCAM_LAYOUTS: readonly WebcamLayout[] = ['bubble', 'split']
const LAYOUT_KEY: Record<WebcamLayout, string> = {
  bubble: 'editor.webcam.layoutBubble',
  split: 'editor.webcam.layoutSplit',
}
const SIZE_KEY: Record<WebcamSize, string> = {
  small: 'editor.webcam.small',
  medium: 'editor.webcam.medium',
  large: 'editor.webcam.large',
}

/**
 * Webcam (A-03): on/off, layout (bubble or the 9:16 split), then the bubble's corner, shape,
 * size and shrink on zoom, or the split's order. The bubble controls hide while the split is
 * what the preview shows; in 16:9 and 1:1 a split webcam still shows as the bubble.
 */
function WebcamSection({
  webcam,
  onWebcam,
  aspect,
  onSplitLayout,
}: {
  webcam: WebcamSettings
  onWebcam(patch: WebcamPatch): void
  aspect: Aspect
  onSplitLayout?: (() => void) | undefined
}) {
  const t = useT()
  const layout = webcam.layout ?? 'bubble'
  const splitShown = layout === 'split' && aspect === '9:16'
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
        aria-label={t('editor.webcam.layout')}
        className="flex flex-col gap-xs"
      >
        <span className="text-body">{t('editor.webcam.layout')}</span>
        <div className="grid grid-cols-2 gap-xs">
          {WEBCAM_LAYOUTS.map((choice) => {
            const selected = layout === choice
            return (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!webcam.visible}
                data-testid={`webcam-layout-${choice}`}
                onClick={() =>
                  choice === 'split' && onSplitLayout
                    ? onSplitLayout()
                    : onWebcam({ layout: choice })
                }
                className={`flex h-[48px] items-center justify-center gap-sm ${option(selected)}`}
              >
                <LayoutIcon layout={choice} selected={selected} />
                <span>{t(LAYOUT_KEY[choice])}</span>
              </button>
            )
          })}
        </div>
        <span className="text-label text-on-surface-muted">
          {t(
            splitShown
              ? 'editor.webcam.splitHint'
              : layout === 'split'
                ? 'editor.webcam.splitOtherFormats'
                : 'editor.webcam.layoutHint',
          )}
        </span>
      </div>
      {splitShown && (
        <Switch
          label={t('editor.webcam.cameraFirst')}
          checked={webcam.split?.cameraFirst === true}
          onChange={(cameraFirst) => onWebcam({ split: { cameraFirst } })}
        />
      )}
      {!splitShown && (
        <>
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
          <div
            role="radiogroup"
            aria-label={t('editor.webcam.shape')}
            className="flex flex-col gap-xs"
          >
            <span className="text-body">{t('editor.webcam.shape')}</span>
            <div className="grid grid-cols-4 gap-xs">
              {WEBCAM_SHAPES.map((shape) => {
                const selected = (webcam.shape ?? 'circle') === shape
                return (
                  <button
                    key={shape}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={t(SHAPE_KEY[shape])}
                    title={t(SHAPE_KEY[shape])}
                    disabled={!webcam.visible}
                    data-testid={`webcam-shape-${shape}`}
                    onClick={() => onWebcam({ shape })}
                    className={`flex h-[48px] flex-col items-center justify-center gap-[4px] ${option(selected)}`}
                  >
                    <span
                      aria-hidden
                      className={`border-[1.5px] ${selected ? 'border-tertiary bg-tertiary/25' : 'border-current'} ${SHAPE_ICON[shape]}`}
                    />
                    <span className="text-[11px] leading-none">{t(SHAPE_LABEL_KEY[shape])}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div
            role="radiogroup"
            aria-label={t('editor.webcam.size')}
            className="flex flex-col gap-xs"
          >
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
        </>
      )}
    </Section>
  )
}

/** A tiny 9:16 frame: a dot over the video (bubble) or two stacked cards (split). */
function LayoutIcon({ layout, selected }: { layout: WebcamLayout; selected: boolean }) {
  const tone = selected ? 'border-tertiary' : 'border-current'
  const fill = selected ? 'bg-tertiary' : 'bg-current'
  if (layout === 'bubble') {
    return (
      <span
        aria-hidden
        className={`relative h-[22px] w-[13px] rounded-[3px] border-[1.5px] ${tone}`}
      >
        <span className={`absolute bottom-[2px] right-[2px] size-[5px] rounded-full ${fill}`} />
      </span>
    )
  }
  return (
    <span aria-hidden className="flex h-[22px] w-[13px] flex-col gap-[2px]">
      <span className={`flex-1 rounded-[2px] border-[1.5px] ${tone}`} />
      <span className={`flex-1 rounded-[2px] ${fill} opacity-60`} />
    </span>
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

/**
 * "Your image" (A-04): a + tile that opens the picker, or the image itself as a swatch once
 * there is one (clicking it again while selected picks another).
 */
function ImageTile({ thumbnailUrl, selected, busy, onPick, onSelect }: ImageTileProps) {
  const t = useT()
  const label = t('editor.panel.image')
  return (
    <button
      type="button"
      aria-label={thumbnailUrl ? label : t('editor.panel.imageAdd')}
      aria-pressed={thumbnailUrl ? selected : undefined}
      aria-busy={busy || undefined}
      title={thumbnailUrl ? label : t('editor.panel.imageAdd')}
      data-testid="background-image-tile"
      disabled={busy}
      onClick={thumbnailUrl && !selected ? onSelect : onPick}
      className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-md border-2 bg-surface-raised text-on-surface-muted transition-colors duration-[120ms] hover:text-on-surface disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary ${
        selected
          ? 'border-tertiary'
          : thumbnailUrl
            ? 'border-border'
            : 'border-dashed border-border'
      }`}
    >
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <PlusIcon />
      )}
    </button>
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
