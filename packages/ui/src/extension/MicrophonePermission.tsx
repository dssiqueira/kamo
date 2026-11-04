// Extension page that asks for the microphone (E-01, flows.md → First use of the extension).
// The recorder runs in a hidden document that can't show Chrome's prompt, so the permission is
// asked here, on a visible page, once.
import { useT } from '../i18n.tsx'
import { Mascot } from '../mascot/Mascot.tsx'
import { PrimaryButton } from '../settings/parts.tsx'

export type MicrophoneStatus = 'prompt' | 'asking' | 'granted' | 'denied'

export interface MicrophonePermissionProps {
  status: MicrophoneStatus
  onAllow(): void
}

export function MicrophonePermission({ status, onAllow }: MicrophonePermissionProps) {
  const t = useT()
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-xl font-sans text-on-surface">
      <div className="flex max-w-[480px] flex-col items-center gap-lg text-center">
        <Mascot pose={status === 'granted' ? 'head-happy' : 'head-look'} size={120} backdrop />
        <h1 className="font-serif text-headline">{t('extension.microphone.title')}</h1>
        {status === 'granted' ? (
          <p role="status" className="text-body text-success">
            {t('extension.microphone.granted')}
          </p>
        ) : (
          <>
            <p className="text-body text-on-surface-muted">{t('extension.microphone.body')}</p>
            <PrimaryButton onClick={onAllow} disabled={status === 'asking'}>
              {t('extension.microphone.allow')}
            </PrimaryButton>
            {status === 'denied' && (
              <p role="alert" className="text-body text-error">
                {t('extension.microphone.denied')}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
