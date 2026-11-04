// "Transcribe again" on a transcript the user corrected through the captions (A-06): a new
// transcription would replace those fixes, so it asks first. Keeping them is the default.
import { useT } from '../i18n.tsx'
import { Dialog, PrimaryButton, SecondaryButton } from '../settings/parts.tsx'

export interface ReplaceTranscriptDialogProps {
  open: boolean
  onReplace(): void
  onKeep(): void
}

export function ReplaceTranscriptDialog({ open, onReplace, onKeep }: ReplaceTranscriptDialogProps) {
  const t = useT()
  return (
    <Dialog
      open={open}
      title={t('transcription.replace.title')}
      closeLabel={t('common.close')}
      onClose={onKeep}
      footer={
        <>
          <SecondaryButton onClick={onKeep}>{t('transcription.replace.keep')}</SecondaryButton>
          <PrimaryButton onClick={onReplace}>{t('transcription.replace.confirm')}</PrimaryButton>
        </>
      }
    >
      <p className="text-body text-on-surface-muted">{t('transcription.replace.body')}</p>
    </Dialog>
  )
}
