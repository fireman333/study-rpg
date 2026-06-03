/**
 * Brain-maze growth-signal economy (multi-branch —
 * expand-neurons-brain-maze-all-branches).
 *
 * Correct answers + reading time accrue "growth signal" PER NT BRANCH (design
 * D3/D12). Each SIGNAL_PER_NODE of accrued signal advances that branch's frontier
 * one node; reaching a fogged node settles = reveal + collect that node's slot via
 * the gacha mint path (design D4/D5). A branch's team speed (base + collection
 * buff) scales how fast its signal accrues (D4): an empty team still progresses at
 * base speed. Economy CONSTANTS are shared across branches by default (design
 * D10/D13) — only the per-branch pool keys + collected sets differ.
 *
 * Persistence: per-branch LOCAL-ONLY `meta` keys `maze:<branch>:signal` /
 * `maze:<branch>:settles` (NOT in SYNCED_META_KEYS). DA keys (`maze:da:*`) are
 * unchanged so existing DA progress is preserved. Lit-node state is derived from
 * the already-synced collected variants, so cross-device convergence needs no
 * maze-specific sync (design D6). No Dexie schema bump (meta is a generic kv store).
 */
import type { NtBranchId } from '@study-rpg/content-neurons-tw'
import { db } from '../db'
import {
  FAMILIES_BY_BRANCH,
  MAZE_GRAPHS,
  NT_BRANCHES,
  nextTarget,
  nodeKey,
  type MazeNode,
} from './graph'
import { mintVariantSlot } from '../services/variant-gacha'

// --- tunable constants (shared across branches; dogfood telemetry will calibrate) ---
/** Signal per correct answer (before streak + speed multipliers). */
export const CORRECT_SIGNAL = 3
/** Signal per reading minute (before speed multiplier; split across branches). */
export const READING_SIGNAL = 2
/** Accrued signal needed to advance a frontier one node. */
export const SIGNAL_PER_NODE = 24
/** Per-collected-variant speed buff; capped so an over-collected team can't trivialize. */
export const SPEED_BUFF_PER_VARIANT = 0.04
export const SPEED_BUFF_CAP = 1.0 // max +100% → 2× base

/** Per-branch `meta` keys. DA → `maze:da:*` (unchanged from the slice). */
const signalKey = (branch: NtBranchId): string => `maze:${branch.toLowerCase()}:signal`
const settlesKey = (branch: NtBranchId): string => `maze:${branch.toLowerCase()}:settles`

/** Streak multiplier mirrors the app's existing 1 + 0.05·min(s,10) feel. */
export const streakMultiplier = (streak: number): number => 1 + 0.05 * Math.min(Math.max(streak, 0), 10)

/** Branch team exploration-speed multiplier: fixed base 1.0 + monotonic collection buff (never < 1). */
export function mazeSpeedMultiplier(collectedCount: number): number {
  return 1 + Math.min(collectedCount * SPEED_BUFF_PER_VARIANT, SPEED_BUFF_CAP)
}

export interface MazeSignalState {
  signal: number
  settles: number
}

export async function readMazeSignalState(branch: NtBranchId): Promise<MazeSignalState> {
  const [s, c] = await Promise.all([db.meta.get(signalKey(branch)), db.meta.get(settlesKey(branch))])
  return { signal: Number(s?.value ?? '0') || 0, settles: Number(c?.value ?? '0') || 0 }
}

/** Set of collected `family:slot` keys for a branch (for lit/fog + speed derivation). */
export async function collectedKeys(branch: NtBranchId): Promise<Set<string>> {
  const fams = FAMILIES_BY_BRANCH[branch]
  const all = await db.neuronVariants.toArray()
  const set = new Set<string>()
  for (const v of all) if (fams.includes(v.familyId)) set.add(nodeKey(v.familyId, v.slotIndex))
  return set
}

/**
 * Accrue growth signal into one branch's pool from one gameplay event. `base`
 * already includes the streak multiplier (callers fold it in); this applies the
 * branch's team-speed multiplier and persists. Pure additive — does NOT settle.
 */
export async function accrueMazeSignal(branch: NtBranchId, base: number): Promise<void> {
  if (base <= 0) return
  const count = (await collectedKeys(branch)).size
  const amount = base * mazeSpeedMultiplier(count)
  const cur = Number((await db.meta.get(signalKey(branch)))?.value ?? '0') || 0
  await db.meta.put({ key: signalKey(branch), value: String(cur + amount) })
}

/**
 * Reading time has no subject/NT context → split the per-minute reading signal
 * evenly across all four branch pools (design Open Q resolution: even-split).
 */
export async function accrueReadingSignalAllBranches(base: number): Promise<void> {
  if (base <= 0) return
  const per = base / NT_BRANCHES.length
  for (const branch of NT_BRANCHES) await accrueMazeSignal(branch, per)
}

export interface SettleOutcome {
  /** Nodes newly lit by this reconcile pass, in settle order. */
  newlyLit: MazeNode[]
}

/**
 * Reconcile one branch's settles to its accrued signal: perform one settle per
 * SIGNAL_PER_NODE budget not yet spent, lighting the nearest fogged node each time
 * (reveal + mint that node's slot). Idempotent. Called by the maze UI hook (has the
 * content pack for display-name resolution + can animate reveals).
 */
export async function reconcileSettles(
  branch: NtBranchId,
  resolveFamilyDisplayName: (familyId: string) => string,
): Promise<SettleOutcome> {
  const { signal } = await readMazeSignalState(branch)
  let settles = Number((await db.meta.get(settlesKey(branch)))?.value ?? '0') || 0
  const targetSettles = Math.floor(signal / SIGNAL_PER_NODE)
  const collected = await collectedKeys(branch)
  const newlyLit: MazeNode[] = []

  let guard = 0
  while (settles < targetSettles && guard++ < MAZE_GRAPHS[branch].nodes.length + 1) {
    const target = nextTarget(branch, collected)
    if (!target) break // all nodes lit — nothing fogged to reveal
    const res = await mintVariantSlot(target.familyId, target.slotIndex, resolveFamilyDisplayName)
    if (!res.ok) break // mint failed → stop (don't burn the settle budget on errors)
    collected.add(nodeKey(target.familyId, target.slotIndex))
    newlyLit.push(target)
    settles += 1
    await db.meta.put({ key: settlesKey(branch), value: String(settles) })
  }
  return { newlyLit }
}

/** Walker progress (0..1) toward the current target node = unspent signal fraction. */
export function walkerFraction(state: MazeSignalState): number {
  const remaining = state.signal - state.settles * SIGNAL_PER_NODE
  return Math.max(0, Math.min(1, remaining / SIGNAL_PER_NODE))
}

/* DEV-only debug handle for manual dogfood smoke (mirrors __sync / __variantGacha). */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __maze?: unknown }).__maze = {
    state: (branch: NtBranchId = 'DA') => readMazeSignalState(branch),
    addSignal: (branch: NtBranchId, base: number) => accrueMazeSignal(branch, base),
    reset: async (branch?: NtBranchId) => {
      const branches = branch ? [branch] : NT_BRANCHES
      for (const b of branches) {
        await db.meta.put({ key: signalKey(b), value: '0' })
        await db.meta.put({ key: settlesKey(b), value: '0' })
      }
      console.warn('[maze] DEV: reset signal + settles to 0 for', branch ?? 'all branches')
    },
  }
}
