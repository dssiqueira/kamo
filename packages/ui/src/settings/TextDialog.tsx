// Shows a block of text before anything happens to it: the diagnostics (F-17: the person sees
// what they are about to send) and the third-party notices.
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n.tsx'
import { ExternalIcon } from '../primitives/icons.tsx'
import { Dialog, InlineNotice, SecondaryButton } from './parts.tsx'
import type { ActionResult } from './types.ts'

export interface TextDialogProps {
  open: boolean
  title: string
  intro?: string
  /** Accessible name of the text area. */
  textLabel: string
  load(): Promise<string>
  onClose(): void
  /** Diagnostics only: Copy and Open issue on GitHub. */
  actions?: { onCopy(text: string): ActionResult; onOpenIssue(text: string): ActionResult }
}

type LoadState = { kind: 'loading' } | { kind: 'ready'; text: string } | { kind: 'failed' }

export function TextDialog({
  open,
  title,
  intro,
  textLabel,
  load,
  onClose,
  actions,
}: TextDialogProps) {
  const t = useT()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; key: string } | null>(null)

  const loadRef = useRef(load)
  loadRef.current = load

  // Fresh text every time it opens (new log lines, new permission statuses).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setState({ kind: 'loading' })
    setNotice(null)
    loadRef.current().then(
      (text) => !cancelled && setState({ kind: 'ready', text }),
      () => !cancelled && setState({ kind: 'failed' }),
    )
    return () => {
      cancelled = true
    }
  }, [open])

  const text = state.kind === 'ready' ? state.text : null

  return (
    <Dialog
      open={open}
      title={title}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        actions && (
          <>
            {notice && <InlineNotice tone={notice.tone}>{t(notice.key)}</InlineNotice>}
            <SecondaryButton
              disabled={text === null}
              onClick={() => {
                if (text === null) return
                void actions
                  .onOpenIssue(text)
                  .then((code) =>
                    setNotice(code ? { tone: 'error', key: 'diagnostics.openIssueFailed' } : null),
                  )
              }}
            >
              <ExternalIcon />
              {t('diagnostics.openIssue')}
            </SecondaryButton>
            <SecondaryButton
              disabled={text === null}
              onClick={() => {
                if (text === null) return
                void actions
                  .onCopy(text)
                  .then((code) =>
                    setNotice(
                      code
                        ? { tone: 'error', key: 'diagnostics.copyFailed' }
                        : { tone: 'success', key: 'diagnostics.copied' },
                    ),
                  )
              }}
            >
              {t('diagnostics.copy')}
            </SecondaryButton>
          </>
        )
      }
    >
      {intro && <p className="text-body text-on-surface-muted">{intro}</p>}
      {state.kind === 'failed' ? (
        <InlineNotice tone="error">{t('diagnostics.failed')}</InlineNotice>
      ) : (
        <pre
          aria-label={textLabel}
          tabIndex={0}
          className="min-h-[160px] flex-1 overflow-auto rounded-md border border-border bg-surface-raised p-sm font-mono text-label whitespace-pre-wrap break-all text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary"
        >
          {text ?? t('diagnostics.loading')}
        </pre>
      )}
      {actions && (
        <p className="text-label text-on-surface-muted">{t('diagnostics.openIssueHint')}</p>
      )}
    </Dialog>
  )
}
