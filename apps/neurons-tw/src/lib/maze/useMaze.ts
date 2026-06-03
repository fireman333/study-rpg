/**
 * useMaze — reactive state for the /maze-beta exploration view
 * (add-neurons-brain-maze-slice).
 *
 * Wires three live sources into the render state:
 *   - collected DA variants (Dexie liveQuery) → lit nodes (derived), walker sprite, speed buff
 *   - growth-signal state (Dexie liveQuery on meta) → walker frontier progress
 *   - reconcileSettles → reveals + collects fogged nodes when signal crosses thresholds
 *
 * Lit-node state is DERIVED from collected variants (never separately stored) →
 * existing players see their collected DA variants pre-lit with no backfill
 * (migration, design D5). Settles run here (in the UI hook) so they can use the
 * content pack for display-name resolution and so the existing VariantUnlockModal
 * (listening to `variantRolled`) animates each reveal for free.
 */
import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import { db, type NeuronVariantRow, type VariantRarity } from '../db'
import {
  MAZE_FAMILIES,
  MAZE_GRAPH,
  nextTarget,
  nodeKey,
  pointAtFraction,
  type MazeNode,
} from './graph'
import {
  mazeSpeedMultiplier,
  reconcileSettles,
  readMazeSignalState,
  SIGNAL_PER_NODE,
  walkerFraction,
  type MazeSignalState,
} from './economy'

/** P0 rarest → P5 commonest. Lower rank = rarer. */
const RARITY_RANK: Record<VariantRarity, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 }

/** Rarest collected DA variant, tie-broken by most-recently rolled (the walker sprite). */
export function pickWalkerVariant(daRows: NeuronVariantRow[]): NeuronVariantRow | null {
  if (daRows.length === 0) return null
  return [...daRows].sort(
    (a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || b.rolledAt - a.rolledAt,
  )[0]
}

export interface MazeViewState {
  /** Number of lit (collected) DA nodes — the chip count (no denominator). */
  connectedCount: number
  collectedKeys: Set<string>
  nodes: MazeNode[]
  /** Current frontier target (nearest fogged node), or null when all lit. */
  target: MazeNode | null
  /** Walker position (normalized 0..1), interpolated along the target's path. */
  walkerPos: [number, number]
  /** Walker sprite source: rarest collected DA variant, or null → growth-cone fallback. */
  walkerVariant: NeuronVariantRow | null
  speedMultiplier: number
  signal: MazeSignalState
}

const INITIAL: MazeViewState = {
  connectedCount: 0,
  collectedKeys: new Set(),
  nodes: MAZE_GRAPH.nodes,
  target: null,
  walkerPos: MAZE_GRAPH.root,
  walkerVariant: null,
  speedMultiplier: 1,
  signal: { signal: 0, settles: 0 },
}

export function useMaze(pack: ContentPack): MazeViewState {
  const [view, setView] = useState<MazeViewState>(INITIAL)
  const reconciling = useRef(false)

  useEffect(() => {
    const resolveName = (id: string) => pack.subjects.find((s) => s.id === id)?.displayName ?? id

    const recompute = async () => {
      const allRows = await db.neuronVariants.toArray()
      const daRows = allRows.filter((v) => MAZE_FAMILIES.includes(v.familyId))
      const collectedKeys = new Set(daRows.map((v) => nodeKey(v.familyId, v.slotIndex)))
      const signal = await readMazeSignalState()
      const target = nextTarget(collectedKeys)
      const frac = walkerFraction(signal)
      const walkerPos: [number, number] = target ? pointAtFraction(target, frac) : MAZE_GRAPH.root
      setView({
        connectedCount: collectedKeys.size,
        collectedKeys,
        nodes: MAZE_GRAPH.nodes,
        target,
        walkerPos,
        walkerVariant: pickWalkerVariant(daRows),
        speedMultiplier: mazeSpeedMultiplier(daRows.length),
        signal,
      })

      // Reconcile due settles (idempotent, guarded against re-entrancy). The mint
      // writes to neuronVariants + the settles meta key → liveQuery re-fires →
      // recompute converges once settles == floor(signal / SIGNAL_PER_NODE).
      const due = Math.floor(signal.signal / SIGNAL_PER_NODE) > signal.settles
      if (due && target && !reconciling.current) {
        reconciling.current = true
        try {
          await reconcileSettles(resolveName)
        } finally {
          reconciling.current = false
        }
      }
    }

    // Re-run whenever collected variants OR the maze signal meta keys change.
    const sub = liveQuery(async () => {
      const rows = await db.neuronVariants.toArray()
      const sig = await db.meta.get('maze:da:signal')
      const set = await db.meta.get('maze:da:settles')
      return { n: rows.length, sig: sig?.value, set: set?.value }
    }).subscribe({
      next: () => void recompute(),
      error: (err) => console.error('[maze] liveQuery error:', err),
    })
    void recompute()
    return () => sub.unsubscribe()
  }, [pack])

  return view
}
