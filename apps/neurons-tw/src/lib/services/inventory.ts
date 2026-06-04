/**
 * Consumable backpack (add-neurons-acceleration-system).
 *
 * The `inventory` table holds UNSPENT consumable stock, one row per
 * `DmnEventKind` (`count` = stock). A DMN draw DEPOSITS a consumable here
 * (no auto-fire); the player ACTIVATES from the backpack when they choose.
 *
 *   draw     → depositConsumable(kind)   // count += 1
 *   activate → activateConsumable(kind)  // count -= 1, then applyConsumableEffect
 *
 * Stock rows are never deleted (count floors at 0 + a fresh `updatedAt`) so the
 * per-kind LWW sync (inventoryAdapter) converges across devices — deleting then
 * re-syncing from a device that still holds stock would resurrect it.
 *
 * Capability spec: openspec/specs/neurons-acceleration-system/spec.md
 */

import type { DmnEventKind } from '@study-rpg/content-neurons-tw'
import { db, type InventoryRow } from '../db'
import { applyConsumableEffect } from './dmn-event-dispatcher'

/** Add one unit of a consumable to the backpack (LWW stamp). */
export async function depositConsumable(kind: DmnEventKind): Promise<void> {
  await db.transaction('rw', db.inventory, async () => {
    const existing = await db.inventory.get(kind)
    await db.inventory.put({
      kind,
      count: (existing?.count ?? 0) + 1,
      updatedAt: Date.now(),
    })
  })
}

/** All backpack rows (including zeroed stock, for LWW continuity). */
export async function getInventory(): Promise<InventoryRow[]> {
  return await db.inventory.toArray()
}

/** Current stock count for a kind (0 if no row). */
export async function getStock(kind: DmnEventKind): Promise<number> {
  const row = await db.inventory.get(kind)
  return row?.count ?? 0
}

export interface ActivateResult {
  ok: boolean
  /** Why activation failed (when !ok). */
  reason?: 'no-stock'
}

/**
 * Spend one unit of a consumable and apply its effect. Decrement is the gate:
 * a re-check inside the tx prevents a double-spend race. The effect is applied
 * POST-commit (best-effort) so a dispatcher failure doesn't leave stock
 * decremented-but-not-applied within the same throw boundary — we apply only
 * after a confirmed decrement.
 */
export async function activateConsumable(kind: DmnEventKind): Promise<ActivateResult> {
  let decremented = false
  await db.transaction('rw', db.inventory, async () => {
    const row = await db.inventory.get(kind)
    if (!row || row.count < 1) return // no stock — race-safe
    await db.inventory.put({ kind, count: row.count - 1, updatedAt: Date.now() })
    decremented = true
  })

  if (!decremented) return { ok: false, reason: 'no-stock' }

  // Synthetic provenance id — activation is not tied to one collected card.
  const sourceCardId = `activate:${kind}:${Date.now()}`
  await applyConsumableEffect(kind, sourceCardId)
  return { ok: true }
}

/**
 * Prune expired active buffs from `dmnActiveBuffs` (housekeeping). Rows with a
 * finite `expiresAt` in the past are removed; the `variant-rate-up` sentinel
 * (year-3000 expiry) is never expired by time, only consumed on slot unlock.
 * Best-effort; acceleration reads also ignore expired rows at render time, so a
 * missed prune is harmless.
 */
export async function pruneExpiredBuffs(): Promise<number> {
  const now = Date.now()
  const expired = await db.dmnActiveBuffs.where('expiresAt').below(now).toArray()
  const ids = expired.map((b) => b.id).filter((id): id is number => typeof id === 'number')
  if (ids.length > 0) await db.dmnActiveBuffs.bulkDelete(ids)
  return ids.length
}
