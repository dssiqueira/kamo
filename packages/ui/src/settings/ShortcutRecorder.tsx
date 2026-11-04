// Edits the global stop shortcut (F-15) by pressing the new combination. Rule 2: only keys
// pressed in this focused field of Kamo's own window are read, while the user is choosing.
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { InlineNotice, Row, SecondaryButton } from './parts.tsx'
import { acceleratorFromKeyPress, formatAccelerator, type ShortcutPlatform } from './shortcut.ts'
import type { ActionResult } from './types.ts'

export interface ShortcutRecorderProps {
  platform: ShortcutPlatform
  value: string
  defaultValue: string
  /** Null resets the default. Resolves with an error code or null. */
  onChange(accelerator: string | null): ActionResult
}

const ERRORS: Record<string, string> = {
  needs_modifier: 'settings.shortcuts.errors.needsModifier',
  unsupported: 'settings.shortcuts.errors.unsupported',
  shortcut_taken: 'settings.shortcuts.errors.taken',
  invalid_shortcut: 'settings.shortcuts.errors.invalid',
}

export function ShortcutRecorder({
  platform,
  value,
  defaultValue,
  onChange,
}: ShortcutRecorderProps) {
  const t = useT()
  const [recording, setRecording] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const field = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (recording) field.current?.focus()
  }, [recording])

  const save = (accelerator: string | null) => {
    setRecording(false)
    void onChange(accelerator).then(
      (code) =>
        setMessage(
          code
            ? {
                tone: 'error',
                text: t(ERRORS[code] ?? 'settings.shortcuts.errors.invalid', {
                  shortcut: accelerator ? formatAccelerator(accelerator, platform) : '',
                }),
              }
            : { tone: 'success', text: t('settings.shortcuts.saved') },
        ),
      () => setMessage({ tone: 'error', text: t('settings.shortcuts.errors.invalid') }),
    )
  }

  return (
    <div className="flex flex-col gap-xs">
      <Row label={t('settings.shortcuts.stop')} description={t('settings.shortcuts.stopHint')}>
        <button
          ref={field}
          type="button"
          aria-label={
            recording
              ? t('settings.shortcuts.recording')
              : `${t('settings.shortcuts.stop')}: ${formatAccelerator(value, platform)}`
          }
          aria-describedby={recording ? 'shortcut-recording-hint' : undefined}
          onClick={() => {
            setMessage(null)
            setRecording(true)
          }}
          onBlur={() => setRecording(false)}
          onKeyDown={(event) => {
            if (!recording) return
            event.preventDefault()
            event.stopPropagation()
            if (event.key === 'Escape') {
              setRecording(false)
              return
            }
            const result = acceleratorFromKeyPress(event, platform)
            if (result.kind === 'pending') return
            if (result.kind === 'shortcut') {
              if (result.accelerator === value) setRecording(false)
              else save(result.accelerator)
              return
            }
            setMessage({ tone: 'error', text: t(ERRORS[result.kind] ?? ERRORS['unsupported']!) })
          }}
          className={`min-w-[140px] rounded-md border px-[12px] py-[6px] text-center font-mono text-timecode transition-colors duration-[120ms] ${
            recording
              ? 'border-tertiary bg-tertiary-container text-on-surface'
              : 'border-border bg-surface-raised text-on-surface hover:border-tertiary-container'
          } ${FOCUS_RING}`}
        >
          {recording ? t('settings.shortcuts.recording') : formatAccelerator(value, platform)}
        </button>
        {!recording && (
          <SecondaryButton
            onClick={() => {
              setMessage(null)
              setRecording(true)
            }}
          >
            {t('settings.shortcuts.change')}
          </SecondaryButton>
        )}
        {value !== defaultValue && (
          <SecondaryButton onClick={() => save(null)}>
            {t('settings.shortcuts.reset')}
          </SecondaryButton>
        )}
      </Row>
      {recording && (
        <p id="shortcut-recording-hint" className="text-label text-on-surface-muted">
          {t('settings.shortcuts.recordingHint')}
        </p>
      )}
      {message && <InlineNotice tone={message.tone}>{message.text}</InlineNotice>}
    </div>
  )
}
