// "Want captions?": the friendly pointer to the desktop app, where transcription and captions
// run (the extension has neither). One small paper card: Kamo, one line of title, one muted
// line, one secondary button. Shown in the extension popup (dismissible) and, through
// `DesktopAppProvider`, in the editor's Captions section. It knows nothing about Chrome (rule 1).
import { createContext, useContext, type ReactNode } from 'react'
import { useT } from '../i18n.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { FOCUS_RING, IconButton } from '../primitives/controls.tsx'
import { CloseIcon } from '../primitives/icons.tsx'

export interface DesktopAppCardProps {
  /** Where to get the desktop app; opened in a new tab by the user's click. */
  url: string
  /** Shows the × that hides the card; the app remembers it. Omitted: not dismissible. */
  onDismiss?: (() => void) | undefined
  /** `section`: inside an editor panel, without its own paper. */
  variant?: 'card' | 'section'
}

export function DesktopAppCard({ url, onDismiss, variant = 'card' }: DesktopAppCardProps) {
  const t = useT()
  return (
    <aside
      aria-labelledby="desktop-app-card-title"
      data-testid="desktop-app-card"
      className={`relative flex items-start gap-sm ${
        variant === 'card'
          ? 'rounded-lg bg-surface-raised p-md shadow-[0_1px_0_rgb(0_0_0/0.04)]'
          : ''
      }`}
    >
      <Mascot pose="head-happy" size={36} className="mt-[2px] shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-xs">
        <h2 id="desktop-app-card-title" className="pr-lg text-body font-semibold">
          {t('extension.desktopCard.title')}
        </h2>
        <p className="text-label text-on-surface-muted">{t('extension.desktopCard.body')}</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`mt-[2px] rounded-md border border-border bg-surface px-[12px] py-[5px] text-label font-semibold text-on-surface transition-colors duration-[120ms] hover:bg-surface-raised ${FOCUS_RING}`}
        >
          {t('extension.desktopCard.action')}
        </a>
      </div>
      {onDismiss && (
        <span className="absolute top-[6px] right-[6px]">
          <IconButton label={t('extension.desktopCard.dismiss')} onClick={onDismiss}>
            <CloseIcon />
          </IconButton>
        </span>
      )}
    </aside>
  )
}

/**
 * Where the platform sends people for transcription and captions. Set by an app that cannot
 * transcribe (the extension); the editor's Captions section then shows the card instead of
 * staying hidden.
 */
const DesktopAppContext = createContext<string | null>(null)

export function DesktopAppProvider({ url, children }: { url: string; children: ReactNode }) {
  return <DesktopAppContext.Provider value={url}>{children}</DesktopAppContext.Provider>
}

/** The desktop app's address, when the app set one (see DesktopAppProvider). */
export function useDesktopAppUrl(): string | null {
  return useContext(DesktopAppContext)
}
