import { useT } from '../i18n.tsx'
import { IconButton } from '../primitives/controls.tsx'
import { GearIcon } from '../primitives/icons.tsx'

/** Gear that opens Settings (flows.md: any screen → Settings). */
export function SettingsButton({ onClick }: { onClick(): void }) {
  const t = useT()
  return (
    <IconButton label={t('settings.open')} onClick={onClick}>
      <GearIcon size={18} />
    </IconButton>
  )
}
