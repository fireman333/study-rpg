import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { DMN_CARD_CATALOG, EQUIPMENT_CATALOG } from '@study-rpg/content-neurons-tw'
import { db } from '../db'

export interface DmnStatus {
  drawsAvailable: number
  /** Consumable dex faces collected (0–22). */
  ownedCount: number
  /** Consumable catalog size (22). */
  catalogSize: number
  /** Total collection owned = consumable dex faces + owned equipment (0–34). */
  collectionOwned: number
  /** Total collectibles = consumable faces + equipment (34). */
  collectionTotal: number
}

/**
 * Hook that returns current DMN draw availability + collection progress.
 * Uses Dexie liveQuery so it auto-updates when counters change.
 *
 * Consumables are repeatable (make-neurons-dmn-consumables-repeatable), so a
 * draw is never a no-op when `drawsAvailable >= 1` — there is no
 * "both pools exhausted" disabled state. `collectionOwned / collectionTotal`
 * (consumable dex + equipment, out of 34) drives the progress chip.
 */
export function useDmnStatus(): DmnStatus {
  const catalogSize = DMN_CARD_CATALOG.length
  const equipmentSize = EQUIPMENT_CATALOG.length
  const collectionTotal = catalogSize + equipmentSize
  const [status, setStatus] = useState<DmnStatus>({
    drawsAvailable: 0,
    ownedCount: 0,
    catalogSize,
    collectionOwned: 0,
    collectionTotal,
  })

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [metaRow, ownedCount, ownedEquipmentCount] = await Promise.all([
        db.meta.get('dmnDrawsAvailable'),
        db.dmnCards.count(),
        db.equipment.count(),
      ])
      const drawsAvailable = parseInt(metaRow?.value ?? '0', 10) || 0
      return {
        drawsAvailable,
        ownedCount,
        catalogSize,
        collectionOwned: ownedCount + ownedEquipmentCount,
        collectionTotal,
      }
    }).subscribe({
      next: (val) => setStatus(val),
      error: (err) => console.error('[useDmnStatus] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [catalogSize, equipmentSize, collectionTotal])

  return status
}
