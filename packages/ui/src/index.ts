// Kamo editor, timeline and panels (React). It does not know where it runs (rule 1).
export { AppShell } from './AppShell.tsx'
export { I18nProvider, useLocale, useT } from './i18n.tsx'
export type { I18n, I18nProviderProps, Translate } from './i18n.tsx'
export { Home } from './home/Home.tsx'
export type { HomeProps } from './home/Home.tsx'
export { ProjectList, MAX_PROJECT_NAME_LENGTH } from './home/ProjectList.tsx'
export type { BrokenProjectData, ProjectCardData, ProjectListProps } from './home/ProjectList.tsx'
export { MAX_PLAYLIST_NAME_LENGTH } from './home/Playlists.tsx'
export type { PlaylistData, PlaylistsProps } from './home/Playlists.tsx'
export { pickDisplay } from './home/pickDisplay.ts'
export type { DisplayOption } from './home/pickDisplay.ts'
export { filterWindows, pickWindow } from './home/captureSource.ts'
export type { CaptureKind, RegionOption, WindowOption } from './home/captureSource.ts'
export type { CaptureSourceProps } from './home/CaptureSource.tsx'
export { InterruptedRecordings } from './home/InterruptedRecordings.tsx'
export type {
  InterruptedRecordingData,
  InterruptedRecordingsProps,
  RecoveryOutcome,
} from './home/InterruptedRecordings.tsx'
export { AudioSources } from './home/AudioSources.tsx'
export { CameraSource } from './home/CameraSource.tsx'
export type { CameraOption, CameraSourceProps, CameraStatus } from './home/CameraSource.tsx'
export type {
  AudioLevelsView,
  AudioSourcesProps,
  AudioSourceView,
  MicrophoneOption,
} from './home/AudioSources.tsx'
export { levelFromRms, rmsOf, smoothLevel, METER_FLOOR_DB } from './home/audioLevel.ts'
export { Countdown } from './recording/Countdown.tsx'
export type { CountdownProps } from './recording/Countdown.tsx'
export { RegionOverlay } from './recording/RegionOverlay.tsx'
export type { RegionOverlayProps } from './recording/RegionOverlay.tsx'
export { RecordingBar } from './recording/RecordingBar.tsx'
export type { RecordingBarProps, RecordingClock } from './recording/RecordingBar.tsx'
export { useSpring } from './motion/useSpring.ts'
export { Editor } from './editor/Editor.tsx'
export type { EditorProps } from './editor/Editor.tsx'
export type {
  BackgroundImageErrorCode,
  BackgroundImagePick,
  BackgroundImagePlatform,
} from './editor/background-image.ts'
export type { EditorTranscription } from './editor/CaptionsSection.tsx'
export { EditorStatus } from './editor/EditorStatus.tsx'
export type { EditorStatusProps } from './editor/EditorStatus.tsx'
export * from './timeline/index.ts'
export { Mascot } from './mascot/Mascot.tsx'
export type { MascotPose, MascotProps } from './mascot/Mascot.tsx'
export { ExportSheet } from './export/ExportSheet.tsx'
export type { ExportSheetProps } from './export/ExportSheet.tsx'
export type { CaptionExport, ExportMedia, ExportPlatform } from './export/useExportRun.ts'
export { srtFor, srtName } from './export/useExportRun.ts'
// Settings (F-15), help (F-17), updates (F-14) and the permissions onboarding (F-13).
export { Settings, localeName } from './settings/Settings.tsx'
export type { SettingsProps } from './settings/Settings.tsx'
export { SettingsButton } from './settings/SettingsButton.tsx'
export { UpdateBanner } from './settings/UpdateBanner.tsx'
export type { UpdateBannerProps } from './settings/UpdateBanner.tsx'
export { Onboarding } from './onboarding/Onboarding.tsx'
export type { OnboardingProps } from './onboarding/Onboarding.tsx'
export { acceleratorFromKeyPress, formatAccelerator } from './settings/shortcut.ts'
export type { KeyPress, KeyPressResult, ShortcutPlatform } from './settings/shortcut.ts'
export type * from './settings/types.ts'
export { CornerDecor, DecorPiece } from './decor/Decor.tsx'
// Chrome extension screens (E-01): the popup and the microphone permission page.
export { ExtensionPopup } from './extension/ExtensionPopup.tsx'
export type {
  ExtensionPopupProps,
  PopupNotice,
  PopupPhase,
  PopupProject,
  PopupTab,
} from './extension/ExtensionPopup.tsx'
export { DevicePermission } from './extension/DevicePermission.tsx'
export { DesktopAppCard, DesktopAppProvider } from './extension/DesktopAppCard.tsx'
export type { DesktopAppCardProps } from './extension/DesktopAppCard.tsx'
// Extension pages (E-03, E-05): All projects, the welcome tab, notices over the editor.
export { ExtensionProjects } from './extension/ExtensionProjects.tsx'
export type { ExtensionProjectsProps } from './extension/ExtensionProjects.tsx'
export { ExtensionWelcome } from './extension/ExtensionWelcome.tsx'
export type { ExtensionWelcomeProps, WelcomeAskStatus } from './extension/ExtensionWelcome.tsx'
export { FloatingNotices } from './extension/FloatingNotice.tsx'
export type { FloatingNoticeItem, FloatingNoticesProps } from './extension/FloatingNotice.tsx'
export type {
  DevicePermissionProps,
  PermissionDevice,
  PermissionStatus,
} from './extension/DevicePermission.tsx'
// Optional packs (A-07) and local transcription (A-05).
export * from './packs/index.ts'
