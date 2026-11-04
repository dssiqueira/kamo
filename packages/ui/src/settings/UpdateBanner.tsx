// F-14: "New version ready, restart now?". A quiet banner, never a modal: the user restarts
// when it suits them, and Kamo refuses while recording or exporting.
import { useState } from 'react'
import { useT } from '../i18n.tsx'
import { LinkButton, SecondaryButton } from './parts.tsx'
import type { ActionResult } from './types.ts'

export interface UpdateBannerProps {
  version: string
  /** Resolves with `busy` when Kamo is recording or exporting. */
  onRestart(): ActionResult
  onDismiss(): void
}

export function UpdateBanner({ version, onRestart, onDismiss }: UpdateBannerProps) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-sm rounded-md bg-tertiary-container px-md py-sm text-body text-on-surface"
    >
      <span>{busy ? t('updates.busy') : t('updates.ready', { version })}</span>
      <span className="flex items-center gap-md">
        <LinkButton onClick={onDismiss}>{t('updates.later')}</LinkButton>
        <SecondaryButton
          onClick={() => {
            void onRestart().then((code) => setBusy(code === 'busy'))
          }}
        >
          {t('updates.restart')}
        </SecondaryButton>
      </span>
    </div>
  )
}
