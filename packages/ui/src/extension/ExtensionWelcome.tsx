// Welcome tab, opened once when the extension is installed (E-05, flows.md → First use of the
// extension): Kamo waving, what the extension does, how to pin the icon, the one-line "tabs
// only, the desktop app does the rest", and two optional asks on this visible page: the
// microphone and the sites permission. No account anywhere. Knows nothing about Chrome (rule 1).
import type { ReactNode } from 'react'
import { resolveLocale } from '@kamo/i18n'
import { useLocale, useT } from '../i18n.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { FOCUS_RING } from '../primitives/controls.tsx'
import { SecondaryButton } from '../settings/parts.tsx'

export type WelcomeAskStatus = 'prompt' | 'asking' | 'granted' | 'denied'

export interface ExtensionWelcomeProps {
  desktopAppUrl: string
  microphone: WelcomeAskStatus
  onAllowMicrophone(): void
  /** The optional "all sites" permission that keeps clicks captured across sites (E-02). */
  sites: WelcomeAskStatus
  onAllowSites(): void
}

export function ExtensionWelcome(props: ExtensionWelcomeProps) {
  const t = useT()
  const numbers = new Intl.NumberFormat(resolveLocale([useLocale()]))
  return (
    <main className="min-h-screen bg-background px-md py-2xl font-sans text-on-surface">
      <div className="mx-auto flex max-w-[640px] flex-col gap-xl">
        <header className="flex flex-col items-center gap-md text-center">
          <Mascot pose="head-wink" size={132} backdrop />
          <h1 className="font-serif text-headline">{t('extension.welcome.title')}</h1>
          <p className="max-w-[520px] text-body text-on-surface-muted">
            {t('extension.welcome.body')}
          </p>
          <p className="text-label text-on-surface-muted" data-testid="welcome-tabs-only">
            {t('extension.welcome.tabsOnly')}{' '}
            <a
              href={props.desktopAppUrl}
              target="_blank"
              rel="noreferrer"
              className={`rounded-sm font-semibold text-tertiary-strong underline underline-offset-2 hover:text-tertiary ${FOCUS_RING}`}
            >
              {t('extension.desktopCard.action')}
            </a>
          </p>
        </header>

        <Card title={t('extension.welcome.pinTitle')}>
          <p className="text-body text-on-surface-muted">{t('extension.welcome.pinSteps')}</p>
          <PinPicture />
        </Card>

        <Card title={t('extension.welcome.stepsTitle')}>
          <ol className="flex flex-col gap-sm">
            {(['step1', 'step2', 'step3'] as const).map((step, index) => (
              <li key={step} className="flex items-start gap-sm text-body">
                <span
                  aria-hidden
                  className="flex size-[24px] shrink-0 items-center justify-center rounded-full bg-primary-container font-mono text-label"
                >
                  {numbers.format(index + 1)}
                </span>
                <span className="pt-[1px]">{t(`extension.welcome.${step}`)}</span>
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid gap-md sm:grid-cols-2">
          <Ask
            title={t('extension.welcome.micTitle')}
            body={t('extension.welcome.micBody')}
            action={t('extension.welcome.micAllow')}
            granted={t('extension.welcome.micGranted')}
            denied={t('extension.welcome.micDenied')}
            status={props.microphone}
            onAllow={props.onAllowMicrophone}
            testId="welcome-microphone"
          />
          <Ask
            title={t('extension.welcome.sitesTitle')}
            body={t('extension.welcome.sitesBody')}
            action={t('extension.welcome.sitesAllow')}
            granted={t('extension.welcome.sitesGranted')}
            status={props.sites}
            onAllow={props.onAllowSites}
            testId="welcome-sites"
          />
        </div>

        <p className="text-center text-label text-on-surface-muted">
          {t('extension.welcome.privacy')}
        </p>
      </div>
    </main>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-sm rounded-lg bg-surface p-lg shadow-[0_1px_0_rgb(0_0_0/0.04)]">
      <h2 className="text-title">{title}</h2>
      {children}
    </section>
  )
}

function Ask(props: {
  title: string
  body: string
  action: string
  granted: string
  denied?: string
  status: WelcomeAskStatus
  onAllow(): void
  testId: string
}) {
  return (
    <section
      data-testid={props.testId}
      className="flex flex-col items-start gap-sm rounded-lg border border-border bg-surface p-lg"
    >
      <h2 className="text-title">{props.title}</h2>
      <p className="text-label text-on-surface-muted">{props.body}</p>
      {props.status === 'granted' ? (
        <p role="status" className="text-label text-success">
          {props.granted}
        </p>
      ) : (
        <SecondaryButton onClick={props.onAllow} disabled={props.status === 'asking'}>
          {props.action}
        </SecondaryButton>
      )}
      {props.status === 'denied' && props.denied && (
        <p role="alert" className="text-label text-error">
          {props.denied}
        </p>
      )}
    </section>
  )
}

/** A drawn toolbar: the address bar, the puzzle piece, and the pin next to Kamo. */
function PinPicture() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 520 132"
      className="w-full max-w-[520px] self-center"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="1" width="518" height="44" rx="12" className="fill-surface-raised" />
      <rect x="16" y="11" width="330" height="24" rx="12" className="fill-surface" />
      <circle cx="34" cy="23" r="5" className="stroke-on-surface-muted" strokeWidth="1.5" />
      <rect x="48" y="20" width="120" height="6" rx="3" className="fill-border" />
      {/* the puzzle piece, highlighted */}
      <circle cx="430" cy="23" r="17" className="fill-primary-container" />
      <path
        d="M422 18h5a3 3 0 1 1 6 0h5v5a3 3 0 1 1 0 6v5h-16z"
        className="stroke-on-surface"
        strokeWidth="1.6"
      />
      <circle cx="475" cy="23" r="9" className="fill-border" />
      {/* the extensions menu, with Kamo and its pin */}
      <rect x="250" y="56" width="250" height="68" rx="12" className="fill-surface stroke-border" />
      <circle cx="276" cy="90" r="12" className="fill-primary" />
      <circle cx="279" cy="87" r="4" className="fill-surface" />
      <circle cx="280" cy="87" r="2" className="fill-tertiary-strong" />
      <rect x="298" y="86" width="90" height="8" rx="4" className="fill-border" />
      <circle cx="470" cy="90" r="15" className="fill-primary-container" />
      <path
        d="M466 82l8 8m-10-2l6-6 6 6-2 2-2 6-8-8 6-2zm-1 7l-5 5"
        className="stroke-on-surface"
        strokeWidth="1.6"
      />
      <path
        d="M430 42v12"
        className="stroke-on-surface-muted"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
    </svg>
  )
}
