// Extension page that asks for the microphone or the camera (E-01, A-03, flows.md → First use
// of the extension). The recorder runs in a hidden document that can't show Chrome's prompt,
// so each permission is asked here, on a visible page, once.
import { useT } from '../i18n.tsx'
import { REST_POSE } from '../mascot/gaze.ts'
import { Mascot } from '../mascot/Mascot.tsx'
import { PrimaryButton } from '../settings/parts.tsx'

export type PermissionDevice = 'microphone' | 'camera'
export type PermissionStatus = 'prompt' | 'asking' | 'granted' | 'denied'

export interface DevicePermissionProps {
  device: PermissionDevice
  status: PermissionStatus
  onAllow(): void
}

const TEXT = {
  microphone: {
    title: 'extension.microphone.title',
    body: 'extension.microphone.body',
    allow: 'extension.microphone.allow',
    granted: 'extension.microphone.granted',
    denied: 'extension.microphone.denied',
  },
  camera: {
    title: 'extension.camera.title',
    body: 'extension.camera.body',
    allow: 'extension.camera.allow',
    granted: 'extension.camera.granted',
    denied: 'extension.camera.denied',
  },
} as const

export function DevicePermission({ device, status, onAllow }: DevicePermissionProps) {
  const t = useT()
  const text = TEXT[device]
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-xl font-sans text-on-surface">
      <div className="flex max-w-[480px] flex-col items-center gap-lg text-center">
        <Mascot pose={status === 'granted' ? 'head-happy' : REST_POSE} size={120} backdrop />
        <h1 className="font-serif text-headline">{t(text.title)}</h1>
        {status === 'granted' ? (
          <p role="status" className="text-body text-success">
            {t(text.granted)}
          </p>
        ) : (
          <>
            <p className="text-body text-on-surface-muted">{t(text.body)}</p>
            <PrimaryButton onClick={onAllow} disabled={status === 'asking'}>
              {t(text.allow)}
            </PrimaryButton>
            {status === 'denied' && (
              <p role="alert" className="text-body text-error">
                {t(text.denied)}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
