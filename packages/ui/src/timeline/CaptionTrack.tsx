import type { ZoomEdge } from '@kamo/core'
import { formatTimecode } from '@kamo/i18n'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useT } from '../i18n.tsx'
import { useSpring } from '../motion/useSpring.ts'
import { nudgeMs, snapToFrame, type TimeScale } from './scale.ts'
import { useDrag } from './useDrag.ts'

/** One caption on the lane: a transcript segment (A-06). */
export interface CaptionBlockData {
  startMs: number
  endMs: number
  text: string
}

/** The caption-lane callbacks of `<Timeline>` (see TimelineProps.captions). */
export interface CaptionTrackActions {
  onSelectCaption(index: number | null): void
  /** opens (index) or closes (null) the text editor of a caption */
  onEditCaption(index: number | null): void
  /** the fixed text; empty removes the caption */
  onCaptionText(index: number, text: string): void
  /** drag deltas are measured from the start of the gesture, like the zoom blocks */
  onMoveCaption(index: number, deltaMs: number): void
  onResizeCaption(index: number, edge: ZoomEdge, deltaMs: number): void
  onDeleteCaption(index: number): void
  onTransactionStart(): void
  onTransactionEnd(): void
}

export interface CaptionTrackProps {
  scale: TimeScale
  fps: number
  captions: readonly CaptionBlockData[]
  trim: { startMs: number; endMs: number }
  /** captions are turned off in the side panel: the lane dims, still editable */
  off: boolean
  selectedIndex: number | null
  editingIndex: number | null
  /** BCP 47 language of the transcript, for the text (DESIGN.md: user content gets `lang`) */
  lang?: string | undefined
  actions: CaptionTrackActions
}

/**
 * Captions lane (A-06): one block per transcript segment, with its text. Blocks move by the
 * middle, stretch by the edges and go away with Delete, like the zoom blocks; a double-click
 * (or Enter) opens the text in a small editor above the lane. Never pink (pink is zooms).
 */
export function CaptionTrack({
  scale,
  fps,
  captions,
  trim,
  off,
  selectedIndex,
  editingIndex,
  lang,
  actions,
}: CaptionTrackProps) {
  const t = useT()
  const hintId = useId()
  const editing = editingIndex !== null ? captions[editingIndex] : undefined

  const onLaneClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    actions.onSelectCaption(null)
  }

  return (
    <div className="relative h-[32px]" data-testid="caption-lane" onClick={onLaneClick}>
      <span id={hintId} hidden>
        {t('editor.captions.blockHint')}
      </span>
      {captions.map((caption, index) =>
        caption.endMs > trim.startMs && caption.startMs < trim.endMs ? (
          <CaptionBlock
            key={index}
            index={index}
            caption={caption}
            scale={scale}
            fps={fps}
            hintId={hintId}
            off={off}
            lang={lang}
            selected={index === selectedIndex}
            actions={actions}
          />
        ) : null,
      )}
      {editing && editingIndex !== null && (
        <CaptionEditor
          key={editingIndex}
          caption={editing}
          anchorPx={scale.toPx((editing.startMs + editing.endMs) / 2)}
          laneWidthPx={scale.widthPx}
          lang={lang}
          onSave={(text) => {
            actions.onCaptionText(editingIndex, text)
            actions.onEditCaption(null)
          }}
          onCancel={() => actions.onEditCaption(null)}
        />
      )}
    </div>
  )
}

interface CaptionBlockProps {
  index: number
  caption: CaptionBlockData
  scale: TimeScale
  fps: number
  hintId: string
  off: boolean
  lang?: string | undefined
  selected: boolean
  actions: CaptionTrackActions
}

function CaptionBlock({
  index,
  caption,
  scale,
  fps,
  hintId,
  off,
  lang,
  selected,
  actions,
}: CaptionBlockProps) {
  const t = useT()
  const mode = useRef<'move' | ZoomEdge>('move')

  const drag = useDrag({
    onDown(event) {
      const edge = event.target instanceof HTMLElement ? event.target.dataset.edge : undefined
      mode.current = edge === 'start' || edge === 'end' ? edge : 'move'
      actions.onSelectCaption(index)
    },
    onStart: () => actions.onTransactionStart(),
    onMove(dxPx) {
      const deltaMs = snapToFrame(scale.deltaToMs(dxPx), fps)
      if (mode.current === 'move') actions.onMoveCaption(index, deltaMs)
      else actions.onResizeCaption(index, mode.current, deltaMs)
    },
    onEnd(moved) {
      if (moved) actions.onTransactionEnd()
    },
  })

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      actions.onDeleteCaption(index)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      actions.onEditCaption(index)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      actions.onSelectCaption(null)
      return
    }
    const nudge = nudgeMs(event.key, event.shiftKey, fps)
    if (nudge === null) return
    event.preventDefault()
    actions.onSelectCaption(index)
    actions.onTransactionStart()
    actions.onMoveCaption(index, nudge)
    actions.onTransactionEnd()
  }

  const left = scale.toPx(caption.startMs)
  const width = Math.max(scale.toPx(caption.endMs) - left, 4)
  const edgeWidth = Math.min(8, width / 4)

  return (
    <button
      type="button"
      data-testid="caption-block"
      aria-label={t('editor.captions.block', {
        start: formatTimecode(caption.startMs, fps),
        end: formatTimecode(caption.endMs, fps),
        text: caption.text,
      })}
      aria-describedby={hintId}
      aria-pressed={selected}
      title={caption.text}
      onClick={() => actions.onSelectCaption(index)}
      onDoubleClick={() => actions.onEditCaption(index)}
      onKeyDown={onKeyDown}
      {...drag}
      className={`absolute top-[3px] flex h-[26px] cursor-grab touch-none items-center overflow-hidden rounded-sm border bg-surface-raised text-label whitespace-nowrap text-on-surface select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary active:cursor-grabbing transition-opacity duration-[120ms] ${
        selected
          ? 'border-tertiary shadow-[inset_0_0_0_1px_var(--color-tertiary)]'
          : 'border-border'
      } ${off ? 'opacity-50' : ''}`}
      style={{ insetInlineStart: left, width }}
    >
      <span
        aria-hidden
        data-edge="start"
        className="absolute inset-y-0 start-0 z-10 cursor-ew-resize"
        style={{ width: edgeWidth }}
      />
      <span lang={lang} className="pointer-events-none min-w-0 truncate px-[6px]">
        {caption.text}
      </span>
      <span
        aria-hidden
        data-edge="end"
        className="absolute inset-y-0 end-0 z-10 cursor-ew-resize"
        style={{ width: edgeWidth }}
      />
    </button>
  )
}

interface CaptionEditorProps {
  caption: CaptionBlockData
  anchorPx: number
  laneWidthPx: number
  lang?: string | undefined
  onSave(text: string): void
  onCancel(): void
}

/** Inline text editor above the lane: Enter saves, Esc cancels, clicking away saves. */
function CaptionEditor({
  caption,
  anchorPx,
  laneWidthPx,
  lang,
  onSave,
  onCancel,
}: CaptionEditorProps) {
  const t = useT()
  const [text, setText] = useState(caption.text)
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  // Spring in (rule 10).
  const appear = useSpring(1, 0, caption.startMs)
  const half = 170
  const center = Math.min(Math.max(anchorPx, half), Math.max(laneWidthPx - half, half))

  const save = () => {
    if (done.current) return
    done.current = true
    onSave(text)
  }
  const cancel = () => {
    if (done.current) return
    done.current = true
    onCancel()
  }
  const latest = useRef(save)
  latest.current = save

  useEffect(() => {
    const element = field.current
    element?.focus()
    element?.select()
  }, [])

  // Clicking anywhere else saves, like leaving a text field.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && box.current?.contains(event.target)) return
      latest.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={t('editor.captions.editLabel')}
      data-testid="caption-editor"
      className="absolute bottom-[calc(100%+4px)] z-30 flex w-[340px] flex-col gap-xs rounded-md border border-border bg-surface p-sm text-on-surface shadow-[0_8px_24px_rgb(0_0_0/0.1)]"
      style={{
        insetInlineStart: center,
        opacity: Math.min(1, Math.max(0, appear)),
        transform: `translateX(-50%) translateY(${(1 - appear) * 4}px) scale(${0.96 + 0.04 * appear})`,
      }}
    >
      <textarea
        ref={field}
        lang={lang}
        rows={2}
        value={text}
        aria-label={t('editor.captions.editLabel')}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            save()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
          }
        }}
        className="w-full resize-none rounded-sm border border-border bg-background px-sm py-xs text-body text-on-surface focus-visible:outline-2 focus-visible:outline-tertiary"
      />
      <span className="text-label text-on-surface-muted">{t('editor.captions.editHelp')}</span>
    </div>
  )
}
