/**
 * Representative-variant selection for the /collection dex page.
 *
 * The player may pick one collected variant per family as that family's
 * "representative". Stored as a single `meta` key (`representativeVariants`).
 * Because `meta` is a generic key-value table, this needs no Dexie .version()
 * bump.
 *
 * Sync: the value is a TIMESTAMPED ENVELOPE `{ map, updatedAt }` so it can be
 * reconciled last-write-wins across devices. The generic meta adapter is
 * first-write-wins (writes incoming only if local is missing); the actual LWW
 * is enforced by `backfillRepresentativesLWW` in the onPullComplete hook
 * (mirrors the counters MAX-merge post-pass). DO NOT assume the bare meta
 * adapter gives LWW — it does not.
 *
 * Capability spec: openspec/specs/neurons-variant-collection-view/spec.md
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, type NeuronVariantRow } from '../db'

export const REPRESENTATIVES_META_KEY = 'representativeVariants'

export type RepresentativeMap = Record<string, number>

export interface RepresentativeEnvelope {
  map: RepresentativeMap
  updatedAt: number
}

/**
 * Parse a stored meta value into an envelope. Tolerates a bare map (legacy /
 * hand-written) by treating it as `updatedAt: 0` so any timestamped write wins.
 */
export function parseRepresentativeEnvelope(raw: string | undefined): RepresentativeEnvelope {
  if (!raw) return { map: {}, updatedAt: 0 }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      if (obj.map && typeof obj.map === 'object') {
        return {
          map: obj.map as RepresentativeMap,
          updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
        }
      }
      // Bare map (no envelope) — legacy shape.
      return { map: parsed as RepresentativeMap, updatedAt: 0 }
    }
  } catch (err) {
    console.warn('[representatives] failed to parse meta value:', err)
  }
  return { map: {}, updatedAt: 0 }
}

/** Read the persisted envelope (map may contain stale entries). */
export async function readRepresentativeEnvelope(): Promise<RepresentativeEnvelope> {
  const row = await db.meta.get(REPRESENTATIVES_META_KEY)
  return parseRepresentativeEnvelope(row?.value)
}

/** Raw read of the persisted map (unfiltered — may contain stale entries). */
export async function getRepresentativesRaw(): Promise<RepresentativeMap> {
  return (await readRepresentativeEnvelope()).map
}

/**
 * Drop any familyId → slotIndex entry whose variant is not in the collected
 * set. Pure (testable) — `collectedKeys` is the set of `${familyId}:${slotIndex}`
 * for currently-collected variants.
 */
export function filterStaleRepresentatives(
  map: RepresentativeMap,
  collectedKeys: ReadonlySet<string>,
): RepresentativeMap {
  const out: RepresentativeMap = {}
  for (const [familyId, slotIndex] of Object.entries(map)) {
    if (collectedKeys.has(`${familyId}:${slotIndex}`)) out[familyId] = slotIndex
  }
  return out
}

/**
 * Set a family's representative. Rejects (no-op + warn) if that
 * (familyId, slotIndex) variant is not collected. Stamps `updatedAt` for LWW.
 * Returns true on success.
 */
export async function setRepresentative(
  familyId: string,
  slotIndex: number,
): Promise<boolean> {
  const collected = await db.neuronVariants.get([familyId, slotIndex])
  if (!collected) {
    console.warn(
      `[representatives] refusing to set uncollected variant as representative: ${familyId}:${slotIndex}`,
    )
    return false
  }
  const envelope = await readRepresentativeEnvelope()
  envelope.map[familyId] = slotIndex
  envelope.updatedAt = Date.now()
  await db.meta.put({ key: REPRESENTATIVES_META_KEY, value: JSON.stringify(envelope) })
  return true
}

/**
 * LWW reconcile of the representative envelope against an incoming bundle's
 * raw value. Pure decision helper — returns the value to persist, or null if
 * local already wins / nothing to do. Exported for unit testing.
 */
export function pickRepresentativeLWW(
  localRaw: string | undefined,
  incomingRaw: string | undefined,
): string | null {
  if (incomingRaw === undefined) return null
  const local = parseRepresentativeEnvelope(localRaw)
  const incoming = parseRepresentativeEnvelope(incomingRaw)
  if (incoming.updatedAt > local.updatedAt) return JSON.stringify(incoming)
  return null
}

/**
 * Reactive hook — `familyId → the collected NeuronVariantRow chosen as that
 * family's representative` (in the /collection dex). Stale entries (a stored
 * representative whose variant is no longer collected) are dropped. Lets the
 * homepage family cards render the SAME representative sprite the player picked
 * in 圖鑑, kept in sync via the shared `representativeVariants` meta key. Empty
 * map when no representatives are set.
 */
export function useRepresentativeRows(): Map<string, NeuronVariantRow> {
  const [rows, setRows] = useState<Map<string, NeuronVariantRow>>(new Map())
  useEffect(() => {
    const sub = liveQuery(async () => {
      const [metaRow, variants] = await Promise.all([
        db.meta.get(REPRESENTATIVES_META_KEY),
        db.neuronVariants.toArray(),
      ])
      const map = parseRepresentativeEnvelope(metaRow?.value).map
      const byKey = new Map(variants.map((v) => [`${v.familyId}:${v.slotIndex}`, v]))
      const out = new Map<string, NeuronVariantRow>()
      for (const [familyId, slotIndex] of Object.entries(map)) {
        const row = byKey.get(`${familyId}:${slotIndex}`)
        if (row) out.set(familyId, row) // drop stale (uncollected) representatives
      }
      return out
    }).subscribe({
      next: (val) => setRows(val),
      error: (err) => {
        console.warn('[representatives] live query failed:', err)
        setRows(new Map())
      },
    })
    return () => sub.unsubscribe()
  }, [])
  return rows
}
