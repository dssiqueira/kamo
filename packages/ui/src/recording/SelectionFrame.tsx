import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { CloseIcon } from '../primitives/icons.tsx'
import {
  fitSize,
  moveRect,
  resizeRect,
  resizeTo,
  SELECTION_PRESETS,
  toDip,
  toolbarPosition,
  type Edges,
  type Rect,
  type SelectionDisplay,
} from './selection.ts'

/** The line around the selection (CSS px = DIP), drawn outside it so it is never recorded. */
export const SELECTION_BORDER = 2
/** How far the grab band of an edge reaches on each side of the line. */
const GRAB = 6

export interface SelectionFrameProps {
  /** The display the frame covers: DIP size and scale. */
  display: SelectionDisplay
  /** Where it opens, in pixels of the recording (display-local). */
  initial: Rect
  /** The global stop shortcut, already formatted (e.g. "Ctrl+Shift+2"). */
  stopShortcut?: string | undefined
  /**
   * What takes the mouse (DIP, page coordinates): the edges' and corners' grab bands, the
   * toolbar and its menu. Everywhere else the host's window lets clicks through to the apps
   * below. `holding`: a drag is going on, keep taking the mouse wherever the pointer goes.
   */
  onHitAreas(areas: Rect[], holding: boolean): void
  onRecord(rect: Rect): void
  /** × or Esc: closes, keeping the selection. */
  onClose(rect: Rect): void
}

type Drag = { pointerX: number; pointerY: number; start: Rect; edges: Edges | 'move' }

const HANDLES: { edges: Edges; cursor: string; area(f: Rect): Rect }[] = [
  // edges: a band along each side, between the corners
  {
    edges: { top: true },
    cursor: 'ns-resize',
    area: (f) => ({ x: f.x, y: f.y - GRAB, width: f.width, height: GRAB * 2 }),
  },
  {
    edges: { bottom: true },
    cursor: 'ns-resize',
    area: (f) => ({ x: f.x, y: f.y + f.height - GRAB, width: f.width, height: GRAB * 2 }),
  },
  {
    edges: { left: true },
    cursor: 'ew-resize',
    area: (f) => ({ x: f.x - GRAB, y: f.y, width: GRAB * 2, height: f.height }),
  },
  {
    edges: { right: true },
    cursor: 'ew-resize',
    area: (f) => ({ x: f.x + f.width - GRAB, y: f.y, width: GRAB * 2, height: f.height }),
  },
  // corners: a square on each, on top of the bands
  ...(
    [
      [{ top: true, left: true }, 'nwse-resize', 0, 0],
      [{ top: true, right: true }, 'nesw-resize', 1, 0],
      [{ bottom: true, left: true }, 'nesw-resize', 0, 1],
      [{ bottom: true, right: true }, 'nwse-resize', 1, 1],
    ] as const
  ).map(([edges, cursor, right, bottom]) => ({
    edges,
    cursor,
    area: (f: Rect): Rect => ({
      x: f.x + right * f.width - GRAB * 2,
      y: f.y + bottom * f.height - GRAB * 2,
      width: GRAB * 4,
      height: GRAB * 4,
    }),
  })),
]

/**
 * A-08 "Select" (flows.md → Home): a frame over the screen, like a window with a see-through
 * middle. Drag the toolbar to move it, the edges and corners to resize it; W × H take a size
 * in pixels of the recording; Record records exactly the inside. Esc closes; it is a key of
 * this focused window only, never a global listener (rule 2).
 */
export function SelectionFrame({
  display,
  initial,
  stopShortcut,
  onHitAreas,
  onRecord,
  onClose,
}: SelectionFrameProps) {
  const t = useT()
  const [rect, setRect] = useState(initial)
  const [menuOpen, setMenuOpen] = useState(false)
  const drag = useRef<Drag | null>(null)
  const rectRef = useRef(rect)
  rectRef.current = rect
  const scale = display.scaleFactor > 0 ? display.scaleFactor : 1

  const [holding, setHolding] = useState(false)

  // Keys of this focused window only (rule 2): Esc closes the menu, then the frame.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (menuOpen) setMenuOpen(false)
      else onClose(rectRef.current)
    }
    const onBlur = () => setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [menuOpen, onClose])

  const begin = (event: PointerEvent<HTMLElement>, edges: Edges | 'move') => {
    if (event.button !== 0) return
    // Not from the toolbar's own controls (fields, buttons).
    if (edges === 'move' && (event.target as Element).closest('button, input')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerX: event.clientX, pointerY: event.clientY, start: rect, edges }
    setHolding(true)
    setMenuOpen(false)
  }
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    // Pointer moves are DIP; the selection is pixels of the recording.
    const dx = (event.clientX - d.pointerX) * scale
    const dy = (event.clientY - d.pointerY) * scale
    setRect(
      d.edges === 'move'
        ? moveRect(d.start, dx, dy, display)
        : resizeRect(d.start, d.edges, dx, dy, display),
    )
  }
  const end = () => {
    drag.current = null
    setHolding(false)
  }

  const frame = toDip(rect, display)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarSize, setToolbarSize] = useState({ width: 440, height: 44 })
  useLayoutEffect(() => {
    const element = toolbarRef.current
    if (!element) return
    const { width, height } = element.getBoundingClientRect()
    if (width !== toolbarSize.width || height !== toolbarSize.height) {
      setToolbarSize({ width, height })
    }
  })
  // The toolbar hangs from the outer edge of the line.
  const outer = {
    x: frame.x - SELECTION_BORDER,
    y: frame.y - SELECTION_BORDER,
    width: frame.width + SELECTION_BORDER * 2,
    height: frame.height + SELECTION_BORDER * 2,
  }
  const bar = toolbarPosition(outer, toolbarSize, display)
  const menuUp = bar.y + toolbarSize.height + 180 > display.height

  // Mouse: the host takes it over these areas (and through a drag) and lets it through
  // elsewhere. Sent only when they change; not during a drag, which holds the mouse anyway.
  const menuRef = useRef<HTMLDivElement>(null)
  const sentAreas = useRef('')
  const notify = useRef(onHitAreas)
  notify.current = onHitAreas
  useLayoutEffect(() => {
    const areas = HANDLES.map((handle) => handle.area(frame))
    areas.push({ x: bar.x, y: bar.y, ...toolbarSize })
    const menu = menuRef.current?.getBoundingClientRect()
    if (menu) areas.push({ x: menu.x, y: menu.y, width: menu.width, height: menu.height })
    const key = holding ? 'holding' : JSON.stringify(areas)
    if (key === sentAreas.current) return
    sentAreas.current = key
    notify.current(areas, holding)
  })

  return (
    <div className="fixed inset-0 select-none" onPointerMove={onPointerMove} onPointerUp={end}>
      {/* The line: outside the selection, so the inside is exactly what is recorded. */}
      <div
        aria-hidden
        className="pointer-events-none absolute border-tertiary shadow-[0_0_0_1px_rgb(255_255_255/0.55)]"
        style={{
          left: outer.x,
          top: outer.y,
          width: outer.width,
          height: outer.height,
          borderWidth: SELECTION_BORDER,
        }}
      />
      {/* Corner marks: small cream squares on the line. */}
      {(
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const
      ).map(([right, bottom]) => (
        <span
          key={`${right}${bottom}`}
          aria-hidden
          className="pointer-events-none absolute size-[10px] rounded-[2px] border-2 border-tertiary bg-surface"
          style={{
            // centered on the middle of the line at each corner
            left: outer.x + SELECTION_BORDER / 2 + right * (outer.width - SELECTION_BORDER) - 5,
            top: outer.y + SELECTION_BORDER / 2 + bottom * (outer.height - SELECTION_BORDER) - 5,
          }}
        />
      ))}
      {HANDLES.map((handle, i) => (
        <div
          key={i}
          title={t('selection.resize')}
          className="absolute"
          style={handleStyle(handle.area(frame), handle.cursor)}
          onPointerDown={(event) => begin(event, handle.edges)}
          onPointerUp={end}
          onLostPointerCapture={end}
        />
      ))}

      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={t('selection.toolbar')}
        className={`absolute flex cursor-move items-center gap-sm border border-border bg-surface-raised py-[6px] ps-sm pe-[6px] text-on-surface shadow-[0_8px_24px_rgb(0_0_0/0.16)] ${
          bar.placement === 'below'
            ? 'rounded-b-lg border-t-0'
            : bar.placement === 'above'
              ? 'rounded-t-lg border-b-0'
              : 'rounded-lg'
        }`}
        style={{ left: bar.x, top: bar.y }}
        title={t('selection.move')}
        onPointerDown={(event) => begin(event, 'move')}
        onPointerUp={end}
        onLostPointerCapture={end}
      >
        <Grip />
        <SizeFields rect={rect} onSize={(size) => setRect(resizeTo(rect, size, display))} />
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t('selection.sizes')}
            title={t('selection.sizes')}
            onClick={() => setMenuOpen((open) => !open)}
            className={`flex h-[32px] cursor-default items-center gap-[2px] rounded-md px-[6px] text-on-surface-muted transition-colors duration-[120ms] hover:bg-surface hover:text-on-surface ${FOCUS_RING}`}
          >
            <RatioIcon />
            <svg aria-hidden viewBox="0 0 10 10" width="10" height="10">
              <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-label={t('selection.sizes')}
              className={`absolute start-0 z-10 flex min-w-[200px] cursor-default flex-col rounded-md border border-border bg-surface p-xs shadow-[0_8px_24px_rgb(0_0_0/0.16)] ${
                menuUp ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]'
              }`}
            >
              {SELECTION_PRESETS.map((preset) => (
                <button
                  key={`${preset.width}x${preset.height}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setRect(resizeTo(rect, fitSize(preset, display), display, 'center'))
                    setMenuOpen(false)
                  }}
                  className={`rounded-sm px-sm py-[6px] text-start font-mono text-label whitespace-nowrap hover:bg-surface-raised ${FOCUS_RING}`}
                >
                  {t('selection.preset', { ...preset })}
                </button>
              ))}
            </div>
          )}
        </div>
        <span aria-hidden className="h-[20px] w-px bg-border" />
        <button
          type="button"
          onClick={() => onRecord(rect)}
          title={stopShortcut ? t('selection.stopHint', { shortcut: stopShortcut }) : undefined}
          className={`flex h-[32px] cursor-default items-center gap-sm rounded-md bg-primary px-[12px] text-body font-semibold text-on-primary transition-colors duration-[120ms] hover:bg-[#97CB90] ${FOCUS_RING}`}
        >
          {/* DESIGN.md: coral is reserved for the REC dot. */}
          <span aria-hidden className="size-[8px] rounded-full bg-recording" />
          {t('selection.record')}
          {stopShortcut && (
            <kbd className="font-mono text-[11px] font-medium opacity-70">{stopShortcut}</kbd>
          )}
        </button>
        <button
          type="button"
          aria-label={t('selection.close')}
          title={t('selection.close')}
          onClick={() => onClose(rect)}
          className={`flex size-[32px] cursor-default items-center justify-center rounded-md text-on-surface-muted transition-colors duration-[120ms] hover:bg-surface hover:text-on-surface ${FOCUS_RING}`}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}

function handleStyle(area: Rect, cursor: string): CSSProperties {
  return { left: area.x, top: area.y, width: area.width, height: area.height, cursor }
}

/** W × H in pixels of the recording; Enter or leaving the field applies (clamped, even). */
function SizeFields({
  rect,
  onSize,
}: {
  rect: Rect
  onSize(size: { width: number; height: number }): void
}) {
  const t = useT()
  return (
    <span className="flex items-center gap-xs font-mono text-timecode">
      <NumberField
        label={t('selection.width')}
        value={rect.width}
        onCommit={(width) => onSize({ width, height: rect.height })}
      />
      <span aria-hidden className="text-on-surface-muted">
        ×
      </span>
      <NumberField
        label={t('selection.height')}
        value={rect.height}
        onCommit={(height) => onSize({ width: rect.width, height })}
      />
      <span className="text-label text-on-surface-muted">{t('selection.unit')}</span>
    </span>
  )
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit(value: number): void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const parsed = Number.parseInt(draft.replace(/\D/g, ''), 10)
    setDraft(null)
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      // Even steps (the video needs even sides); Shift for bigger ones.
      event.preventDefault()
      const step = (event.shiftKey ? 20 : 2) * (event.key === 'ArrowUp' ? 1 : -1)
      setDraft(null)
      onCommit(value + step)
    } else if (event.key === 'Escape' && draft !== null) {
      // Esc first drops the edit; the next one closes the frame.
      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation()
      setDraft(null)
    }
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      title={label}
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      onFocus={(event) => event.target.select()}
      className={`h-[32px] w-[58px] cursor-text rounded-md border border-border bg-surface px-[6px] text-center tabular-nums text-on-surface ${FOCUS_RING}`}
    />
  )
}

/** Six dots: the toolbar moves the frame. */
function Grip() {
  return (
    <svg aria-hidden viewBox="0 0 6 12" width="6" height="12" className="text-on-surface-muted">
      {[2, 6, 10].flatMap((y) => [
        <circle key={`l${y}`} cx="1" cy={y} r="1" fill="currentColor" />,
        <circle key={`r${y}`} cx="5" cy={y} r="1" fill="currentColor" />,
      ])}
    </svg>
  )
}

/** Two nested frames: preset aspect ratios. */
function RatioIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <rect x="1.75" y="3.75" width="12.5" height="8.5" rx="1" />
      <rect x="5.75" y="5.75" width="4.5" height="4.5" rx="0.5" />
    </svg>
  )
}

/** While recording a selection: the line alone, around `inner` (DIP in its window). */
export function SelectionBorder({ inner }: { inner: Rect }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed border-tertiary shadow-[0_0_0_1px_rgb(255_255_255/0.55)]"
      style={{
        left: inner.x - SELECTION_BORDER,
        top: inner.y - SELECTION_BORDER,
        width: inner.width + SELECTION_BORDER * 2,
        height: inner.height + SELECTION_BORDER * 2,
        borderWidth: SELECTION_BORDER,
      }}
    />
  )
}
