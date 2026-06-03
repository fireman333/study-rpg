/**
 * useMaze — reactive state for the /maze-beta exploration view, multi-branch
 * (expand-neurons-brain-maze-all-branches; generalizes the DA-only slice).
 *
 * Builds a per-branch view state for all four NT regions from three live sources:
 *   - collected variants (Dexie liveQuery) → lit nodes (derived), walker sprite, speed buff
 *   - per-branch growth-signal state (Dexie liveQuery on meta) → walker frontier progress
 *   - reconcileSettles (per branch) → reveals + collects fogged nodes when signal crosses thresholds
 *
 * Lit-node state is DERIVED from collected variants (never separately stored) →
 * existing players see their collected variants pre-lit with no backfill (design
 * D5). Settles run here (UI hook) so they can use the content pack for display-name
 * resolution and so the existing VariantUnlockModal animates each reveal for free.
 * ALL branches reconcile regardless of filter-chip visibility (visibility is
 * display-only, design D11).
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
  isNodeLit,
  nextTarget,
  nodeKey,
  pointAtFraction,
  type MazeGraph,
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
  /** Number of lit (collected) nodes in this branch. */
  connectedCount: number
  collectedKeys: Set<string>
  litNodes: MazeNode[]
  /** Current frontier target (nearest fogged node), or null when all lit. */
  target: MazeNode | null
  /** Walker position (normalized 0..1), interpolated along the target's path. */
  walkerPos: [number, number]
  /** Walker sprite source: rarest collected variant in branch, or null → growth-cone fallback. */
  walkerVariant: NeuronVariantRow | null
  speedMultiplier: number
  signal: MazeSignalState
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
    signal: { signal: 0, settles: 0 },
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
        const signal = await readMazeSignalState(branch)
        const graph = MAZE_GRAPHS[branch]
        const target = nextTarget(branch, collectedKeys)
        const frac = walkerFraction(signal)
        const walkerPos: [number, number] = target ? pointAtFraction(target, frac) : graph.root
        branchStates.push({
          branch,
          graph,
          connectedCount: collectedKeys.size,
          collectedKeys,
          litNodes: graph.nodes.filter((n) => isNodeLit(n, collectedKeys)),
          target,
          walkerPos,
          walkerVariant: pickWalkerVariant(rows),
          speedMultiplier: mazeSpeedMultiplier(rows.length),
          signal,
        })
        if (target && Math.floor(signal.signal / SIGNAL_PER_NODE) > signal.settles) dueAny = true
      }
      setView({
        branches: branchStates,
        totalConnectedCount: branchStates.reduce((s, b) => s + b.connectedCount, 0),
      })

      // Reconcile due settles for ALL branches (idempotent, guarded against
      // re-entrancy). Hidden branches still settle — visibility is display-only
      // (design D11). Each mint writes neuronVariants + a settles meta key →
      // liveQuery re-fires → recompute converges.
      if (dueAny && !reconciling.current) {
        reconciling.current = true
        try {
          for (const branch of NT_BRANCHES) await reconcileSettles(branch, resolveName)
        } finally {
          reconciling.current = false
        }
      }
    }

    // Re-run whenever collected variants OR any branch's maze signal meta keys
    // change. readMazeSignalState issues the db.meta.get reads liveQuery tracks.
    const sub = liveQuery(async () => {
      const rows = await db.neuronVariants.toArray()
      const states = await Promise.all(NT_BRANCHES.map((b) => readMazeSignalState(b)))
      return { n: rows.length, sig: states.map((s) => `${s.signal}:${s.settles}`).join('|') }
    }).subscribe({
      next: () => void recompute(),
      error: (err) => console.error('[maze] liveQuery error:', err),
    })
    void recompute()
    return () => sub.unsubscribe()
  }, [pack])

  return view
}
