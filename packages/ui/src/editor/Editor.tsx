import {
  addWebcamHidden,
  backgroundImageFile,
  buildCaptionTrack,
  createHistory,
  deleteCaption,
  deleteWebcamHidden,
  createZoomAt,
  deleteZoom,
  endTrimSuggestionFor,
  generateZooms,
  moveCaption,
  moveWebcamHidden,
  moveZoom,
  projectAspect,
  projectAutoZoom,
  projectCaptions,
  resizeCaption,
  resizeWebcamHidden,
  resizeZoom,
  setAspect,
  setCaptions,
  setCaptionText,
  setTrim,
  setWebcam,
  setZoomScale,
  visibleZooms,
  type Aspect,
  type MouseEventRecord,
  type Project,
  type Transcript,
} from '@kamo/core'
import { formatTimecode } from '@kamo/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { ArrowBackIcon, CloseIcon, PauseIcon, PlayIcon } from '../primitives/icons.tsx'
import { Timeline, type TimelineAudioTrack } from '../timeline/Timeline.tsx'
import { useHistoryShortcuts } from '../timeline/useHistoryShortcuts.ts'
import { ExportSheet } from '../export/ExportSheet.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { ReplaceTranscriptDialog } from '../packs/ReplaceTranscriptDialog.tsx'
import type { ExportPlatform } from '../export/useExportRun.ts'
import {
  loadBackgroundImage,
  useBackgroundImage,
  type BackgroundImageErrorCode,
  type BackgroundImagePlatform,
} from './background-image.ts'
import { Preview } from './Preview.tsx'
import { PreviewAudio, type PreviewAudioTrack } from './PreviewAudio.tsx'
import { PreviewDecor } from './PreviewDecor.tsx'
import type { EditorTranscription } from './CaptionsSection.tsx'
import { StylePanel } from './StylePanel.tsx'
import { usePlaybackTime, type PlaybackClock } from './playback-clock.ts'
import { usePlayback } from './usePlayback.ts'

export interface EditorProps {
  /** Starting point; from then on the editor owns the project through its undo history. */
  project: Project
  events: readonly MouseEventRecord[]
  videoUrl: string
  /** webcam.mp4 (A-03), when the project has one; the app resolves it like videoUrl */
  webcamUrl?: string | undefined
  /**
   * audio.m4a and system.m4a (F-04), resolved like videoUrl, for the preview's sound (F-10).
   * Only the recorded tracks (project.audio.<track>.enabled) are played.
   */
  audioUrls?: { mic?: string | undefined; system?: string | undefined } | undefined
  /** Every edit, undo and redo; the app autosaves it (F-12: no Save button). */
  onChange(project: Project): void
  onBack(): void
  /** Files, media and folders for the export (F-11); without it, Export stays disabled. */
  exportPlatform?: ExportPlatform
  /**
   * Wallpaper with your own image (A-04): picks and serves project images. Without it the
   * "Your image" tile is not shown (an image background still shows if the URL loads).
   */
  backgroundImage?: BackgroundImagePlatform | undefined
  /**
   * transcript.json (A-05), the text of the captions (A-06); null = none yet. A new value from
   * the app (a transcription finished) replaces the captions' text and clears the undo steps.
   */
  transcript?: Transcript | null | undefined
  /** Caption edits correct the transcript (undoable like any edit); the app saves it. */
  onTranscriptChange?(transcript: Transcript): void
  /** Transcribe from the Captions section; missing when the platform cannot transcribe */
  transcription?: EditorTranscription | undefined
}

/** Everything the editor's undo history covers: the project and the captions' text. */
interface EditorDoc {
  project: Project
  transcript: Transcript | null
}

/** Editor (flows.md §5): preview in the middle, side panel on the right, timeline below. */
export function Editor({
  project: initial,
  events,
  videoUrl,
  webcamUrl,
  audioUrls,
  onChange,
  onBack,
  exportPlatform,
  backgroundImage: imagePlatform,
  transcript: transcriptProp = null,
  onTranscriptChange,
  transcription,
}: EditorProps) {
  const t = useT()
  const video = useRef<HTMLVideoElement | null>(null)
  const webcamVideo = useRef<HTMLVideoElement | null>(null)
  const draw = useRef<((timeMs: number) => void) | null>(null)
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null)
  const [selectedHidden, setSelectedHidden] = useState<number | null>(null)
  const [selectedCaption, setSelectedCaption] = useState<number | null>(null)
  const [editingCaption, setEditingCaption] = useState<number | null>(null)
  const [askReplace, setAskReplace] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  // Every edit (timeline and side panel, captions' text included) goes through one history:
  // Ctrl/⌘+Z undoes any of them, ≥ 50 steps, a whole drag is one step (F-09).
  // The page remounts the editor per project, so the history is created once.
  const [history] = useState(() =>
    createHistory<EditorDoc>({ project: initial, transcript: transcriptProp }),
  )
  const [project, setProject] = useState(initial)
  const [transcript, setTranscript] = useState(transcriptProp)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onTranscriptChangeRef = useRef(onTranscriptChange)
  onTranscriptChangeRef.current = onTranscriptChange
  /** What the history held last time it was seen, to tell which part changed. */
  const seen = useRef(history.present)
  /** True while a transcript from the app replaces ours: it is not an edit to save. */
  const replacing = useRef(false)
  // F-16: the answer to "Trim the last 2s?" is kept outside the undo history, so undoing an
  // applied trim brings the old end back but never the question; every save carries it.
  const [endTrimAnswer, setEndTrimAnswer] = useState(initial.endTrimSuggestion)
  const endTrimAnswerRef = useRef(endTrimAnswer)
  const withAnswer = (p: Project): Project => {
    const answer = endTrimAnswerRef.current
    return answer && p.endTrimSuggestion !== answer ? { ...p, endTrimSuggestion: answer } : p
  }
  const withAnswerRef = useRef(withAnswer)
  withAnswerRef.current = withAnswer
  useEffect(
    () =>
      history.subscribe(() => {
        const present = history.present
        const before = seen.current
        seen.current = present
        if (present.project !== before.project) {
          const next = withAnswerRef.current(present.project)
          setProject(next)
          onChangeRef.current(next)
        }
        if (present.transcript !== before.transcript) {
          setTranscript(present.transcript)
          if (present.transcript && !replacing.current) {
            onTranscriptChangeRef.current?.(present.transcript)
          }
        }
      }),
    [history],
  )
  useHistoryShortcuts(history, () => {})

  // A transcription finished while the editor is open: its text becomes the captions'.
  const lastTranscriptProp = useRef(transcriptProp)
  useEffect(() => {
    if (transcriptProp === lastTranscriptProp.current) return
    lastTranscriptProp.current = transcriptProp
    replacing.current = true
    try {
      history.reset({ ...history.present, transcript: transcriptProp })
    } finally {
      replacing.current = false
    }
    setSelectedCaption(null)
    setEditingCaption(null)
    // Transcribed for the first time with captions never set: they were asked for, show them.
    const doc = history.present
    if (transcriptProp?.segments.length && doc.project.captions === null) {
      history.push({ ...doc, project: setCaptions(doc.project, { enabled: true }) })
    }
  }, [history, transcriptProp])

  /** Applies a project edit to the present state (same project back = no undo step). */
  const edit = (next: (p: Project) => Project) => {
    const doc = history.present
    const project = next(doc.project)
    if (project !== doc.project) history.push({ ...doc, project })
  }
  /** Drags: applies the gesture's total delta to the state at its start. */
  const fromBase = (next: (p: Project) => Project) => {
    const doc = history.base
    const project = next(doc.project)
    history.push(project === doc.project ? doc : { ...doc, project })
  }
  /** Caption edits (A-06): they correct the transcript. */
  const editText = (next: (t: Transcript) => Transcript) => {
    const doc = history.present
    if (!doc.transcript) return
    const text = next(doc.transcript)
    if (text !== doc.transcript) history.push({ ...doc, transcript: text })
  }
  const textFromBase = (next: (t: Transcript) => Transcript) => {
    const doc = history.base
    if (!doc.transcript) return
    const text = next(doc.transcript)
    history.push(text === doc.transcript ? doc : { ...doc, transcript: text })
  }

  // A-04: the image in use, and the last one used, so the tile can bring it back after a
  // preset was picked. The decoded image goes to the preview and the format previews.
  const imageFile = backgroundImageFile(project.style.background)
  const [lastImage, setLastImage] = useState(() => backgroundImageFile(initial.style.background))
  const shownImage = imageFile ?? lastImage
  const backgroundImage = useBackgroundImage(
    imageFile && imagePlatform ? imagePlatform.url(imageFile) : null,
  )
  const [picking, setPicking] = useState(false)
  const [imageError, setImageError] = useState<BackgroundImageErrorCode | null>(null)
  const applyImage = (file: string) =>
    edit((p) => ({ ...p, style: { ...p.style, background: { kind: 'image', value: file } } }))
  const pickImage = async () => {
    if (!imagePlatform || picking) return
    setPicking(true)
    setImageError(null)
    try {
      const result = await imagePlatform.pick()
      if (result.kind === 'error') setImageError(result.code)
      if (result.kind !== 'picked') return
      // Only an image the page can decode becomes the background.
      const ok = await loadBackgroundImage(imagePlatform.url(result.file)).then(
        () => true,
        () => false,
      )
      if (!ok) {
        setImageError('unreadable')
        return
      }
      setLastImage(result.file)
      applyImage(result.file)
    } finally {
      setPicking(false)
    }
  }

  const fps = project.source.fps
  const playback = usePlayback(video, project.trim, fps, (ms) => draw.current?.(ms))

  // F-05: the toggle lives in the project (autoZoom, absent = on), so it is saved and undoable.
  const autoZoom = projectAutoZoom(project)
  const zooms = useMemo(() => visibleZooms(project.zooms, { autoZoom }), [project.zooms, autoZoom])
  const endTrimEnd = useMemo(
    () =>
      endTrimSuggestionFor(
        { durationMs: project.durationMs, trim: project.trim, endTrimSuggestion: endTrimAnswer },
        events,
      ),
    [project.durationMs, project.trim, endTrimAnswer, events],
  )
  const answerEndTrim = (answer: 'applied' | 'dismissed') => {
    endTrimAnswerRef.current = answer
    setEndTrimAnswer(answer)
    if (answer === 'applied' && endTrimEnd !== null) {
      const before = history.present
      edit((p) => setTrim(p, p.trim.startMs, endTrimEnd))
      // setTrim changed nothing: no history step, so save the answer on its own.
      if (history.present !== before) return
    }
    const next = withAnswer(history.present.project)
    setProject(next)
    onChangeRef.current(next)
  }
  // A-06: the captions the preview burns in (the export burns the same ones, or none).
  const captionSettings = projectCaptions(project)
  const captionTrack = useMemo(
    () => buildCaptionTrack(transcript, project.captions),
    [transcript, project.captions],
  )
  const transcribeAgain = () => {
    if (!transcription) return
    if (transcript?.edited) setAskReplace(true)
    else transcription.onTranscribe()
  }
  const editCaption = (index: number | null) => {
    setEditingCaption(index)
    if (index === null) return
    setSelectedCaption(index)
    // Show the start of that caption in the preview (faded in) while its text is fixed.
    const segment = transcript?.segments[index]
    if (segment) {
      playback.seek(
        Math.round(segment.startMs + Math.min(500, (segment.endMs - segment.startMs) / 2)),
      )
    }
  }

  const noClicks = useMemo(
    () => !events.some((e) => e.type === 'down' && e.button === 'left'),
    [events],
  )

  // F-10: Space plays/pauses, arrows step one frame (Shift: one second). Keys of Kamo's own
  // window only; nothing system-wide (rule 2). Focused controls keep their own keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (exportOpen) return
      const target = event.target as HTMLElement | null
      if (
        target?.closest(
          'input, textarea, select, button, [role="slider"], [contenteditable="true"]',
        )
      )
        return
      if (event.key === ' ') {
        event.preventDefault()
        playback.toggle()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const frames = event.shiftKey ? fps : 1
        playback.step(event.key === 'ArrowLeft' ? -frames : frames)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playback, fps, exportOpen])

  const regenerate = () =>
    edit((p) => ({
      ...p,
      zooms: generateZooms({
        events,
        video: { width: p.source.width, height: p.source.height },
        durationMs: p.durationMs,
        existing: p.zooms,
      }).zooms,
    }))

  /** F-09: a new zoom centers on where the pointer was at that instant. */
  const pointerAt = (tMs: number) => {
    let point = { x: project.source.width / 2, y: project.source.height / 2 }
    for (const e of events) {
      if (e.t > tMs) break
      if (!(e.type === 'move' && e.outside)) point = { x: e.x, y: e.y }
    }
    return point
  }

  const audioTrack = (track: 'mic' | 'system'): TimelineAudioTrack | undefined =>
    project.audio[track].enabled
      ? { volume: project.audio[track].volume, muted: project.audio[track].volume === 0 }
      : undefined
  const mic = audioTrack('mic')
  const system = audioTrack('system')
  const setVolume = (track: 'mic' | 'system', volume: number) =>
    edit((p) => ({ ...p, audio: { ...p.audio, [track]: { ...p.audio[track], volume } } }))

  // F-10: the preview plays the recorded tracks with the export's offset and volume rules.
  const previewAudio = (['mic', 'system'] as const).flatMap((id): PreviewAudioTrack[] => {
    const url = audioUrls?.[id]
    const track = project.audio[id]
    return url && track.enabled
      ? [{ id, url, offsetMs: track.offsetMs ?? 0, volume: track.volume }]
      : []
  })

  return (
    <div className="flex h-screen flex-col bg-background font-sans text-on-surface">
      <header className="flex items-center gap-md border-b border-border px-md py-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-xs rounded-md px-sm py-xs text-body text-tertiary-strong hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-tertiary"
        >
          <ArrowBackIcon />
          {t('editor.back')}
        </button>
        {/* Brand mark like Home's, small: the header stays a slim working bar. */}
        <div className="flex min-w-0 flex-1 items-center gap-sm">
          <Mascot pose="icon" size={28} className="shrink-0" />
          <h1 className="min-w-0 truncate text-title" title={project.name}>
            {project.name}
          </h1>
        </div>
        <button
          type="button"
          data-testid="export-open"
          disabled={!exportPlatform}
          onClick={() => {
            if (playback.playing) playback.toggle()
            setExportOpen(true)
          }}
          className={`rounded-md bg-primary px-[20px] py-[12px] text-title text-on-primary transition-colors duration-[120ms] hover:bg-[#97CB90] disabled:opacity-50 ${FOCUS_RING}`}
        >
          {t('editor.export')}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {/* isolate: the decor sits behind the canvas, only in the preview's empty margins. */}
          <div className="relative isolate flex min-h-0 flex-1 flex-col">
            <PreviewDecor />
            <Preview
              project={project}
              events={events}
              zooms={zooms}
              videoUrl={videoUrl}
              video={video}
              webcamUrl={webcamUrl}
              webcamVideo={webcamVideo}
              backgroundImage={backgroundImage}
              captions={captionTrack}
              drawRef={draw}
              onWebcamDragStart={() => history.begin()}
              onWebcamDrag={(placement) =>
                fromBase((p) => setWebcam(p, { ...placement, anchor: placement.anchor ?? null }))
              }
              onWebcamDragEnd={() => history.commit()}
              onSplitDragStart={() => history.begin()}
              onSplitDrag={(ratio) => fromBase((p) => setWebcam(p, { split: { ratio } }))}
              onSplitDragEnd={() => history.commit()}
              splitHandleLabel={t('editor.webcam.dividerHint')}
            />
            <PreviewAudio video={video} videoUrl={videoUrl} tracks={previewAudio} />
          </div>
          <div className="flex items-center gap-md border-t border-border px-md py-sm">
            <button
              type="button"
              onClick={playback.toggle}
              aria-label={t(playback.playing ? 'editor.pause' : 'editor.play')}
              title={t(playback.playing ? 'editor.pause' : 'editor.play')}
              className={`flex size-[40px] items-center justify-center rounded-full bg-surface-raised text-on-surface transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`}
            >
              {playback.playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
            </button>
            <PlaybackTimecode clock={playback.clock} fps={fps} trim={project.trim} />
            {endTrimEnd !== null && (
              <EndTrimSuggestion
                seconds={(project.durationMs - endTrimEnd) / 1000}
                onApply={() => answerEndTrim('applied')}
                onDismiss={() => answerEndTrim('dismissed')}
              />
            )}
            <FormatSwitch
              value={projectAspect(project)}
              onChange={(aspect) => edit((p) => setAspect(p, aspect))}
            />
          </div>
          <Timeline
            durationMs={project.durationMs}
            fps={fps}
            trim={project.trim}
            zooms={project.zooms}
            playhead={playback.clock}
            selectedZoomId={selectedZoomId}
            tracks={{ ...(mic ? { mic } : {}), ...(system ? { system } : {}) }}
            webcam={
              project.webcam && webcamUrl
                ? {
                    hidden: project.webcam.hidden,
                    off: !project.webcam.visible,
                    selectedIndex: selectedHidden,
                    onSelectHidden: setSelectedHidden,
                    onMoveHidden: (i, d) => fromBase((p) => moveWebcamHidden(p, i, d)),
                    onResizeHidden: (i, edge, d) =>
                      fromBase((p) => resizeWebcamHidden(p, i, edge, d)),
                    onDeleteHidden: (i) => {
                      edit((p) => deleteWebcamHidden(p, i))
                      setSelectedHidden(null)
                    },
                    onAddHidden: (tMs) => edit((p) => addWebcamHidden(p, tMs)),
                  }
                : undefined
            }
            captions={
              transcript
                ? {
                    captions: transcript.segments,
                    off: !captionSettings.enabled,
                    selectedIndex: selectedCaption,
                    editingIndex: editingCaption,
                    lang: transcript.language,
                    onSelectCaption: setSelectedCaption,
                    onEditCaption: editCaption,
                    onCaptionText: (i, text) => {
                      editText((t) => setCaptionText(t, i, text))
                      if (!text.trim()) setSelectedCaption(null)
                    },
                    onMoveCaption: (i, d) =>
                      textFromBase((t) => moveCaption(t, i, d, project.durationMs)),
                    onResizeCaption: (i, edge, d) =>
                      textFromBase((t) => resizeCaption(t, i, edge, d, project.durationMs)),
                    onDeleteCaption: (i) => {
                      editText((t) => deleteCaption(t, i))
                      setSelectedCaption(null)
                    },
                  }
                : undefined
            }
            onScrub={playback.seek}
            onSelectZoom={setSelectedZoomId}
            onMoveZoom={(id, d) => fromBase((p) => moveZoom(p, id, d))}
            onResizeZoom={(id, edge, d) => fromBase((p) => resizeZoom(p, id, edge, d))}
            onScaleZoom={(id, scale) => edit((p) => setZoomScale(p, id, scale))}
            onDeleteZoom={(id) => {
              edit((p) => deleteZoom(p, id))
              setSelectedZoomId(null)
            }}
            onCreateZoom={(tMs) => edit((p) => createZoomAt(p, tMs, pointerAt(tMs)))}
            onTrim={(start, end) => fromBase((p) => setTrim(p, start, end))}
            onTrackVolume={setVolume}
            onTrackMute={(track, muted) => setVolume(track, muted ? 0 : 1)}
            onTransactionStart={() => history.begin()}
            onTransactionEnd={() => history.commit()}
          />
        </main>
        <StylePanel
          style={project.style}
          cursor={project.cursor}
          autoZoom={autoZoom}
          noClicks={noClicks}
          onStyle={(style) => {
            setImageError(null)
            edit((p) => ({ ...p, style }))
          }}
          image={
            imagePlatform
              ? {
                  thumbnailUrl: shownImage ? imagePlatform.url(shownImage) : null,
                  selected: imageFile !== null,
                  busy: picking,
                  error: imageError,
                  onPick: () => void pickImage(),
                  onSelect: () => {
                    setImageError(null)
                    if (shownImage) applyImage(shownImage)
                  },
                }
              : undefined
          }
          onCursor={(cursor) => edit((p) => ({ ...p, cursor }))}
          onAutoZoom={(on) => edit((p) => ({ ...p, autoZoom: on }))}
          onRegenerate={regenerate}
          webcam={webcamUrl ? project.webcam : null}
          onWebcam={(patch) => edit((p) => setWebcam(p, patch))}
          aspect={projectAspect(project)}
          onSplitLayout={() =>
            // Split only shows in 9:16, so picking it also switches the preview there: one
            // undo step for both.
            edit((p) => setAspect(setWebcam(p, { layout: 'split' }), '9:16'))
          }
          captions={
            transcript || transcription
              ? {
                  settings: captionSettings,
                  transcript,
                  transcription,
                  onCaptions: (patch) => edit((p) => setCaptions(p, patch)),
                  onTranscribeAgain: transcribeAgain,
                  video,
                  time: playback.settled,
                }
              : undefined
          }
        />
      </div>
      {exportOpen && exportPlatform && (
        <ExportSheet
          project={project}
          events={events}
          zooms={zooms}
          autoZoom={autoZoom}
          video={video.current}
          webcamVideo={webcamUrl ? webcamVideo.current : null}
          backgroundImage={backgroundImage}
          // Opening the sheet pauses: the playhead holds still while it is open.
          timeMs={playback.clock.get()}
          transcript={transcript}
          platform={exportPlatform}
          onClose={() => setExportOpen(false)}
        />
      )}
      <ReplaceTranscriptDialog
        open={askReplace}
        onReplace={() => {
          setAskReplace(false)
          transcription?.onTranscribe({ replaceEdited: true })
        }}
        onKeep={() => setAskReplace(false)}
      />
    </div>
  )
}

/**
 * Time in the trimmed video / its length, under the preview. Follows the playhead on every
 * frame on its own, so playing re-renders this line and not the editor around it.
 */
function PlaybackTimecode({
  clock,
  fps,
  trim,
}: {
  clock: PlaybackClock
  fps: number
  trim: { startMs: number; endMs: number }
}) {
  const timeMs = usePlaybackTime(clock)
  return (
    <span className="font-mono text-timecode tabular-nums">
      {formatTimecode(timeMs - trim.startMs, fps)}
      <span className="text-on-surface-muted">
        {' / '}
        {formatTimecode(trim.endMs - trim.startMs, fps)}
      </span>
    </span>
  )
}

/**
 * "Trim the last 2s?" (F-16): a discreet chip next to the timecode when the recording ends on
 * the click on Stop. One click trims (undoable); the × dismisses it for good.
 */
function EndTrimSuggestion({
  seconds,
  onApply,
  onDismiss,
}: {
  seconds: number
  onApply(): void
  onDismiss(): void
}) {
  const t = useT()
  return (
    <div
      role="status"
      data-testid="end-trim-suggestion"
      className="flex min-w-0 items-center gap-xs rounded-full bg-surface-raised py-[3px] ps-[12px] pe-[3px] text-label"
    >
      <span
        className="min-w-0 truncate text-on-surface-muted"
        title={t('editor.endTrim.question', { seconds })}
      >
        {t('editor.endTrim.question', { seconds })}
      </span>
      <button
        type="button"
        data-testid="end-trim-apply"
        onClick={onApply}
        className={`shrink-0 rounded-full bg-tertiary-container px-[10px] py-[3px] font-medium text-on-surface transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`}
      >
        {t('editor.endTrim.apply')}
      </button>
      <button
        type="button"
        data-testid="end-trim-dismiss"
        onClick={onDismiss}
        aria-label={t('editor.endTrim.dismiss')}
        title={t('editor.endTrim.dismiss')}
        className={`flex size-[24px] shrink-0 items-center justify-center rounded-full text-on-surface-muted transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`}
      >
        <CloseIcon />
      </button>
    </div>
  )
}

const FORMATS: readonly Aspect[] = ['16:9', '1:1', '9:16']
const FORMAT_LABEL: Record<Aspect, string> = {
  '16:9': 'export.aspect.landscape',
  '1:1': 'export.aspect.square',
  '9:16': 'export.aspect.vertical',
}
/** Outline of each format's icon, in px (a 16px-tall box at most). */
const FORMAT_ICON: Record<Aspect, { width: number; height: number }> = {
  '16:9': { width: 18, height: 10 },
  '1:1': { width: 12, height: 12 },
  '9:16': { width: 9, height: 15 },
}

/**
 * Edit format (A-02): what the preview shows and what the export pre-checks. A compact
 * segmented control next to the timecode; changing it is one undo step like any edit.
 */
function FormatSwitch({ value, onChange }: { value: Aspect; onChange(aspect: Aspect): void }) {
  const t = useT()
  return (
    <div
      role="radiogroup"
      aria-label={t('editor.format')}
      className="ms-auto flex items-center gap-[2px] rounded-full bg-surface-raised p-[3px]"
    >
      {FORMATS.map((aspect) => {
        const selected = aspect === value
        return (
          <button
            key={aspect}
            type="button"
            role="radio"
            aria-checked={selected}
            title={t(FORMAT_LABEL[aspect])}
            data-testid={`editor-format-${aspect}`}
            onClick={() => onChange(aspect)}
            className={`flex h-[30px] items-center gap-xs rounded-full px-[12px] text-label transition-colors duration-[120ms] ${FOCUS_RING} ${
              selected
                ? 'bg-tertiary-container text-on-surface'
                : 'text-on-surface-muted hover:bg-border'
            }`}
          >
            <span
              aria-hidden
              className={`rounded-[2px] border-[1.5px] ${selected ? 'border-tertiary' : 'border-current'}`}
              style={FORMAT_ICON[aspect]}
            />
            <span className="font-medium tabular-nums">{aspect}</span>
          </button>
        )
      })}
    </div>
  )
}
