import { Countdown } from '@kamo/ui'
import { useEffect, useState } from 'react'
import { boot } from './boot.tsx'

const STEP_MS = 1000

/** 3-2-1 on the chosen display; Esc cancels (F-01). Main records once this reports done. */
function DesktopCountdown() {
  const [value, setValue] = useState(3)

  useEffect(() => {
    if (value === 0) {
      void window.kamo.countdownDone()
      return
    }
    const timer = setTimeout(() => setValue((v) => v - 1), STEP_MS)
    return () => clearTimeout(timer)
  }, [value])

  useEffect(() => {
    // Keys of our own focused window only; Kamo never listens to the keyboard globally (rule 2).
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void window.kamo.cancelCountdown()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return value > 0 ? <Countdown value={value} /> : null
}

await boot(() => <DesktopCountdown />)
