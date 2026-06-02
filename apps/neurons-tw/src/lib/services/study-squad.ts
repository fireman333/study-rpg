/**
 * Active-squad selection for the connectome homepage party + correct-answer
 * celebration + 出征 (add-neurons-study-squad, Phase 1 of Collection 2.0).
 *
 * The player assembles a bounded subset (≤ MAX_SQUAD_SIZE) of their collected
 * neuron variants as the "active squad". Stored as a single `meta` key
 * (`activeSquad`) — mirrors representatives.ts, so NO Dexie `.version()` bump
 * and NO new table.
 *
 * Sync: the value is a TIMESTAMPED ENVELOPE `{ members, updatedAt }` reconciled
 * last-write-wins by `backfillActiveSquadLWW` in the onPullComplete hook. The
 * generic meta adapter is first-write-wins; DO NOT assume it gives LWW.
 *
 * Capability spec: openspec/specs/neurons-study-squad/spec.md
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, type NeuronVariantRow } from '../db'

export const ACTIVE_SQUAD_META_KEY = 'activeSquad'

/** Maximum party size. A small, legible cap — owner sign-off 2026-06-02. */
export const MAX_SQUAD_SIZE = 5

/** Stable per-variant key: `"<familyId>:<slotIndex>"`. */
export type VariantKey = string

export function variantKey(familyId: string, slotIndex: number): VariantKey {
  return `${familyId}:${slotIndex}`
}

/** Parse a `"<familyId>:<slotIndex>"` key back into its parts (null if malformed). */
export function parseVariantKey(key: VariantKey): { familyId: string; slotIndex: number } | null {
  const i = key.lastIndexOf(':')
  if (i <= 0) return null
  const familyId = key.slice(0, i)
  const slotIndex = Number(key.slice(i + 1))
  if (!familyId || !Number.isInteger(slotIndex)) return null
  return { familyId, slotIndex }
}

export interface SquadEnvelope {
  members: VariantKey[]
  updatedAt: number
}

/**
 * Parse a stored meta value into an envelope. Tolerates a bare array (legacy /
 * hand-written) by treating it as `updatedAt: 0` so any timestamped write wins.
 */
export function parseSquadEnvelope(raw: string | undefined): SquadEnvelope {
  if (!raw) return { members: [], updatedAt: 0 }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      // Bare array (no envelope) — legacy shape.
      return { members: parsed.filter((m): m is string => typeof m === 'string'), updatedAt: 0 }
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      if (Array.isArray(obj.members)) {
        return {
          members: obj.members.filter((m): m is string => typeof m === 'string'),
          updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
        }
      }
    }
  } catch (err) {
    console.warn('[study-squad] failed to parse meta value:', err)
  }
  return { members: [], updatedAt: 0 }
}

/** Read the persisted envelope (members may contain stale entries). */
export async function readSquadEnvelope(): Promise<SquadEnvelope> {
  const row = await db.meta.get(ACTIVE_SQUAD_META_KEY)
  return parseSquadEnvelope(row?.value)
}

async function writeSquadEnvelope(members: VariantKey[]): Promise<void> {
  const envelope: SquadEnvelope = { members, updatedAt: Date.now() }
  await db.meta.put({ key: ACTIVE_SQUAD_META_KEY, value: JSON.stringify(envelope) })
}

/**
 * Drop any member key whose variant is not in the collected set. Pure (testable)
 * — `collectedKeys` is the set of `"<familyId>:<slotIndex>"` for collected variants.
 */
export function filterStaleSquadMembers(
  members: VariantKey[],
  collectedKeys: ReadonlySet<string>,
): VariantKey[] {
  return members.filter((k) => collectedKeys.has(k))
}

/**
 * Add a collected variant to the squad. Rejects (no-op + warn, returns false)
 * if the variant is not collected, already in the squad, or the squad is full.
 */
export async function addSquadMember(familyId: string, slotIndex: number): Promise<boolean> {
  const key = variantKey(familyId, slotIndex)
  const collected = await db.neuronVariants.get([familyId, slotIndex])
  if (!collected) {
    console.warn(`[study-squad] refusing to add uncollected variant: ${key}`)
    return false
  }
  const envelope = await readSquadEnvelope()
  if (envelope.members.includes(key)) return false
  if (envelope.members.length >= MAX_SQUAD_SIZE) {
    console.warn(`[study-squad] squad full (${MAX_SQUAD_SIZE}); not adding ${key}`)
    return false
  }
  await writeSquadEnvelope([...envelope.members, key])
  return true
}

/** Remove a variant from the squad. Returns true if it was present. */
export async function removeSquadMember(familyId: string, slotIndex: number): Promise<boolean> {
  const key = variantKey(familyId, slotIndex)
  const envelope = await readSquadEnvelope()
  if (!envelope.members.includes(key)) return false
  await writeSquadEnvelope(envelope.members.filter((k) => k !== key))
  return true
}

/**
 * LWW reconcile of the squad envelope against an incoming bundle's raw value.
 * Pure decision helper — returns the value to persist, or null if local already
 * wins / nothing to do. Exported for unit testing.
 */
export function pickActiveSquadLWW(
  localRaw: string | undefined,
  incomingRaw: string | undefined,
): string | null {
  if (incomingRaw === undefined) return null
  const local = parseSquadEnvelope(localRaw)
  const incoming = parseSquadEnvelope(incomingRaw)
  if (incoming.updatedAt > local.updatedAt) return JSON.stringify(incoming)
  return null
}

/**
 * Reactive hook — the collected `NeuronVariantRow`s currently in the active
 * squad, in member order, stale entries pruned. Drives the homepage party row +
 * the QuizModal correct-answer celebration. Empty array when no squad is set.
 */
export function useActiveSquad(): NeuronVariantRow[] {
  const [rows, setRows] = useState<NeuronVariantRow[]>([])
  useEffect(() => {
    const sub = liveQuery(async () => {
      const [metaRow, variants] = await Promise.all([
        db.meta.get(ACTIVE_SQUAD_META_KEY),
        db.neuronVariants.toArray(),
      ])
      const envelope = parseSquadEnvelope(metaRow?.value)
      const byKey = new Map(variants.map((v) => [variantKey(v.familyId, v.slotIndex), v]))
      // Preserve member order; drop stale (uncollected) keys.
      return envelope.members
        .map((k) => byKey.get(k))
        .filter((v): v is NeuronVariantRow => v !== undefined)
    }).subscribe({
      next: (val) => setRows(val),
      error: (err) => {
        console.warn('[study-squad] live query failed:', err)
        setRows([])
      },
    })
    return () => sub.unsubscribe()
  }, [])
  return rows
}
