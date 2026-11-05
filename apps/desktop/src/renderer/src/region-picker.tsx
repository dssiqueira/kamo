import { RegionOverlay } from '@kamo/ui'
import { useEffect, useState } from 'react'
import { MIN_REGION_PIXELS } from '../../shared/capture.ts'
import { boot } from './boot.tsx'

/** A-08: the overlay main opens over one display to drag the region to record. */
function DesktopRegionPicker() {
  const [scaleFactor, setScaleFactor] = useState<number | null>(null)

  useEffect(() => {
    void window.kamo
      .getRegionPicker()
      .then((info) => {
        if (info) setScaleFactor(info.scaleFactor)
        else void window.kamo.finishRegionPicker(null)
      })
      .catch(() => void window.kamo.finishRegionPicker(null))
  }, [])

  if (scaleFactor === null) return null
  return (
    <RegionOverlay
      scaleFactor={scaleFactor}
      minPixels={MIN_REGION_PIXELS}
      onDone={(rect) => void window.kamo.finishRegionPicker(rect)}
    />
  )
}

await boot(() => <DesktopRegionPicker />)
