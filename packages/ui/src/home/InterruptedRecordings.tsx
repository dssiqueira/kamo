// F-02: "We found an interrupted recording". A quiet banner on Home for each recording a crash
// or a forced quit left behind: Recover makes it a project (and the app opens it), Discard
// moves it to the trash after a small confirmation. Record stays the only sage button.
import { formatDate, resolveLocale } from '@kamo/i18n'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { useLocale, useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { LinkButton, SecondaryButton } from '../settings/parts.tsx'

export interface InterruptedRecordingData {
  projectId: string
  /** ISO date the recording started. */
  startedAt: string
}

/** How an action ended: `unrecoverable` when nothing of the video can be played. */
export type RecoveryOutcome = 'ok' | 'unrecoverable' | 'failed'

export interface InterruptedRecordingsProps {
  recordings: readonly InterruptedRecordingData[]
  /** Recovers and, on success, opens the project (the app does that part). */
  onRecover(projectId: string): Promise<RecoveryOutcome>
  /** Called after the user confirmed. */
  onDiscard(projectId: string): Promise<RecoveryOutcome>
}

export function InterruptedRecordings({
  recordings,
  onRecover,
  onDiscard,
}: InterruptedRecordingsProps) {
  if (recordings.length === 0) return null
  return (
    <div className="flex flex-col gap-sm">
      {recordings.map((recording) => (
        <InterruptedRow
          key={recording.projectId}
          recording={recording}
          onRecover={() => onRecover(recording.projectId)}
          onDiscard={() => onDiscard(recording.projectId)}
        />
      ))}
    </div>
  )
}

interface RowProps {
  recording: InterruptedRecordingData
  onRecover(): Promise<RecoveryOutcome>
  onDiscard(): Promise<RecoveryOutcome>
}

type RowState = 'idle' | 'confirming' | 'recovering' | 'discarding'

function InterruptedRow({ recording, onRecover, onDiscard }: RowProps) {
  const t = useT()
  const locale = resolveLocale([useLocale()])
  const [state, setState] = useState<RowState>('idle')
  const [problem, setProblem] = useState<Exclude<RecoveryOutcome, 'ok'> | null>(null)
  const discardButton = useRef<HTMLButtonElement>(null)
  const textId = useId()

  const run = (next: RowState, action: () => Promise<RecoveryOutcome>) => {
    setState(next)
    setProblem(null)
    void action()
      .catch((): RecoveryOutcome => 'failed')
      .then((outcome) => {
        // on success the row goes away with the next list (or the editor opens)
        setState('idle')
        if (outcome !== 'ok') setProblem(outcome)
      })
  }

  const date = formatDate(locale, new Date(recording.startedAt), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const busy = state === 'recovering' || state === 'discarding'

  return (
    <div
      role="group"
      aria-labelledby={textId}
      className="flex flex-col gap-sm rounded-md border border-border bg-surface px-md py-sm text-body text-on-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p id={textId}>
          {t('recovery.found', { date })}{' '}
          {problem && (
            <span role="alert" className="text-error">
              {t(problem === 'unrecoverable' ? 'recovery.unrecoverable' : 'recovery.failed')}
            </span>
          )}
        </p>
        {state !== 'confirming' && (
          <span className="flex items-center gap-md">
            {busy ? (
              <span role="status" className="text-on-surface-muted">
                {t(state === 'recovering' ? 'recovery.recovering' : 'recovery.discarding')}
              </span>
            ) : (
              <>
                <DiscardButton buttonRef={discardButton} onClick={() => setState('confirming')} />
                {problem !== 'unrecoverable' && (
                  <SecondaryButton onClick={() => run('recovering', onRecover)}>
                    {t('recovery.recover')}
                  </SecondaryButton>
                )}
              </>
            )}
          </span>
        )}
      </div>
      {state === 'confirming' && (
        <ConfirmDiscard
          onCancel={() => {
            setState('idle')
            // the Discard button is back on the next render
            setTimeout(() => discardButton.current?.focus())
          }}
          onConfirm={() => run('discarding', onDiscard)}
        />
      )}
    </div>
  )
}

function DiscardButton({
  buttonRef,
  onClick,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>
  onClick(): void
}) {
  const t = useT()
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={`rounded-sm text-body text-on-surface-muted underline-offset-2 hover:text-on-surface hover:underline ${FOCUS_RING}`}
    >
      {t('recovery.discard')}
    </button>
  )
}

function ConfirmDiscard({ onCancel, onConfirm }: { onCancel(): void; onConfirm(): void }) {
  const t = useT()
  const cancel = useRef<HTMLDivElement>(null)
  const textId = useId()

  useEffect(() => cancel.current?.querySelector('button')?.focus(), [])

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={textId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
      className="flex flex-wrap items-center justify-between gap-sm border-t border-border pt-sm"
    >
      <p id={textId} className="text-body">
        {t('recovery.discardConfirm')}
      </p>
      <span ref={cancel} className="flex items-center gap-md">
        <LinkButton onClick={onCancel}>{t('common.cancel')}</LinkButton>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-md bg-surface-raised px-[14px] py-[7px] text-body font-semibold text-error transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`}
        >
          {t('projects.moveToTrash')}
        </button>
      </span>
    </div>
  )
}
