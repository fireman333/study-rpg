import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { DMN_CARD_CATALOG, EQUIPMENT_CATALOG } from '@study-rpg/content-neurons-tw'
import { db } from '../db'

export interface DmnStatus {
  drawsAvailable: number
  ownedCount: number
  catalogSize: number
  /** True when both consumable dex AND equipment dex are fully owned. */
  bothPoolsExhausted: boolean
}

/**
 * Hook that returns current DMN draw availability + collection progress.
 * Uses Dexie liveQuery so it auto-updates when counters change.
 *
 * `bothPoolsExhausted` is the canonical「all draws would be no-ops」 signal
 * per `tighten-neurons-dmn-entitlement-semantics`: when true, the draw
 * button SHALL be disabled (even if `drawsAvailable > 0`), mirroring the
 * engine guard in `drawDmnCard()` that returns null without decrementing.
 */
export function useDmnStatus(): DmnStatus {
  const catalogSize = DMN_CARD_CATALOG.length
  const equipmentSize = EQUIPMENT_CATALOG.length
  const [status, setStatus] = useState<DmnStatus>({
    drawsAvailable: 0,
    ownedCount: 0,
    catalogSize,
    bothPoolsExhausted: false,
  })

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [metaRow, ownedCount, ownedEquipmentCount] = await Promise.all([
        db.meta.get('dmnDrawsAvailable'),
        db.dmnCards.count(),
        db.equipment.count(),
      ])
      const drawsAvailable = parseInt(metaRow?.value ?? '0', 10) || 0
      const bothPoolsExhausted =
        ownedCount >= catalogSize && ownedEquipmentCount >= equipmentSize
      return { drawsAvailable, ownedCount, catalogSize, bothPoolsExhausted }
    }).subscribe({
      next: (val) => setStatus(val),
      error: (err) => console.error('[useDmnStatus] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [catalogSize, equipmentSize])

  return status
}
