// A small notice floating over a full-window screen (the extension's editor): what the platform
// needs to say that the editor itself doesn't know about (clicks not captured after X:XX, a
// download the browser didn't save). One line, an optional action, a ×. Knows nothing about
// Chrome (rule 1).
import { useT } from '../i18n.tsx'
import { FOCUS_RING, IconButton } from '../primitives/controls.tsx'
import { CloseIcon } from '../primitives/icons.tsx'

export interface FloatingNoticeItem {
  id: string
  /** Already translated. */
  text: string
  tone: 'warning' | 'error' | 'success'
  action?: { label: string; onClick(): void } | undefined
}

export interface FloatingNoticesProps {
  notices: readonly FloatingNoticeItem[]
  onDismiss(id: string): void
}

const TONE = {
  warning: 'bg-warning',
  error: 'bg-error',
  success: 'bg-success',
} as const

export function FloatingNotices({ notices, onDismiss }: FloatingNoticesProps) {
  const t = useT()
  if (notices.length === 0) return null
  return (
    <div className="pointer-events-none fixed top-[72px] left-1/2 z-50 flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-sm">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role={notice.tone === 'success' ? 'status' : 'alert'}
          data-testid={`notice-${notice.id}`}
          className="pointer-events-auto flex items-center gap-sm rounded-lg border border-border bg-surface py-sm pr-xs pl-md shadow-[0_8px_24px_rgb(0_0_0/0.12)]"
        >
          <span aria-hidden className={`size-[8px] shrink-0 rounded-full ${TONE[notice.tone]}`} />
          <p className="min-w-0 flex-1 text-body">{notice.text}</p>
          {notice.action && (
            <button
              type="button"
              onClick={notice.action.onClick}
              className={`shrink-0 rounded-md bg-surface-raised px-[12px] py-[5px] text-label font-semibold transition-colors duration-[120ms] hover:bg-border ${FOCUS_RING}`}
            >
              {notice.action.label}
            </button>
          )}
          <IconButton label={t('extension.editor.dismiss')} onClick={() => onDismiss(notice.id)}>
            <CloseIcon />
          </IconButton>
        </div>
      ))}
    </div>
  )
}
