import { formatAccelerator, SelectionBorder, SelectionFrame } from '@kamo/ui'
import { useEffect, useState } from 'react'
import type { SelectionInfo } from '../../shared/api.ts'
import { boot } from './boot.tsx'

const platform = navigator.userAgent.includes('Mac') ? 'mac' : 'windows'

/** A-08 "Select": the frame main opens over one display (see main/selection-frame.ts). */
function DesktopSelectionFrame() {
  const [info, setInfo] = useState<SelectionInfo | null>(null)

  useEffect(() => {
    void window.kamo
      .getSelection()
      .then((next) => {
        if (next) setInfo(next)
        else window.close()
      })
      .catch(() => window.close())
  }, [])

  if (!info) return null
  return (
    <SelectionFrame
      display={info.display}
      initial={info.rect}
      stopShortcut={formatAccelerator(info.stopShortcut, platform)}
      onHitAreas={(areas, holding) =>
        void window.kamo.setSelectionHitAreas(areas, holding).catch(() => {})
      }
      onRecord={(rect) => void window.kamo.recordSelection(rect)}
      onClose={(rect) => void window.kamo.closeSelection(rect)}
    />
  )
}

/**
 * While recording a selection, the same page draws only the line around it (`?border=x,y,w,h`:
 * the selection in this window, DIP). The window lets every click through and is left out of
 * the video.
 */
function borderInner(): { x: number; y: number; width: number; height: number } | null {
  const value = new URLSearchParams(location.search).get('border')
  const parts = value?.split(',').map(Number)
  if (!parts || parts.length !== 4 || !parts.every(Number.isFinite)) return null
  const [x, y, width, height] = parts as [number, number, number, number]
  return { x, y, width, height }
}

const inner = borderInner()
await boot(() => (inner ? <SelectionBorder inner={inner} /> : <DesktopSelectionFrame />))
