/**
 * useMaze — reactive state for the maze exploration view, multi-branch
 * (promote-maze-to-home / Model A; generalizes the earlier signal model).
 *
 * Builds a per-branch view state for all four NT regions from live sources:
 *   - per-branch energy state (Dexie liveQuery on meta) → frontier progress + lit nodes
 *   - collected variants (Dexie liveQuery) → walker sprite + team-speed buff
 *   - reconcileSettles (per branch) → consumes energy + triggers a random pull
 *     when accrued energy crosses the next settle's cost threshold
 *
 * Lit-node state is FRONTIER-derived (cumulative settle count), NOT collected-
 * derived — settle pulls are random so the variant collected at a settle is not
 * necessarily the lit node's own slot. Existing players keep their stored
 * `settles`; collection is preserved separately. Settles run here (UI hook) so
 * they use the content pack for display-name resolution and the existing
 * VariantUnlockModal animates each reveal. ALL branches reconcile regardless of
 * filter-chip visibility (visibility is display-only).
 */
import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import type { NtBranchId } from '@study-rpg/content-neurons-tw'
import { db, type NeuronVariantRow, type VariantRarity } from '../db'
import {
  FAMILIES_BY_BRANCH,
  MAZE_GRAPHS,
  NT_BRANCHES,
  frontierNode,
  litNodesWithStarter,
  nodeKey,
  pointAtFraction,
  type MazeGraph,
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

export interface BranchViewState {
  branch: NtBranchId
  graph: MazeGraph
  /** Number of lit (frontier-reached) nodes in this branch (capped at node count). */
  connectedCount: number
  /** Collected `family:slot` keys (drives nothing visual now; kept for callers/tests). */
  collectedKeys: Set<string>
  litNodes: MazeNode[]
  /** Current frontier target (node being lit next), or null in 二週目 (all lit). */
  target: MazeNode | null
  /** Walker position (normalized 0..1), interpolated along the target's path. */
  walkerPos: [number, number]
  /** Walker sprite source: rarest collected variant in branch, or null → growth-cone fallback. */
  walkerVariant: NeuronVariantRow | null
  speedMultiplier: number
  energy: MazeEnergyState
}

export interface MazeViewState {
  branches: BranchViewState[]
  /** Total lit nodes across all branches — the chip count (no denominator). */
  totalConnectedCount: number
}

function emptyBranchState(branch: NtBranchId): BranchViewState {
  const graph = MAZE_GRAPHS[branch]
  return {
    branch,
    graph,
    connectedCount: 0,
    collectedKeys: new Set(),
    litNodes: [],
    target: null,
    walkerPos: graph.root,
    walkerVariant: null,
    speedMultiplier: 1,
    energy: { earned: 0, settles: 0 },
  }
}

const INITIAL: MazeViewState = {
  branches: NT_BRANCHES.map(emptyBranchState),
  totalConnectedCount: 0,
}

export function useMaze(pack: ContentPack): MazeViewState {
  const [view, setView] = useState<MazeViewState>(INITIAL)
  const reconciling = useRef(false)

  useEffect(() => {
    const resolveName = (id: string) => pack.subjects.find((s) => s.id === id)?.displayName ?? id

    const recompute = async () => {
      const allRows = await db.neuronVariants.toArray()
      const branchStates: BranchViewState[] = []
      let dueAny = false
      for (const branch of NT_BRANCHES) {
        const fams = FAMILIES_BY_BRANCH[branch]
        const rows = allRows.filter((v) => fams.includes(v.familyId))
        const collectedKeys = new Set(rows.map((v) => nodeKey(v.familyId, v.slotIndex)))
        const energy = await readMazeEnergyState(branch)
        const starterFamily = await readStarterFamily(branch)
        const graph = MAZE_GRAPHS[branch]
        // Lit = frontier(settles) ∪ first-pull starter node (add-neurons-first-pull).
        const lit = litNodesWithStarter(branch, energy.settles, starterFamily)
        const target = frontierNode(branch, energy.settles)
        const frac = walkerFraction(energy)
        const walkerPos: [number, number] = target ? pointAtFraction(target, frac) : graph.root
        branchStates.push({
          branch,
          graph,
          connectedCount: lit.length,
          collectedKeys,
          litNodes: lit,
          target,
          walkerPos,
          walkerVariant: pickWalkerVariant(rows),
          speedMultiplier: mazeSpeedMultiplier(rows.length),
          energy,
        })
        if (affordableSettles(energy.earned) > energy.settles) dueAny = true
      }
      setView({
        branches: branchStates,
        totalConnectedCount: branchStates.reduce((s, b) => s + b.connectedCount, 0),
      })

      // Reconcile due settles for ALL branches (idempotent, guarded against
      // re-entrancy). Hidden branches still settle — visibility is display-only.
      // Each settle consumes energy + triggers a random pull → writes
      // neuronVariants + a settles meta key → liveQuery re-fires → converges.
      if (dueAny && !reconciling.current) {
        reconciling.current = true
        try {
          for (const branch of NT_BRANCHES) await reconcileSettles(branch, resolveName)
        } finally {
          reconciling.current = false
        }
      }
    }

    // Re-run whenever collected variants OR any branch's maze energy meta keys
    // change. readMazeEnergyState issues the db.meta.get reads liveQuery tracks.
    const sub = liveQuery(async () => {
      const rows = await db.neuronVariants.toArray()
      const states = await Promise.all(NT_BRANCHES.map((b) => readMazeEnergyState(b)))
      // Track starter-family keys too so the first-pull write re-fires recompute.
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
  }, [pack])

  return view
}
