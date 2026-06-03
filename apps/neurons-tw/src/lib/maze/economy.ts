/**
 * Brain-maze growth-signal economy (add-neurons-brain-maze-slice).
 *
 * Correct answers + reading time accrue "growth signal" (design D3). Each
 * SIGNAL_PER_NODE of accrued signal advances the frontier one node; reaching a
 * fogged node settles = reveal + collect that node's slot via the gacha mint
 * path (design D4/D5). The DA team's speed (base + collection buff) scales how
 * fast signal accrues (D4): an empty team still progresses at base speed.
 *
 * Persistence: two LOCAL-ONLY `meta` keys (NOT in SYNCED_META_KEYS) — the slice
 * stays local; lit-node state is derived from the already-synced collected
 * variants, so cross-device convergence needs no maze-specific sync (design D6,
 * out-of-scope note). No Dexie schema bump (meta is a generic key-value store).
 */
import { db } from '../db'
import {
  MAZE_FAMILIES,
  MAZE_GRAPH,
  nextTarget,
  nodeKey,
  type MazeNode,
} from './graph'
import { mintVariantSlot } from '../services/variant-gacha'

// --- tunable constants (dogfood telemetry will calibrate; design open questions) ---
/** Signal per correct answer (before streak + speed multipliers). */
export const CORRECT_SIGNAL = 3
/** Signal per reading minute (before speed multiplier). */
export const READING_SIGNAL = 2
/** Accrued signal needed to advance the frontier one node. */
export const SIGNAL_PER_NODE = 24
/** Per-collected-DA-variant speed buff; capped so an over-collected team can't trivialize. */
export const SPEED_BUFF_PER_VARIANT = 0.04
export const SPEED_BUFF_CAP = 1.0 // max +100% → 2× base

const SIGNAL_KEY = 'maze:da:signal'
const SETTLES_KEY = 'maze:da:settles'

/** Streak multiplier mirrors the app's existing 1 + 0.05·min(s,10) feel. */
export const streakMultiplier = (streak: number): number => 1 + 0.05 * Math.min(Math.max(streak, 0), 10)

/** DA team exploration-speed multiplier: fixed base 1.0 + monotonic collection buff (never < 1). */
export function mazeSpeedMultiplier(collectedDaCount: number): number {
  return 1 + Math.min(collectedDaCount * SPEED_BUFF_PER_VARIANT, SPEED_BUFF_CAP)
}

export interface MazeSignalState {
  signal: number
  settles: number
}

export async function readMazeSignalState(): Promise<MazeSignalState> {
  const [s, c] = await Promise.all([db.meta.get(SIGNAL_KEY), db.meta.get(SETTLES_KEY)])
  return { signal: Number(s?.value ?? '0') || 0, settles: Number(c?.value ?? '0') || 0 }
}

/** Set of collected `family:slot` keys for the maze branch (for lit/fog derivation). */
export async function collectedDaKeys(): Promise<Set<string>> {
  const all = await db.neuronVariants.toArray()
  const set = new Set<string>()
  for (const v of all) if (MAZE_FAMILIES.includes(v.familyId)) set.add(nodeKey(v.familyId, v.slotIndex))
  return set
}

/**
 * Accrue growth signal from one gameplay event. `base` already includes the
 * streak multiplier (callers fold it in); this applies the team-speed multiplier
 * and persists. Pure additive — does NOT settle (settling needs the content pack
 * and happens in the maze UI hook so it can animate the reveal).
 */
export async function accrueMazeSignal(base: number): Promise<void> {
  if (base <= 0) return
  const count = (await collectedDaKeys()).size
  const amount = base * mazeSpeedMultiplier(count)
  const cur = Number((await db.meta.get(SIGNAL_KEY))?.value ?? '0') || 0
  await db.meta.put({ key: SIGNAL_KEY, value: String(cur + amount) })
}

export interface SettleOutcome {
  /** Nodes newly lit by this reconcile pass, in settle order. */
  newlyLit: MazeNode[]
}

/**
 * Reconcile maze settles to the accrued signal: perform one settle per
 * SIGNAL_PER_NODE budget not yet spent, lighting the nearest fogged node each
 * time (reveal + mint that node's slot). Idempotent — runs floor(signal /
 * SIGNAL_PER_NODE) total settles over the maze's lifetime, stopping when no
 * fogged nodes remain. Called by the maze UI hook (has the content pack for
 * display-name resolution + can animate reveals).
 */
export async function reconcileSettles(
  resolveFamilyDisplayName: (familyId: string) => string,
): Promise<SettleOutcome> {
  const { signal } = await readMazeSignalState()
  let settles = Number((await db.meta.get(SETTLES_KEY))?.value ?? '0') || 0
  const targetSettles = Math.floor(signal / SIGNAL_PER_NODE)
  const collected = await collectedDaKeys()
  const newlyLit: MazeNode[] = []

  let guard = 0
  while (settles < targetSettles && guard++ < MAZE_GRAPH.nodes.length + 1) {
    const target = nextTarget(collected)
    if (!target) break // all nodes lit — nothing fogged to reveal
    const res = await mintVariantSlot(target.familyId, target.slotIndex, resolveFamilyDisplayName)
    if (!res.ok) break // mint failed → stop (don't burn the settle budget on errors)
    collected.add(nodeKey(target.familyId, target.slotIndex))
    newlyLit.push(target)
    settles += 1
    await db.meta.put({ key: SETTLES_KEY, value: String(settles) })
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
    state: readMazeSignalState,
    addSignal: accrueMazeSignal,
    reset: async () => {
      await db.meta.put({ key: SIGNAL_KEY, value: '0' })
      await db.meta.put({ key: SETTLES_KEY, value: '0' })
      console.warn('[maze] DEV: reset signal + settles to 0')
    },
  }
}
