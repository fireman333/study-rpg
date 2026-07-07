import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { db, todayISO } from '../lib/db'
import { earnedKey } from '../lib/maze/economy'
import {
  deriveTierSpec,
  deriveTier,
  deriveStatus,
  grantFamilyForDate,
  recomputeAndClaimTiers,
  recordPrescriptionAnswer,
  recordSynapseWire,
  getPrescriptionStatus,
  TIER_ENERGY,
  TIER_T2_EXTRA_DEFAULT,
  TIER_T3_TARGET_DEFAULT,
  TIER_T4_CORRECTIONS_DEFAULT,
  TIER_T4_SYNAPSES_DEFAULT,
  type PrescriptionPlan,
  type TierProgress,
} from '../lib/services/prescription'
import { backfillPrescriptionPlanMinLWW } from '../lib/sync/backfill/prescription-plan'

// ── helpers ───────────────────────────────────────────────────────────────────

const mkPlan = (over: Partial<PrescriptionPlan> = {}): PrescriptionPlan => ({
  date: todayISO(),
  createdAt: 1,
  seed: 'seed',
  wrongTarget: 1,
  breadthTarget: 0,
  breadthFamilyId: 'phys',
  breadthFamilyLabel: '生理',
  wrongEligibleQuestionIds: ['w1', 'w2'],
  breadthEligibleQuestionIds: [],
  yearScope: null,
  t2Kind: 'wrongOverflow',
  t2Extra: 1,
  t3Kind: 'synapse',
  t3Target: 1,
  t4Kind: 'deep',
  t4Target: { corrections: 2, synapses: 2 },
  ...over,
})

const prog = (over: Partial<TierProgress> = {}): TierProgress => ({
  wrongDone: 0,
  breadthDone: 0,
  cramRescueCount: 0,
  wireCount: 0,
  t1Claimed: false,
  claimedTiers: new Set(),
  ...over,
})

async function putPlan(plan: PrescriptionPlan): Promise<void> {
  await db.meta.put({ key: `prescription:v1:plan:${plan.date}`, value: JSON.stringify(plan) })
}

async function putWrongKeys(qids: string[]): Promise<void> {
  for (const qid of qids)
    await db.meta.put({ key: `prescription:v1:wrong:${todayISO()}:${qid}`, value: '1' })
}

async function readEarned(familyId: string): Promise<number> {
  return Number((await db.meta.get(earnedKey(familyId)))?.value ?? '0') || 0
}

// ── 6.1 pure: deriveTierSpec table (auto-shrink + fallback chain) ─────────────

describe('deriveTierSpec', () => {
  it('wrong-snapshot overflow → wrongOverflow, auto-shrunk to the overflow', () => {
    // pool 6, target 4 → overflow 2 < default 3 → shrink to 2
    const spec = deriveTierSpec({
      wrongTarget: 4,
      wrongEligibleCount: 6,
      breadthTarget: 8,
      breadthEligibleCount: 20,
    })
    expect(spec.t2Kind).toBe('wrongOverflow')
    expect(spec.t2Extra).toBe(2)
  })

  it('large overflow keeps the default extra', () => {
    const spec = deriveTierSpec({
      wrongTarget: 5,
      wrongEligibleCount: 50,
      breadthTarget: 7,
      breadthEligibleCount: 20,
    })
    expect(spec.t2Kind).toBe('wrongOverflow')
    expect(spec.t2Extra).toBe(TIER_T2_EXTRA_DEFAULT)
  })

  it('no wrong overflow → falls back to the breadth pool overflow', () => {
    // wrong pool exactly the target; breadth pool has 2 beyond its target
    const spec = deriveTierSpec({
      wrongTarget: 2,
      wrongEligibleCount: 2,
      breadthTarget: 8,
      breadthEligibleCount: 10,
    })
    expect(spec.t2Kind).toBe('breadth')
    expect(spec.t2Extra).toBe(2)
  })

  it('both pools exhausted → cram fallback at a DOUBLED target', () => {
    const spec = deriveTierSpec({
      wrongTarget: 1,
      wrongEligibleCount: 1,
      breadthTarget: 8,
      breadthEligibleCount: 8,
    })
    expect(spec.t2Kind).toBe('cram')
    expect(spec.t2Extra).toBe(TIER_T2_EXTRA_DEFAULT * 2)
  })

  it('empty frozen wrong pool → synapse rungs frozen ABSENT (no dead state), T2 still present', () => {
    const spec = deriveTierSpec({
      wrongTarget: 0,
      wrongEligibleCount: 0,
      breadthTarget: 10,
      breadthEligibleCount: 10,
    })
    expect(spec.t2Kind).toBe('cram')
    expect(spec.t3Kind).toBeUndefined()
    expect(spec.t3Target).toBeUndefined()
    expect(spec.t4Kind).toBeUndefined()
    expect(spec.t4Target).toBeUndefined()
  })

  it('T4 corrections shrink to what the frozen pools make achievable', () => {
    // 5 frozen wrongs, wrongOverflow chain (no fallback units) → 5, not 12
    const spec = deriveTierSpec({
      wrongTarget: 4,
      wrongEligibleCount: 5,
      breadthTarget: 8,
      breadthEligibleCount: 20,
    })
    expect(spec.t4Target).toEqual({ corrections: 5, synapses: TIER_T4_SYNAPSES_DEFAULT })
    // large pool → the default cap
    const big = deriveTierSpec({
      wrongTarget: 6,
      wrongEligibleCount: 100,
      breadthTarget: 6,
      breadthEligibleCount: 50,
    })
    expect(big.t4Target?.corrections).toBe(TIER_T4_CORRECTIONS_DEFAULT)
    expect(big.t3Target).toBe(TIER_T3_TARGET_DEFAULT)
  })

  it('cram fallback units extend the achievable T4 correction stream', () => {
    // 2 frozen wrongs + cram×2 (6 units) → corrections min(12, 8) = 8
    const spec = deriveTierSpec({
      wrongTarget: 2,
      wrongEligibleCount: 2,
      breadthTarget: 8,
      breadthEligibleCount: 8,
    })
    expect(spec.t2Kind).toBe('cram')
    expect(spec.t4Target?.corrections).toBe(8)
  })
})

// ── 6.1 pure: deriveTier across progress combinations ─────────────────────────

describe('deriveTier', () => {
  it('legacy plan without tier fields → tier-absent (null)', () => {
    const legacy = mkPlan({
      t2Kind: undefined,
      t2Extra: undefined,
      t3Kind: undefined,
      t3Target: undefined,
      t4Kind: undefined,
      t4Target: undefined,
    })
    expect(deriveTier(legacy, prog())).toBeNull()
    expect(deriveTier(null, prog())).toBeNull()
  })

  it('climbs the ladder strictly: T1 → T2 → T3 → T4', () => {
    const plan = mkPlan() // wrongTarget 1, t2Extra 1 (overflow), t3 1, t4 {2 corr, 2 syn}
    expect(deriveTier(plan, prog())?.derivedTier).toBe(0)
    expect(deriveTier(plan, prog({ wrongDone: 1 }))?.derivedTier).toBe(1)
    expect(deriveTier(plan, prog({ wrongDone: 2 }))?.derivedTier).toBe(2)
    expect(deriveTier(plan, prog({ wrongDone: 2, wireCount: 1 }))?.derivedTier).toBe(3)
    expect(deriveTier(plan, prog({ wrongDone: 2, wireCount: 2 }))?.derivedTier).toBe(4)
  })

  it('T4 requires BOTH cumulative corrections AND ≥2 synapses', () => {
    const plan = mkPlan({ t4Target: { corrections: 2, synapses: 2 } })
    // corrections met, only 1 synapse → stays 3
    expect(deriveTier(plan, prog({ wrongDone: 2, wireCount: 1 }))?.derivedTier).toBe(3)
    // 2 synapses but corrections short → T2 not even reached (t2 overflow unmet)
    expect(deriveTier(plan, prog({ wrongDone: 1, wireCount: 2 }))?.derivedTier).toBe(1)
  })

  it('counts T2 cram-fallback units via cramRescueCount (and toward T4, capped)', () => {
    const plan = mkPlan({
      t2Kind: 'cram',
      t2Extra: 6,
      t4Target: { corrections: 8, synapses: 2 },
      wrongEligibleQuestionIds: ['w1', 'w2'],
      wrongTarget: 2,
    })
    const p = prog({ wrongDone: 2, cramRescueCount: 6, wireCount: 2 })
    const t = deriveTier(plan, p)!
    expect(t.t2?.complete).toBe(true)
    // T4 corrections stream = wrong keys (2) + fallback units capped at t2Extra (6) = 8
    expect(t.t4?.corrections.done).toBe(8)
    expect(t.derivedTier).toBe(4)
    // unbounded cram can't alone power T4: 99 cram units still cap at t2Extra
    const t2 = deriveTier(plan, prog({ wrongDone: 0, cramRescueCount: 99, wireCount: 2 }))!
    expect(t2.t4?.corrections.done).toBe(6)
  })

  it('displayTier = max(derivedTier, highestClaimedTier) — the claim-floor', () => {
    const plan = mkPlan()
    const t = deriveTier(plan, prog({ wrongDone: 1, claimedTiers: new Set([3]) }))!
    expect(t.derivedTier).toBe(1)
    expect(t.highestClaimedTier).toBe(3)
    expect(t.displayTier).toBe(3)
  })
})

describe('grantFamilyForDate', () => {
  it('is deterministic per date and independent of any (divergent) plan fields', () => {
    const date = todayISO()
    const a = grantFamilyForDate(date)
    const b = grantFamilyForDate(date)
    expect(a).toBe(b) // deterministic — two devices always pick the same family for a date
    expect(FAMILY_IDS).toContain(a)
    // Does NOT depend on breadthFamilyId / seed — the fix that prevents two
    // offline devices from double-paying a tier into two different families.
    // (No plan is consulted at all; the family is a pure function of the date.)
    expect(grantFamilyForDate('2026-01-01')).toBe(grantFamilyForDate('2026-01-01'))
  })
})

// ── 6.2 impure: claim idempotency / pull-replay / claim-floor ─────────────────

describe('tier claims (claim-gated flat energy)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('(a) idempotency — double-crossing the same tier grants once', async () => {
    const gf = grantFamilyForDate(todayISO()) // date-derived, shared grant family
    const plan = mkPlan()
    await putPlan(plan)
    await putWrongKeys(['w1', 'w2']) // T1 (1) + T2 overflow (1)
    const first = await recomputeAndClaimTiers()
    expect(first.map((c) => c.tier).sort()).toEqual([1, 2])
    expect(first.every((c) => c.familyId === gf)).toBe(true) // grants to the date-derived family
    expect(await readEarned(gf)).toBe(TIER_ENERGY[1] + TIER_ENERGY[2]) // flat 10 + 15
    const second = await recomputeAndClaimTiers()
    expect(second).toEqual([])
    expect(await readEarned(gf)).toBe(TIER_ENERGY[1] + TIER_ENERGY[2]) // unchanged
  })

  it('(a2) divergent-family — the same tier never double-pays two families', async () => {
    // Two devices freeze DIVERGENT plans for the same date (different breadth
    // family + seed) and each cross T1 before the plan merge converges. Because
    // the grant family is date-derived (NOT plan-derived), both grant the SAME
    // family → MAX-merge collapses to one grant instead of paying two families.
    const gf = grantFamilyForDate(todayISO())
    await putPlan(mkPlan({ breadthFamilyId: 'phys', seed: 'aa' }))
    await putWrongKeys(['w1'])
    const devA = await recomputeAndClaimTiers()
    expect(devA.map((c) => c.familyId)).toEqual([gf]) // NOT 'phys'
    expect(await readEarned(gf)).toBe(TIER_ENERGY[1])
    // A second device's plan with a different family/seed would grant the SAME gf.
    expect(grantFamilyForDate(todayISO())).toBe(gf)
  })

  it('(b) pull-replay — applying an incoming tierClaim does NOT grant energy locally', async () => {
    const plan = mkPlan()
    await putPlan(plan)
    await putWrongKeys(['w1', 'w2'])
    // Simulate claims arriving via sync (the metaAdapter writes the rows raw —
    // never through the claim helper, the load-bearing idempotency point).
    const date = todayISO()
    await db.meta.put({
      key: `prescription:v1:reward:${date}`,
      value: JSON.stringify({ claimedAt: 1, energy: 10, familyId: 'phys' }),
    })
    await db.meta.put({
      key: `prescription:v1:tierClaim:${date}:2`,
      value: JSON.stringify({ claimedAt: 1, energy: 15, familyId: 'phys' }),
    })
    const crossings = await recomputeAndClaimTiers()
    expect(crossings).toEqual([]) // no local absent→present transition
    expect(await readEarned(grantFamilyForDate(date))).toBe(0) // energy already rides the MAX-merged counter
    // …but the claim-floor still shows the tier as claimed.
    const status = await getPrescriptionStatus()
    expect(status.tier?.highestClaimedTier).toBe(2)
    expect(status.tier?.displayTier).toBe(2)
  })

  it('(c) divergent-plan-no-downgrade — displayTier never drops below the claimed tier', async () => {
    const date = todayISO()
    // Local (losing, later-created) plan: generous spec the device already climbed.
    const losing = mkPlan({ createdAt: 200, seed: 'zz' })
    await putPlan(losing)
    await putWrongKeys(['w1', 'w2'])
    await recordSynapseWire('生理學|藥理學') // T3 wire + recompute claims 1..3
    let status = await getPrescriptionStatus()
    expect(status.tier?.derivedTier).toBe(3)
    expect(status.tier?.highestClaimedTier).toBe(3)
    // The MIN-LWW winner arrives: earlier-created, much stricter targets.
    const winner = mkPlan({
      createdAt: 100,
      seed: 'aa',
      wrongTarget: 5,
      wrongEligibleQuestionIds: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'],
      t2Kind: 'wrongOverflow',
      t2Extra: 3,
      t4Target: { corrections: 8, synapses: 2 },
    })
    await backfillPrescriptionPlanMinLWW(db, {
      [`prescription:v1:plan:${date}`]: JSON.stringify(winner),
    })
    status = await getPrescriptionStatus()
    expect(status.plan?.createdAt).toBe(100) // winner governs derivation
    expect(status.tier?.derivedTier).toBe(0) // wrongDone 2 < 5 under the winner
    expect(status.tier?.displayTier).toBe(3) // claim-floor absorbs the drop
  })

  it('recordPrescriptionAnswer surfaces crossings at the verdict moment (T1 reward carries +10)', async () => {
    const plan = mkPlan({
      wrongTarget: 1,
      wrongEligibleQuestionIds: ['w1'],
      t2Kind: 'cram',
      t2Extra: 6,
      t3Kind: undefined,
      t3Target: undefined,
      t4Kind: undefined,
      t4Target: undefined,
    })
    await putPlan(plan)
    const gf = grantFamilyForDate(todayISO())
    const res = await recordPrescriptionAnswer('w1', 'anat', true)
    expect(res.justCompleted).toBe(true)
    expect(res.tierCrossings).toEqual([{ tier: 1, energy: TIER_ENERGY[1], familyId: gf }])
    expect(await readEarned(gf)).toBe(TIER_ENERGY[1])
    // replay answer: no re-grant
    const replay = await recordPrescriptionAnswer('w1', 'anat', true)
    expect(replay.tierCrossings).toEqual([])
    expect(await readEarned(gf)).toBe(TIER_ENERGY[1])
  })

  it('deriveStatus carries the tier ladder (null for legacy plans)', () => {
    const legacy = mkPlan({
      t2Kind: undefined,
      t2Extra: undefined,
      t3Kind: undefined,
      t3Target: undefined,
      t4Kind: undefined,
      t4Target: undefined,
    })
    expect(deriveStatus(legacy, 0, 0, 0).tier).toBeNull()
    const withTier = deriveStatus(mkPlan(), 2, 0, 0, false, {
      cramRescueCount: 0,
      wireCount: 0,
      t1Claimed: false,
      claimedTiers: new Set(),
    })
    expect(withTier.tier?.derivedTier).toBe(2)
  })
})
