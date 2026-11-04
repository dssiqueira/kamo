// Permissions onboarding (flows.md §1, F-13): welcome → one permission per screen → done.
// Each screen says why, shows the live status and opens the right system settings page.
// Screen Recording is mandatory; the others can be skipped. Kamo greets and says goodbye.
import { useState } from 'react'
import { useT } from '../i18n.tsx'
import { CornerDecor } from '../decor/Decor.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { useSpring } from '../motion/useSpring.ts'
import { ExternalIcon } from '../primitives/icons.tsx'
import {
  InlineNotice,
  LinkButton,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
} from '../settings/parts.tsx'
import type { ShortcutPlatform } from '../settings/shortcut.ts'
import type { ActionResult, PermissionItem, PermissionKind } from '../settings/types.ts'

export interface OnboardingProps {
  platform: ShortcutPlatform
  /** Live statuses (the app polls while this is visible). Null while loading. */
  permissions: readonly PermissionItem[] | null
  /** Asks the OS when it has not decided yet (Mac prompt). */
  onRequest(kind: PermissionKind): void
  onOpenSettings(kind: PermissionKind): void
  /** Restarts the app (macOS may need it after Screen Recording). */
  onRelaunch(): ActionResult
  /** Saves that onboarding is done and goes to Home. */
  onFinish(): void
}

type Step =
  { kind: 'welcome' } | { kind: 'permission'; permission: PermissionKind } | { kind: 'done' }

export function Onboarding({
  platform,
  permissions,
  onRequest,
  onOpenSettings,
  onRelaunch,
  onFinish,
}: OnboardingProps) {
  const t = useT()
  const [index, setIndex] = useState(0)
  // The list of screens is fixed by the first answer, so statuses changing never reshuffle it.
  const [kinds, setKinds] = useState<PermissionKind[] | null>(null)
  if (kinds === null && permissions !== null) setKinds(permissions.map((p) => p.kind))

  const steps: Step[] = [
    { kind: 'welcome' },
    ...(kinds ?? []).map((permission) => ({ kind: 'permission' as const, permission })),
    { kind: 'done' },
  ]
  const step = steps[Math.min(index, steps.length - 1)] ?? { kind: 'welcome' }
  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1))

  // Each screen eases in with the Kamo spring; reduced motion shows it at once.
  const progress = useSpring(1, 0, index)

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-xl font-sans text-on-surface">
      <CornerDecor />
      <div
        className="relative flex w-full max-w-[560px] flex-col items-center gap-lg text-center"
        style={{ opacity: progress, transform: `translateY(${(1 - progress) * 12}px)` }}
      >
        {step.kind === 'permission' && kinds && (
          <p className="text-label text-on-surface-muted">
            {t('onboarding.progress', {
              current: kinds.indexOf(step.permission) + 1,
              total: kinds.length,
            })}
          </p>
        )}

        {step.kind === 'welcome' && (
          <>
            <Mascot pose="front" size={168} backdrop />
            <h1 className="font-serif text-display">{t('onboarding.welcome.title')}</h1>
            <p className="max-w-[440px] text-title font-normal text-on-surface-muted">
              {t('onboarding.welcome.body')}
            </p>
            <PrimaryButton disabled={kinds === null} onClick={next}>
              {t('onboarding.welcome.start')}
            </PrimaryButton>
          </>
        )}

        {step.kind === 'permission' && (
          <PermissionScreen
            key={step.permission}
            platform={platform}
            item={
              permissions?.find((p) => p.kind === step.permission) ?? {
                kind: step.permission,
                status: 'unknown',
                required: step.permission === 'screen',
              }
            }
            onRequest={onRequest}
            onOpenSettings={onOpenSettings}
            onRelaunch={onRelaunch}
            onNext={next}
          />
        )}

        {step.kind === 'done' && (
          <>
            <Mascot pose="head-happy" size={148} backdrop />
            <h1 className="font-serif text-display">{t('onboarding.done.title')}</h1>
            <p className="max-w-[440px] text-title font-normal text-on-surface-muted">
              {t('onboarding.done.body')}
            </p>
            <PrimaryButton onClick={onFinish}>{t('onboarding.done.start')}</PrimaryButton>
          </>
        )}
      </div>
    </main>
  )
}

function PermissionScreen({
  platform,
  item,
  onRequest,
  onOpenSettings,
  onRelaunch,
  onNext,
}: {
  platform: ShortcutPlatform
  item: PermissionItem
  onRequest(kind: PermissionKind): void
  onOpenSettings(kind: PermissionKind): void
  onRelaunch(): ActionResult
  onNext(): void
}) {
  const t = useT()
  const [visitedSettings, setVisitedSettings] = useState(false)
  const [relaunchError, setRelaunchError] = useState(false)
  const granted = item.status === 'granted'
  const mac = platform === 'mac'
  // Mac shows its own prompt once, while the status is still undecided.
  const canAsk = mac && item.status === 'pending' && item.kind !== 'inputMonitoring'

  const openSettings = () => {
    setVisitedSettings(true)
    onOpenSettings(item.kind)
  }

  return (
    <>
      <h1 className="font-serif text-headline">{t(`onboarding.${item.kind}.title`)}</h1>
      <p className="max-w-[460px] text-body text-on-surface-muted">
        {t(`onboarding.${item.kind}.why`)}
      </p>
      {item.kind === 'inputMonitoring' && (
        // flows.md §1: required text on Mac.
        <p className="max-w-[460px] rounded-md bg-surface-raised px-md py-sm text-body">
          {t('onboarding.inputMonitoring.keyboardNote')}
        </p>
      )}

      <div aria-live="polite" className="flex flex-col items-center gap-sm">
        <StatusPill status={item.status} label={t(`settings.permissions.status.${item.status}`)} />
        {item.status === 'denied' && (
          <p className="max-w-[460px] text-body text-on-surface-muted">
            {t(mac ? 'onboarding.deniedHelp.mac' : 'onboarding.deniedHelp.windows')}
          </p>
        )}
        {!granted && (
          <p className="text-label text-on-surface-muted">{t('onboarding.detecting')}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-sm">
        {granted ? (
          <PrimaryButton onClick={onNext}>{t('onboarding.continue')}</PrimaryButton>
        ) : canAsk ? (
          <>
            <PrimaryButton onClick={() => onRequest(item.kind)}>
              {t('onboarding.allow')}
            </PrimaryButton>
            <SecondaryButton onClick={openSettings}>
              <ExternalIcon />
              {t('settings.permissions.openSystemSettings')}
            </SecondaryButton>
          </>
        ) : (
          <PrimaryButton onClick={openSettings}>
            <ExternalIcon />
            {t('settings.permissions.openSystemSettings')}
          </PrimaryButton>
        )}
      </div>

      {!granted && !item.required && (
        <LinkButton onClick={onNext}>{t('onboarding.skip')}</LinkButton>
      )}

      {/* macOS may only report Screen Recording after a restart (F-13). */}
      {!granted && mac && item.kind === 'screen' && visitedSettings && (
        <div className="flex flex-col items-center gap-xs">
          <p className="text-body text-on-surface-muted">{t('onboarding.reopenHint')}</p>
          <LinkButton
            onClick={() => {
              void onRelaunch().then((code) => setRelaunchError(code !== null))
            }}
          >
            {t('onboarding.reopen')}
          </LinkButton>
          {relaunchError && (
            <InlineNotice tone="error">{t('onboarding.reopenFailed')}</InlineNotice>
          )}
        </div>
      )}
    </>
  )
}
