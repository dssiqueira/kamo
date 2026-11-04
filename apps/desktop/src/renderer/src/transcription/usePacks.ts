// Optional packs (A-07) for the desktop windows: main's pack status, live, and the actions the
// UI's PackRow buttons call. `refresh` is the only call that fetches the list of packs.
import type { PackActions } from '@kamo/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PACK_IDS, type PackId, type PacksStatus } from '../../../shared/packs.ts'
import { attempt } from '../preferences/actions.ts'

function packId(id: string): PackId {
  if (!(PACK_IDS as readonly string[]).includes(id)) throw new Error(`unknown pack ${id}`)
  return id as PackId
}

export function usePacks(): {
  status: PacksStatus | null
  refresh(): void
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

  const refresh = useCallback(() => {
    void window.kamo.refreshPacks().then(setStatus, () => {})
  }, [])

  const actions = useMemo<PackActions>(
    () => ({
      onInstall: (id) => void window.kamo.installPack(packId(id)).catch(() => {}),
      onPause: (id) => void window.kamo.pausePack(packId(id)).catch(() => {}),
      onCancel: (id) => void window.kamo.cancelPack(packId(id)).catch(() => {}),
      onRemove: (id) => attempt(() => window.kamo.removePack(packId(id))),
      onRetryCatalog: refresh,
    }),
    [refresh],
  )

  return { status, refresh, actions }
}
