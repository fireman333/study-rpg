/**
 * Connector neuron service (add-neurons-connector-neuron-family).
 *
 * A connector is unlocked the first time a subject pair's synaptic wire reaches
 * `strong` (the weak→strong transition in creditConnectomeFromExpedition). Unlock
 * is idempotent + PERMANENT (monotonic): re-strengthening never duplicates, wire
 * decay never removes. The closed 55-set is derived from FAMILY_IDS in the content
 * pack; this service owns persistence + the collection-page read model.
 *
 * Spec: openspec/specs/neurons-connector-family/spec.md
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import {
  CONNECTOR_PAIR_KEYS,
  CONNECTOR_TOTAL,
  connectorFamilies,
} from '@study-rpg/content-neurons-tw'
import { db, type ConnectorNeuronRow } from '../db'

/**
 * Idempotently unlock the connector for `pairKey`. No-op if already unlocked
 * (preserves the original `unlockedAt`). Returns `true` iff this call performed a
 * fresh unlock (drives the unlock toast). Called post-transaction from the
 * connectome weak→strong hook (best-effort).
 */
export async function unlockConnector(pairKey: string): Promise<boolean> {
  let unlocked = false
  await db.transaction('rw', db.connectorNeurons, async () => {
    const existing = await db.connectorNeurons.get(pairKey)
    if (existing) return
    const [familyA, familyB] = connectorFamilies(pairKey)
    const now = Date.now()
    // Forward unlock = a live weak→strong transition, always post-epoch → 'validated'.
    await db.connectorNeurons.add({ pairKey, familyA, familyB, unlockedAt: now, updatedAt: now, unlockSource: 'validated' })
    unlocked = true
  })
  return unlocked
}

/** A connector entry for the collection view (locked or unlocked). */
export interface ConnectorEntry {
  pairKey: string
  familyA: string
  familyB: string
  unlocked: boolean
  unlockedAt: number | null
}

/**
 * Project the unlocked rows onto the full closed 55-set, in catalog order. Pure —
 * the single place that turns persistence rows into the locked/unlocked view model.
 */
export function buildConnectorEntries(rows: ConnectorNeuronRow[]): ConnectorEntry[] {
  const byKey = new Map(rows.map((r) => [r.pairKey, r]))
  return CONNECTOR_PAIR_KEYS.map((pairKey) => {
    const row = byKey.get(pairKey)
    const [familyA, familyB] = connectorFamilies(pairKey)
    return {
      pairKey,
      familyA,
      familyB,
      unlocked: !!row,
      unlockedAt: row?.unlockedAt ?? null,
    }
  })
}

export interface ConnectorCollection {
  entries: ConnectorEntry[]
  unlockedCount: number
  total: number
}

/** Reactive hook — the full 55-entry connector collection (unlocked + locked). */
export function useConnectors(): ConnectorCollection {
  const [rows, setRows] = useState<ConnectorNeuronRow[]>([])
  useEffect(() => {
    const sub = liveQuery(() => db.connectorNeurons.toArray()).subscribe({
      next: (val) => setRows(val),
      error: () => setRows([]),
    })
    return () => sub.unsubscribe()
  }, [])
  return {
    entries: buildConnectorEntries(rows),
    unlockedCount: rows.length,
    total: CONNECTOR_TOTAL,
  }
}
