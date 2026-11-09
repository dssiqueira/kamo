// Optional packs (A-07, D-042) for the desktop windows: main's pack status, live, and the
// actions the UI's buttons call. Only `onInstall` reaches the network (one model download).
import type { PackActions } from '@kamo/ui'
import { useEffect, useMemo, useState } from 'react'
import { PACK_IDS, type PackId, type PacksStatus } from '../../../shared/packs.ts'
import { attempt } from '../preferences/actions.ts'

function packId(id: string): PackId {
  if (!(PACK_IDS as readonly string[]).includes(id)) throw new Error(`unknown pack ${id}`)
  return id as PackId
}

export function usePacks(): {
  status: PacksStatus | null
  actions: PackActions
} {
  const [status, setStatus] = useState<PacksStatus | null>(null)

  useEffect(() => {
    let alive = true
    void window.kamo.getPacks().then((next) => alive && setStatus(next))
    const unsubscribe = window.kamo.onPacksChanged(setStatus)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const actions = useMemo<PackActions>(
    () => ({
      onInstall: (id) => void window.kamo.installPack(packId(id)).catch(() => {}),
      onPause: (id) => void window.kamo.pausePack(packId(id)).catch(() => {}),
      onCancel: (id) => void window.kamo.cancelPack(packId(id)).catch(() => {}),
      onRemove: (id) => attempt(() => window.kamo.removePack(packId(id))),
    }),
    [],
  )

  return { status, actions }
}
