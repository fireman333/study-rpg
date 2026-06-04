/**
 * Brain-maze per-branch energy economy (promote-maze-to-home / Model A).
 *
 * ONE currency: per-branch NEURAL ENERGY (monotonic, synced). A correct answer
 * accrues energy into the answered subject's NT branch; reading splits evenly
 * across the four branches. Energy is BOTH the exploration fuel AND the pull
 * cost: each cumulative settle index N consumes `cost(N)` energy (front-loaded
 * ramp) and triggers exactly ONE `pullVariant` (random) — the maze is the ONLY
 * pull path (no manual pull). Pre-completion the pull targets the lit node's
 * family; post-completion (二週目) the branch's least-collected family. Lit nodes
 * derive from the frontier (cumulative settles), NOT from collected variants.
 *
 * Persistence: per-branch synced `meta` keys `maze:<branch>:earned` (monotonic
 * faucet) + `maze:<branch>:settles` (monotonic pull count), both in
 * SYNCED_META_KEYS + the MAX-merge counter post-pass. No Dexie schema bump.
 */
import type { NtBranchId } from '@study-rpg/content-neurons-tw'
import { db } from '../db'
import { FAMILIES_BY_BRANCH, NT_BRANCHES, frontierNode, type MazeNode } from './graph'
import { pullVariant, slotsForFamily } from '../services/variant-gacha'
import { speedAccel } from '../services/acceleration'

// --- tunable constants (front-loaded ramp; dogfood telemetry will calibrate) ---
/** Energy per correct answer (before streak + speed multipliers). */
export const CORRECT_ENERGY = 3
/** Energy per reading minute (before speed multiplier; split across branches). */
export const READING_ENERGY = 2
/**
 * Front-loaded linear pacing: cost of the N-th cumulative settle.
 * `cost(N) = round(PACING_BASE × (1 + PACING_K·N))` — low base + steep K so the
 * first nodes are cheap (fast onboarding) and late nodes / 二週目 are expensive
 * (long tail). First-cut values; total Σ(0..109) ≈ 17,000 ≈ 3-month light-all arc.
 */
export const PACING_BASE = 24
export const PACING_K = 0.1
/** Per-collected-variant speed buff; capped so an over-collected team can't trivialize. */
export const SPEED_BUFF_PER_VARIANT = 0.04
export const SPEED_BUFF_CAP = 1.0 // max +100% → 2× base

/** Energy cost of the N-th cumulative settle (0-indexed, uncapped — ramp continues into 二週目). */
export function nodeCost(n: number): number {
  return Math.round(PACING_BASE * (1 + PACING_K * Math.max(0, n)))
}

/** Cumulative energy to perform the first `s` settles (Σ cost(0..s-1)). */
export function cumulativeCost(s: number): number {
  let total = 0
  for (let i = 0; i < s; i++) total += nodeCost(i)
  return total
}

/** Largest settle count affordable with `earned` energy (max S with cumulativeCost(S) ≤ earned). */
export function affordableSettles(earned: number): number {
  let s = 0
  let total = 0
  for (;;) {
    const next = total + nodeCost(s)
    if (next > earned) break
    total = next
    s++
  }
  return s
}

/** Per-branch `meta` keys (synced, monotonic). */
const earnedKey = (branch: NtBranchId): string => `maze:${branch.toLowerCase()}:earned`
const settlesKey = (branch: NtBranchId): string => `maze:${branch.toLowerCase()}:settles`

/** Streak multiplier mirrors the app's existing 1 + 0.05·min(s,10) feel. */
export const streakMultiplier = (streak: number): number =>
  1 + 0.05 * Math.min(Math.max(streak, 0), 10)

/** Branch team exploration-speed multiplier: fixed base 1.0 + monotonic collection buff (capped). */
export function mazeSpeedMultiplier(collectedCount: number): number {
  return 1 + Math.min(collectedCount * SPEED_BUFF_PER_VARIANT, SPEED_BUFF_CAP)
}

export interface MazeEnergyState {
  /** Monotonic accrued energy for this branch. */
  earned: number
  /** Monotonic count of settles (= pulls) performed for this branch. */
  settles: number
}

export async function readMazeEnergyState(branch: NtBranchId): Promise<MazeEnergyState> {
  const [e, s] = await Promise.all([db.meta.get(earnedKey(branch)), db.meta.get(settlesKey(branch))])
  return { earned: Number(e?.value ?? '0') || 0, settles: Number(s?.value ?? '0') || 0 }
}

/** Set of collected `family:slot` keys for a branch (for speed + least-collected derivation). */
export async function collectedKeys(branch: NtBranchId): Promise<Set<string>> {
  const fams = FAMILIES_BY_BRANCH[branch]
  const all = await db.neuronVariants.toArray()
  const set = new Set<string>()
  for (const v of all) if (fams.includes(v.familyId)) set.add(`${v.familyId}:${v.slotIndex}`)
  return set
}

/**
 * Accrue energy into one branch's pool from one gameplay event. `base` already
 * includes the streak multiplier (callers fold it in); this applies the branch's
 * team-speed multiplier and persists. Monotonic — never decremented.
 */
export async function accrueMazeEnergy(branch: NtBranchId, base: number): Promise<void> {
  if (base <= 0) return
  const count = (await collectedKeys(branch)).size
  // Exploration-speed lane (add-neurons-acceleration-system): the maze team-speed
  // multiplier composes the collection-count buff with the acceleration speed pool
  // (surge consumable + owned speed-lane equipment, hard-capped). speedAccel() = 1
  // when nothing is active, so this is a no-op for un-accelerated saves.
  const accel = await speedAccel()
  const amount = base * mazeSpeedMultiplier(count) * accel
  const cur = Number((await db.meta.get(earnedKey(branch)))?.value ?? '0') || 0
  await db.meta.put({ key: earnedKey(branch), value: String(cur + amount) })
}

/** Reading has no subject/NT context → split the per-minute energy evenly across all branches. */
export async function accrueReadingEnergyAllBranches(base: number): Promise<void> {
  if (base <= 0) return
  const per = base / NT_BRANCHES.length
  for (const branch of NT_BRANCHES) await accrueMazeEnergy(branch, per)
}

/** Least-collected family in a branch (lowest owned/total ratio) — the 二週目 pull target. */
async function leastCollectedFamily(branch: NtBranchId): Promise<string | null> {
  const fams = FAMILIES_BY_BRANCH[branch]
  if (fams.length === 0) return null
  const all = await db.neuronVariants.toArray()
  let best = fams[0]
  let bestRatio = Infinity
  for (const fam of fams) {
    const owned = all.filter((v) => v.familyId === fam).length
    const total = slotsForFamily(fam) || 1
    const ratio = owned / total
    if (ratio < bestRatio) {
      bestRatio = ratio
      best = fam
    }
  }
  return best
}

export interface SettleOutcome {
  /** Nodes newly lit by this reconcile pass, in settle order (visual only). */
  newlyLit: MazeNode[]
}

/**
 * Reconcile one branch's settles to its accrued energy: while the next settle is
 * affordable (`cumulativeCost(settles+1) ≤ earned`), advance the settle index and
 * trigger exactly one `pullVariant`. Target family = the lit node's family
 * (pre-completion) else the branch's least-collected family (二週目). Idempotent;
 * stops on the first pull error so the settle budget isn't burned on failures.
 */
export async function reconcileSettles(
  branch: NtBranchId,
  resolveFamilyDisplayName: (familyId: string) => string,
): Promise<SettleOutcome> {
  const { earned } = await readMazeEnergyState(branch)
  let settles = Number((await db.meta.get(settlesKey(branch)))?.value ?? '0') || 0
  const target = affordableSettles(earned)
  const newlyLit: MazeNode[] = []

  let guard = 0
  while (settles < target && guard++ < 5000) {
    const node = frontierNode(branch, settles) // node lit at this index, or null in 二週目
    const familyId = node ? node.familyId : await leastCollectedFamily(branch)
    if (!familyId) break
    const res = await pullVariant(familyId, resolveFamilyDisplayName)
    if (!res.ok) break // stop on error — don't advance settles on a failed pull
    if (node) newlyLit.push(node)
    settles += 1
    await db.meta.put({ key: settlesKey(branch), value: String(settles) })
  }
  return { newlyLit }
}

/** Walker progress (0..1) toward the next node = unspent energy fraction of the next settle's cost. */
export function walkerFraction(state: MazeEnergyState): number {
  const next = nodeCost(state.settles)
  if (next <= 0) return 0
  const remaining = state.earned - cumulativeCost(state.settles)
  return Math.max(0, Math.min(1, remaining / next))
}

/* DEV-only debug handle for manual dogfood smoke (mirrors __sync / __variantGacha). */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __maze?: unknown }).__maze = {
    state: (branch: NtBranchId = 'DA') => readMazeEnergyState(branch),
    addEnergy: (branch: NtBranchId, base: number) => accrueMazeEnergy(branch, base),
    reset: async (branch?: NtBranchId) => {
      const branches = branch ? [branch] : NT_BRANCHES
      for (const b of branches) {
        await db.meta.put({ key: earnedKey(b), value: '0' })
        await db.meta.put({ key: settlesKey(b), value: '0' })
      }
      console.warn('[maze] DEV: reset earned + settles to 0 for', branch ?? 'all branches')
    },
  }
}
