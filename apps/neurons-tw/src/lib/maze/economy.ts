/**
 * Flat-grid maze per-FAMILY energy economy (redesign-neurons-maze-rotjs-grid).
 *
 * ONE currency per family: NEURAL ENERGY (monotonic, synced). A correct answer in
 * subject S accrues energy into family S's OWN pool directly (S is the family — no
 * NT-branch indirection); reading accrues entirely into the one chosen subject's
 * pool (per-subject reading, add-neurons-maze-zoom-and-focus). Energy is BOTH the
 * exploration fuel AND the pull cost: each
 * cumulative settle index N consumes `cost(N)` energy (front-loaded ramp) and
 * triggers exactly ONE `pullVariant` for that family — the maze is the ONLY pull
 * path (no manual pull). Lit nodes derive from the frontier (cumulative settles),
 * NOT from collected variants.
 *
 * Accrual multipliers (all capped — design D5 runaway guard): streak × mastery ×
 * energyAccel (passed in by the caller) × collection speed-buff × speedAccel ×
 * synapse cross-family LTP bonus (derived here, family-scoped).
 *
 * Persistence: per-family synced `meta` keys `maze:<familyId>:earned` (monotonic
 * faucet) + `maze:<familyId>:settles` (monotonic pull count), both in
 * SYNCED_META_KEYS + the MAX-merge counter post-pass.
 */
import {
  FAMILY_IDS,
  PACING_BASE,
  PACING_K,
  RAMP_CAP_N,
  SPEED_BUFF_PER_VARIANT,
  SPEED_BUFF_CAP,
  SYNAPSE_BONUS_PER,
  SYNAPSE_BONUS_CAP,
  CORRECT_ANSWER_ENERGY,
  READING_MINUTE_ENERGY,
} from '@study-rpg/content-neurons-tw'
import { db } from '../db'
import { frontierNode, litNodes, type MazeNode } from './graph'
import { pullVariant } from '../services/variant-gacha'
import { speedAccel } from '../services/acceleration'

// Re-export the faucet constants under their canonical names for app consumers.
export { CORRECT_ANSWER_ENERGY, READING_MINUTE_ENERGY }

/**
 * Energy cost of the N-th cumulative settle (0-indexed). The front-loaded ramp
 * climbs for the first `RAMP_CAP_N` settles then FLATTENS to a constant
 * `round(PACING_BASE × (1 + PACING_K × RAMP_CAP_N))`, so the completionist tail
 * (settles past the cap) costs a fixed amount instead of escalating without bound
 * (rebalance-neurons-maze-economy). The settle INDEX stays uncapped — only this
 * cost function is capped — so `cumulativeCost`/`affordableSettles`/`walkerFraction`
 * inherit the cap automatically since they all derive from `nodeCost`.
 */
export function nodeCost(n: number): number {
  return Math.round(PACING_BASE * (1 + PACING_K * Math.min(Math.max(0, n), RAMP_CAP_N)))
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

/** Per-family `meta` keys (synced, monotonic). Family ids are CJK; used verbatim. */
export const earnedKey = (familyId: string): string => `maze:${familyId}:earned`
export const settlesKey = (familyId: string): string => `maze:${familyId}:settles`

/** Streak multiplier mirrors the app's existing 1 + 0.05·min(s,10) feel. */
export const streakMultiplier = (streak: number): number =>
  1 + 0.05 * Math.min(Math.max(streak, 0), 10)

/** Family team exploration-speed multiplier: fixed base 1.0 + monotonic collection buff (capped). */
export function mazeSpeedMultiplier(collectedCount: number): number {
  return 1 + Math.min(collectedCount * SPEED_BUFF_PER_VARIANT, SPEED_BUFF_CAP)
}

export interface MazeEnergyState {
  /** Monotonic accrued energy for this family. */
  earned: number
  /** Monotonic count of settles (= pulls) performed for this family. */
  settles: number
}

export async function readMazeEnergyState(familyId: string): Promise<MazeEnergyState> {
  const [e, s] = await Promise.all([db.meta.get(earnedKey(familyId)), db.meta.get(settlesKey(familyId))])
  return { earned: Number(e?.value ?? '0') || 0, settles: Number(s?.value ?? '0') || 0 }
}

/** Count of collected variant rows in a family (drives the speed buff). */
async function collectedCountForFamily(familyId: string): Promise<number> {
  return db.neuronVariants.where('familyId').equals(familyId).count()
}

/**
 * Synapse cross-family LTP bonus for a family (design D6): each STRONG synapse the
 * family participates in (per `connectome-collection`, read-only) adds
 * `SYNAPSE_BONUS_PER`, summed and clamped to `1 + SYNAPSE_BONUS_CAP`. Returns 1.0
 * with no strong synapse. No LTD/decay penalty — the maze only reads current state.
 */
export async function synapseBonus(familyId: string): Promise<number> {
  const strong = await db.synapses.where('state').equals('strong').toArray()
  let count = 0
  for (const s of strong) {
    // pairKey encodes the two familyIds; a strong synapse counts if it involves us.
    const parts = s.pairKey.split('|')
    if (parts.includes(familyId)) count += 1
  }
  return 1 + Math.min(count * SYNAPSE_BONUS_PER, SYNAPSE_BONUS_CAP)
}

/**
 * Accrue energy into one family's pool from one gameplay event. `base` already
 * includes the event-scoped multipliers (streak × mastery × energyAccel folded in
 * by the caller); this applies the family-scoped multipliers — team speed-buff ×
 * speedAccel × synapse LTP bonus — and persists. Monotonic — never decremented.
 */
export async function accrueMazeEnergy(familyId: string, base: number): Promise<void> {
  if (base <= 0) return
  const [count, speed, syn] = await Promise.all([
    collectedCountForFamily(familyId),
    speedAccel(),
    synapseBonus(familyId),
  ])
  const amount = base * mazeSpeedMultiplier(count) * speed * syn
  const cur = Number((await db.meta.get(earnedKey(familyId)))?.value ?? '0') || 0
  await db.meta.put({ key: earnedKey(familyId), value: String(cur + amount) })
}

// Reading is now per-subject (add-neurons-maze-zoom-and-focus): a reading session
// is bound to one chosen family and accrues its per-minute energy entirely into
// that family's pool via `accrueMazeEnergy` directly — no even-split across active
// families. The former `accrueReadingEnergyActiveFamilies` split helper is retired.

export interface SettleOutcome {
  /** Nodes newly lit by this reconcile pass, in settle order (visual only). */
  newlyLit: MazeNode[]
}

/**
 * Reconcile one family's settles to its accrued energy: while the next settle is
 * affordable, advance the settle index and trigger exactly one `pullVariant` for
 * THIS family. First route → random within-tier pull lighting the frontier node;
 * 二回目 (second-route frontier) → deterministic position-bound unlock of that
 * node's location variant; past both routes → random pull yielding a dupe.
 * Idempotent; stops on the first pull error so the settle budget isn't burned.
 */
export async function reconcileSettles(
  familyId: string,
  resolveFamilyDisplayName: (familyId: string) => string,
): Promise<SettleOutcome> {
  const { earned } = await readMazeEnergyState(familyId)
  let settles = Number((await db.meta.get(settlesKey(familyId)))?.value ?? '0') || 0
  const target = affordableSettles(earned)
  const newlyLit: MazeNode[] = []

  let guard = 0
  while (settles < target && guard++ < 5000) {
    const node = frontierNode(familyId, settles) // node lit at this index, or null when both routes lit
    // First route (node.route === 1): random within-tier pull (P0 soft-pity).
    // 二回目 (node.route === 2): deterministic position-bound unlock of that
    // second-route node's location variant (add-neurons-maze-second-lap-variants).
    // Past both routes (node null): random pull → dupe (open-collection).
    const res =
      node?.route === 2
        ? await pullVariant(familyId, resolveFamilyDisplayName, { forceSlotIndex: node.slotIndex })
        : await pullVariant(familyId, resolveFamilyDisplayName)
    if (!res.ok) break // stop on error — don't advance settles on a failed pull
    if (node) newlyLit.push(node)
    settles += 1
    await db.meta.put({ key: settlesKey(familyId), value: String(settles) })
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
    state: (familyId: string = FAMILY_IDS[0]) => readMazeEnergyState(familyId),
    addEnergy: (familyId: string, base: number) => accrueMazeEnergy(familyId, base),
    litCount: async (familyId: string = FAMILY_IDS[0]) =>
      litNodes(familyId, (await readMazeEnergyState(familyId)).settles).length,
    reset: async (familyId?: string) => {
      const fams = familyId ? [familyId] : FAMILY_IDS
      for (const f of fams) {
        await db.meta.put({ key: earnedKey(f), value: '0' })
        await db.meta.put({ key: settlesKey(f), value: '0' })
      }
      console.warn('[maze] DEV: reset earned + settles to 0 for', familyId ?? 'all families')
    },
  }
}
