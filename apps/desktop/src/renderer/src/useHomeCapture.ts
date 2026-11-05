import { pickWindow, type CaptureKind, type CaptureSourceProps } from '@kamo/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DisplayInfo } from '../../shared/api.ts'
import type { CaptureRect, CaptureTarget, WindowInfo } from '../../shared/capture.ts'

/** Windows come and go; the list (and its thumbnails) is read again this often while shown. */
const WINDOWS_REFRESH_MS = 3000

/**
 * Home's Screen · Window · Select choice (A-08): the kind, the window list and the selection,
 * remembered in settings (F-01). `target` is what Record records, or null when nothing is
 * chosen yet. Null props until settings are loaded.
 */
export function useHomeCapture(
  displays: readonly DisplayInfo[],
  selectedDisplayId: string | null,
): { props: CaptureSourceProps | null; target: CaptureTarget | null } {
  const [kind, setKind] = useState<CaptureKind | null>(null)
  const [windows, setWindows] = useState<WindowInfo[] | null>(null)
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null)
  const [region, setRegion] = useState<{ displayId: string; rect: CaptureRect } | null>(null)
  const rememberedWindow = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.kamo
      .getSettings()
      .then((settings) => {
        if (cancelled) return
        rememberedWindow.current = settings.lastWindowId ?? null
        setRegion(settings.lastRegion ?? null)
        setKind(settings.lastCaptureKind ?? 'display')
      })
      .catch(() => !cancelled && setKind('display'))
    return () => {
      cancelled = true
    }
  }, [])

  // The window list, while the Window tab shows; paused while Home is hidden.
  useEffect(() => {
    if (kind !== 'window') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      clearTimeout(timer)
      const next = await window.kamo.listWindows().catch(() => null)
      if (cancelled) return
      if (next) {
        setWindows(next)
        setSelectedWindowId((current) => pickWindow(next, current, rememberedWindow.current))
      } else {
        setWindows((current) => current ?? [])
      }
      if (document.visibilityState === 'visible') {
        timer = setTimeout(() => void refresh(), WINDOWS_REFRESH_MS)
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    void refresh()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [kind])

  const onKindChange = useCallback((next: CaptureKind) => {
    setKind(next)
    void window.kamo.updateSettings({ lastCaptureKind: next }).catch(() => {})
  }, [])

  const onSelectWindow = useCallback((id: string) => {
    setSelectedWindowId(id)
    rememberedWindow.current = id
    void window.kamo.updateSettings({ lastWindowId: id }).catch(() => {})
  }, [])

  const onPickRegion = useCallback(() => {
    if (!selectedDisplayId) return
    const displayId = selectedDisplayId
    // The frame closes (or records) with the selection; main saves it as lastRegion.
    void window.kamo
      .openSelection(displayId)
      .then((rect) => rect && setRegion({ displayId, rect }))
      .catch(() => {})
  }, [selectedDisplayId])

  if (kind === null) return { props: null, target: null }

  const regionDisplay = region && displays.find((d) => d.id === region.displayId)
  const props: CaptureSourceProps = {
    kind,
    onKindChange,
    windows:
      windows &&
      windows.map(({ id, title, app, thumbnail, icon }) => ({ id, title, app, thumbnail, icon })),
    selectedWindowId,
    onSelectWindow,
    region:
      region && regionDisplay
        ? {
            displayId: region.displayId,
            width: Math.round(region.rect.width * regionDisplay.scaleFactor),
            height: Math.round(region.rect.height * regionDisplay.scaleFactor),
          }
        : null,
    onPickRegion,
  }
  return { props, target: targetOf() }

  function targetOf(): CaptureTarget | null {
    if (kind === 'window') {
      const chosen = windows?.find((w) => w.id === selectedWindowId)
      if (!chosen) return null
      return {
        kind: 'window',
        windowId: chosen.id,
        ...(chosen.displayId ? { displayId: chosen.displayId } : {}),
      }
    }
    if (!selectedDisplayId) return null
    if (kind === 'region') {
      return region && region.displayId === selectedDisplayId && regionDisplay
        ? { kind: 'region', displayId: selectedDisplayId, rect: region.rect }
        : null
    }
    return { kind: 'display', displayId: selectedDisplayId }
  }
}
