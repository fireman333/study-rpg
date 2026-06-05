/**
 * useMaze — reactive state for the flat-grid maze (redesign-neurons-maze-rotjs-grid).
 *
 * Builds a per-FAMILY view state for all 11 subject families from live sources:
 *   - per-family energy state (Dexie liveQuery on meta) → frontier progress + lit nodes
 *   - collected variants (Dexie liveQuery) → walker sprite + team-speed buff
 *   - reconcileSettles (per family) → consumes energy + triggers a random pull when
 *     accrued energy crosses the next settle's cost threshold
 *
 * Lit-node state is FRONTIER-derived (cumulative settle count) UNIONed with the
 * first-pull starter-lit nodes — NOT collected-derived (settle pulls are random).
 * The page owns the SINGLE useMaze(pack) subscription (calling it twice would
 * double-fire reconcileSettles → double pulls; promote-maze-to-home lesson).
 */
import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import { FAMILY_IDS, NT_BRANCHES } from '@study-rpg/content-neurons-tw'
import { db, type NeuronVariantRow, type VariantRarity } from '../db'
import {
  FAMILY_GRAPHS,
  frontierNode,
  litNodesWithStarter,
  walkerCell,
  type Cell,
  type FamilyGraph,
  type MazeNode,
} from './graph'
import {
  affordableSettles,
  mazeSpeedMultiplier,
  reconcileSettles,
  readMazeEnergyState,
  walkerFraction,
  type MazeEnergyState,
} from './economy'
import { readStarterFamily } from '../services/first-pull'

/** P0 rarest → P5 commonest. Lower rank = rarer. */
const RARITY_RANK: Record<VariantRarity, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 }

/** Rarest collected variant in a set, tie-broken by most-recently rolled (the walker sprite). */
export function pickWalkerVariant(rows: NeuronVariantRow[]): NeuronVariantRow | null {
  if (rows.length === 0) return null
  return [...rows].sort(
    (a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || b.rolledAt - a.rolledAt,
  )[0]
}

export interface FamilyViewState {
  familyId: string
  graph: FamilyGraph
  /** Number of lit (frontier ∪ starter) nodes in this family (capped at node count). */
  connectedCount: number
  /** Collected `family:slot` keys (kept for callers/tests; not the lit source). */
  collectedKeys: Set<string>
  litNodes: MazeNode[]
  /** Current frontier target (node being lit next), or null in 二週目 (all lit). */
  target: MazeNode | null
  /** Walker position in grid-cell coords, interpolated along the corridor centerline. */
  walkerCell: Cell
  /** Walker sprite source: rarest collected variant in family, or null → growth-cone fallback. */
  walkerVariant: NeuronVariantRow | null
  speedMultiplier: number
  energy: MazeEnergyState
}

export interface MazeViewState {
  families: FamilyViewState[]
  /** Total lit nodes across all families — the chip count (no denominator). */
  totalConnectedCount: number
}

function emptyFamilyState(familyId: string): FamilyViewState {
  const graph = FAMILY_GRAPHS[familyId]
  return {
    familyId,
    graph,
    connectedCount: 0,
    collectedKeys: new Set(),
    litNodes: [],
    target: graph ? graph.nodes[0] ?? null : null,
    walkerCell: graph?.entryCell ?? [0, 0],
    walkerVariant: null,
    speedMultiplier: 1,
    energy: { earned: 0, settles: 0 },
  }
}

const INITIAL: MazeViewState = {
  families: FAMILY_IDS.filter((f) => FAMILY_GRAPHS[f]).map(emptyFamilyState),
  totalConnectedCount: 0,
}

/** Read the ≤4 first-pull starter families (legacy per-branch key VALUES) as a set. */
async function readStarterFamilies(): Promise<Set<string>> {
  const vals = await Promise.all(NT_BRANCHES.map((b) => readStarterFamily(b)))
  return new Set(vals.filter((v): v is string => !!v))
}

export function useMaze(pack: ContentPack): MazeViewState {
  const [view, setView] = useState<MazeViewState>(INITIAL)
  const reconciling = useRef(false)
  const families = INITIAL.families.map((f) => f.familyId)

  useEffect(() => {
    const resolveName = (id: string) => pack.subjects.find((s) => s.id === id)?.displayName ?? id

    const recompute = async () => {
      const allRows = await db.neuronVariants.toArray()
      const starterFamilies = await readStarterFamilies()
      const famStates: FamilyViewState[] = []
      let dueAny = false
      for (const familyId of families) {
        const graph = FAMILY_GRAPHS[familyId]
        if (!graph) continue
        const rows = allRows.filter((v) => v.familyId === familyId)
        const collectedKeys = new Set(rows.map((v) => `${v.familyId}:${v.slotIndex}`))
        const energy = await readMazeEnergyState(familyId)
        const lit = litNodesWithStarter(familyId, energy.settles, starterFamilies)
        const target = frontierNode(familyId, energy.settles)
        const wc = walkerCell(familyId, energy.settles, walkerFraction(energy))
        famStates.push({
          familyId,
          graph,
          connectedCount: lit.length,
          collectedKeys,
          litNodes: lit,
          target,
          walkerCell: wc,
          walkerVariant: pickWalkerVariant(rows),
          speedMultiplier: mazeSpeedMultiplier(rows.length),
          energy,
        })
        if (affordableSettles(energy.earned) > energy.settles) dueAny = true
      }
      setView({
        families: famStates,
        totalConnectedCount: famStates.reduce((s, f) => s + f.connectedCount, 0),
      })

      // Reconcile due settles for ALL families (idempotent, guarded against
      // re-entrancy). Each settle consumes energy + triggers a random pull →
      // writes neuronVariants + a settles meta key → liveQuery re-fires → converges.
      if (dueAny && !reconciling.current) {
        reconciling.current = true
        try {
          for (const familyId of families) await reconcileSettles(familyId, resolveName)
        } finally {
          reconciling.current = false
        }
      }
    }

    // Re-run whenever collected variants OR any family's maze energy meta keys OR
    // the first-pull starter keys change.
    const sub = liveQuery(async () => {
      const rows = await db.neuronVariants.toArray()
      const states = await Promise.all(families.map((f) => readMazeEnergyState(f)))
      const starters = await Promise.all(NT_BRANCHES.map((b) => readStarterFamily(b)))
      return {
        n: rows.length,
        e: states.map((s) => `${s.earned}:${s.settles}`).join('|'),
        s: starters.join('|'),
      }
    }).subscribe({
      next: () => void recompute(),
      error: (err) => console.error('[maze] liveQuery error:', err),
    })
    void recompute()
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack])

  return view
}
