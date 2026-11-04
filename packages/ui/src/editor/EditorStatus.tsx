import { useT } from '../i18n.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { PreviewDecor } from './PreviewDecor.tsx'

export interface EditorStatusProps {
  /** Opening the project, or it could not be read. */
  state: 'loading' | 'failed'
  /** Shown only when it failed: back to the project list. */
  onBack(): void
}

/**
 * What the editor window shows before the project is ready: Kamo waiting while it opens, or
 * looking aside when it could not be read, with the way back to Home.
 */
export function EditorStatus({ state, onBack }: EditorStatusProps) {
  const t = useT()
  const failed = state === 'failed'
  return (
    <main
      className="relative isolate flex h-screen flex-col items-center justify-center gap-md bg-background font-sans text-on-surface"
      aria-busy={!failed}
    >
      <PreviewDecor />
      <Mascot pose={failed ? 'head-look-side' : 'head-look'} size={96} />
      <p role={failed ? 'alert' : 'status'} className="text-body text-on-surface-muted">
        {t(failed ? 'editor.errors.load' : 'editor.loading')}
      </p>
      {failed && (
        <button
          type="button"
          onClick={onBack}
          className={`rounded-md bg-surface-raised px-md py-sm text-body hover:bg-border ${FOCUS_RING}`}
        >
          {t('editor.back')}
        </button>
      )}
    </main>
  )
}
