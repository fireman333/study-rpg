import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  RESCUE_PLAN_KEY,
  rescuePlanKey,
  rescueConfKey,
  rescueOvrKey,
  isSyncedRescueKey,
  RESCUE_RUN_SYNC_WINDOW_MS,
  RESCUE_RUN_SYNC_FORWARD_SKEW_MS,
  pickPlanEnvelopeLWW,
  pickConfLWW,
  pickOvrLWW,
  type RescuePlan,
} from '../lib/services/rescue/rescue-sync-keys'
import { isSyncedMetaKey } from '../lib/sync/tables'
import { backfillRescueLWW } from '../lib/sync/backfill/rescue'
import {
  migrateRescueLocalState,
  consumeRescueMigrationPush,
  __resetRescueStoreForTests,
  startRescue,
  abandonRescue,
  archiveIfDue,
  editRescuePlan,
  getActivePlan,
  getActivePlans,
} from '../lib/services/rescue/rescue-store'
import { clearLocalSyncedData } from '../lib/sync/account-guard'
import {
  signalSchemaDowngradeReload,
  shouldShowSchemaDowngradeReload,
  subscribeSchemaDowngradeReload,
  __resetSchemaDowngradeReloadForTests,
} from '../lib/sync/sync-reload-signal'

// add-neurons-multi-subject-rescue — per-family plan envelopes; the rescue
// family's merge is a registered backfill post-pass (per-family plan envelope
// latest-action-wins, per-key conf/ovr LWW); the metaAdapter first-write-wins is
// only its transport default.

const NOW = 1_800_000_000_000 // fixed "now" for window math
const ANAT = '解剖學'
const PHYS = '生理學'

const mkPlan = (over: Partial<RescuePlan> = {}): RescuePlan => ({
  familyId: ANAT,
  examDate: '2026-07-10',
  dailyMinutes: 40,
  createdAt: NOW,
  lastStudiedAt: NOW,
  ...over,
})
const mkEnv = (plan: RescuePlan | null, updatedAt: number): string => JSON.stringify({ plan, updatedAt })

function stubLocalStorage(): void {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  })
}

// ── matcher ───────────────────────────────────────────────────────────────────
describe('isSyncedRescueKey (membership)', () => {
  it('a per-family plan key is always synced; the legacy single key is NOT', () => {
    expect(isSyncedRescueKey(rescuePlanKey(ANAT), NOW)).toBe(true)
    expect(isSyncedRescueKey(rescuePlanKey('104-醫學一'), NOW)).toBe(true)
    // v28 never snapshots the legacy single key (recovered only via raw-bundle migration).
    expect(isSyncedRescueKey(RESCUE_PLAN_KEY, NOW)).toBe(false)
  })

  it('in-window conf/ovr keys sync; out-of-window ones do not', () => {
    const inWin = NOW - RESCUE_RUN_SYNC_WINDOW_MS + 1000
    const outWin = NOW - RESCUE_RUN_SYNC_WINDOW_MS - 1000
    expect(isSyncedRescueKey(rescueConfKey(inWin, ANAT, 'q1'), NOW)).toBe(true)
    expect(isSyncedRescueKey(rescueOvrKey(inWin, ANAT, 'c1'), NOW)).toBe(true)
    expect(isSyncedRescueKey(rescueConfKey(outWin, ANAT, 'q1'), NOW)).toBe(false)
    expect(isSyncedRescueKey(rescueOvrKey(outWin, ANAT, 'c1'), NOW)).toBe(false)
  })

  it('tolerates forward clock skew up to +1 day', () => {
    const ahead = NOW + RESCUE_RUN_SYNC_FORWARD_SKEW_MS - 1000
    const tooFarAhead = NOW + RESCUE_RUN_SYNC_FORWARD_SKEW_MS + 1000
    expect(isSyncedRescueKey(rescueConfKey(ahead, ANAT, 'q1'), NOW)).toBe(true)
    expect(isSyncedRescueKey(rescueConfKey(tooFarAhead, ANAT, 'q1'), NOW)).toBe(false)
  })

  it('never matches a non plan/conf/ovr rescue key (telemetry stays local)', () => {
    expect(isSyncedRescueKey('rescue:v1:telemetry', NOW)).toBe(false)
    expect(isSyncedRescueKey('rescue:v1:conf:', NOW)).toBe(false) // malformed → no createdAt
  })

  it('rejects a legacy 2-segment conf/ovr shape (no familyId segment) — Codex/Fable fix 1', () => {
    // v27-shaped keys `{createdAt}:{id}` (no familyId) must NOT be admitted — a
    // family segment is load-bearing (68 conceptIds are shared across subjects).
    expect(isSyncedRescueKey(`rescue:v1:conf:${NOW}:q1`, NOW)).toBe(false)
    expect(isSyncedRescueKey(`rescue:v1:ovr:${NOW}:membrane-transport`, NOW)).toBe(false)
    // an empty familyId segment `{createdAt}::{id}` is also rejected
    expect(isSyncedRescueKey(`rescue:v1:conf:${NOW}::q1`, NOW)).toBe(false)
    // sanity: the proper 3-segment shape is still admitted
    expect(isSyncedRescueKey(`rescue:v1:conf:${NOW}:${ANAT}:q1`, NOW)).toBe(true)
  })

  it('question / concept ids containing hyphens parse correctly', () => {
    const key = rescueConfKey(NOW, ANAT, '104-1-醫學一-解剖學-Q1')
    expect(isSyncedRescueKey(key, NOW)).toBe(true)
  })

  it('isSyncedMetaKey delegates to the rescue matcher (snapshot == apply)', () => {
    expect(isSyncedMetaKey(rescuePlanKey(ANAT))).toBe(true)
    expect(isSyncedMetaKey(RESCUE_PLAN_KEY)).toBe(false) // legacy single key not synced
    // out-of-window rescue key is rejected in BOTH directions (one test, one function)
    const stale = rescueConfKey(1_000_000_000_000, ANAT, 'q1')
    expect(isSyncedMetaKey(stale)).toBe(false)
  })
})

// ── cross-subject key non-collision (design D1) ───────────────────────────────
describe('per-family key non-collision', () => {
  it('override keys for two families sharing a conceptId at the same createdAt are distinct', () => {
    const a = rescueOvrKey(NOW, ANAT, 'membrane-transport')
    const b = rescueOvrKey(NOW, PHYS, 'membrane-transport')
    expect(a).not.toBe(b)
  })
  it('confidence keys for two families sharing a qid at the same createdAt are distinct', () => {
    expect(rescueConfKey(NOW, ANAT, 'q1')).not.toBe(rescueConfKey(NOW, PHYS, 'q1'))
  })
})

// ── pure LWW pickers (key-agnostic — unchanged by the per-family reshape) ──────
describe('pickPlanEnvelopeLWW (pure)', () => {
  it('latest updatedAt wins in both directions', () => {
    const early = mkEnv(mkPlan(), 100)
    const late = mkEnv(mkPlan({ familyId: PHYS }), 200)
    expect(pickPlanEnvelopeLWW(early, late)).toBe(late) // incoming later → replace
    expect(pickPlanEnvelopeLWW(late, early)).toBeNull() // local later → keep
  })

  it('an explicit null envelope propagates a clear by recency', () => {
    const active = mkEnv(mkPlan(), 100)
    const cleared = mkEnv(null, 200)
    expect(pickPlanEnvelopeLWW(active, cleared)).toBe(cleared)
    // …and a stale active never resurrects over a newer null
    expect(pickPlanEnvelopeLWW(cleared, active)).toBeNull()
  })

  it('malformed incoming keeps local; malformed local yields to valid incoming', () => {
    const good = mkEnv(mkPlan(), 100)
    expect(pickPlanEnvelopeLWW(good, '{broken')).toBeNull()
    expect(pickPlanEnvelopeLWW(good, JSON.stringify({ plan: mkPlan() }))).toBeNull() // no updatedAt
    expect(pickPlanEnvelopeLWW('{broken', good)).toBe(good)
    expect(pickPlanEnvelopeLWW(undefined, good)).toBe(good)
  })

  it('equal updatedAt is broken deterministically (converges both orders)', () => {
    const a = mkEnv(mkPlan({ familyId: ANAT }), 100)
    const b = mkEnv(mkPlan({ familyId: PHYS }), 100)
    const winAB = pickPlanEnvelopeLWW(a, b) // local a, incoming b
    const winBA = pickPlanEnvelopeLWW(b, a) // local b, incoming a
    // exactly one side replaces; both converge to the same raw value
    const finalFromA = winAB ?? a
    const finalFromB = winBA ?? b
    expect(finalFromA).toBe(finalFromB)
  })
})

describe('pickConfLWW / pickOvrLWW (pure)', () => {
  it('confidence: latest `at` wins (re-tap by recency)', () => {
    const sure = JSON.stringify({ signal: 'sure', at: 100 })
    const guess = JSON.stringify({ signal: 'guess', at: 200 })
    expect(pickConfLWW(sure, guess)).toBe(guess)
    expect(pickConfLWW(guess, sure)).toBeNull()
  })

  it('override: latest `setAt` wins', () => {
    const a = JSON.stringify({ setAt: 100, attemptsAtOverride: 4 })
    const b = JSON.stringify({ setAt: 200, attemptsAtOverride: 6 })
    expect(pickOvrLWW(a, b)).toBe(b)
    expect(pickOvrLWW(b, a)).toBeNull()
  })

  it('malformed incoming never wins', () => {
    const good = JSON.stringify({ signal: 'sure', at: 100 })
    expect(pickConfLWW(good, '{broken')).toBeNull()
    expect(pickConfLWW(good, JSON.stringify({ signal: 'nope', at: 999 }))).toBeNull()
  })
})

// ── backfill post-pass (db convergence, per-family) ───────────────────────────
describe('backfillRescueLWW (per-family post-pass convergence)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  const KA = rescuePlanKey(ANAT)
  const KB = rescuePlanKey(PHYS)

  it('a per-family plan envelope converges to the latest action in either pull order', async () => {
    const early = mkEnv(mkPlan(), 100)
    const late = mkEnv(mkPlan({ lastStudiedAt: NOW + 1 }), 200)
    await db.meta.put({ key: KA, value: early })
    await backfillRescueLWW(db, { [KA]: late })
    expect((await db.meta.get(KA))?.value).toBe(late)
    // device holds late, pulls early → keeps late
    await db.meta.put({ key: KA, value: late })
    await backfillRescueLWW(db, { [KA]: early })
    expect((await db.meta.get(KA))?.value).toBe(late)
  })

  it('two devices each starting a DIFFERENT family converge to holding BOTH plans', async () => {
    const anat = mkEnv(mkPlan({ familyId: ANAT }), 100)
    const phys = mkEnv(mkPlan({ familyId: PHYS }), 100)
    // device holds only anatomy, pulls a bundle carrying pharmacology
    await db.meta.put({ key: KA, value: anat })
    await backfillRescueLWW(db, { [KB]: phys })
    expect((await db.meta.get(KA))?.value).toBe(anat) // untouched
    expect((await db.meta.get(KB))?.value).toBe(phys) // installed — coexists
  })

  it('explicit-null clear propagates and does not resurrect from a stale bundle', async () => {
    const active = mkEnv(mkPlan(), 100)
    const cleared = mkEnv(null, 200)
    await db.meta.put({ key: KA, value: active })
    await backfillRescueLWW(db, { [KA]: cleared })
    expect((await db.meta.get(KA))?.value).toBe(cleared)
    // a later stale bundle carrying the older active envelope must NOT resurrect
    await backfillRescueLWW(db, { [KA]: active })
    expect((await db.meta.get(KA))?.value).toBe(cleared)
  })

  it('drops a malformed stored plan envelope so the reader regenerates', async () => {
    await db.meta.put({ key: KA, value: '{was-broken' })
    await backfillRescueLWW(db, { [KA]: '{was-broken' })
    expect(await db.meta.get(KA)).toBeUndefined()
  })

  it('confidence keys merge per-key by latest `at`', async () => {
    const key = rescueConfKey(Date.now(), ANAT, 'q1')
    await db.meta.put({ key, value: JSON.stringify({ signal: 'sure', at: 100 }) })
    await backfillRescueLWW(db, { [key]: JSON.stringify({ signal: 'guess', at: 200 }) })
    expect((await db.meta.get(key))?.value).toBe(JSON.stringify({ signal: 'guess', at: 200 }))
    // older incoming loses
    await backfillRescueLWW(db, { [key]: JSON.stringify({ signal: 'sure', at: 50 }) })
    expect(JSON.parse((await db.meta.get(key))!.value).signal).toBe('guess')
  })

  it('override keys merge per-key by latest `setAt`', async () => {
    const key = rescueOvrKey(Date.now(), ANAT, 'c1')
    await db.meta.put({ key, value: JSON.stringify({ setAt: 100, attemptsAtOverride: 4 }) })
    await backfillRescueLWW(db, { [key]: JSON.stringify({ setAt: 200, attemptsAtOverride: 6 }) })
    expect(JSON.parse((await db.meta.get(key))!.value).setAt).toBe(200)
  })

  it('cross-subject overrides on a shared concept at the same createdAt do not collide', async () => {
    const t = Date.now()
    const kA = rescueOvrKey(t, ANAT, 'membrane-transport')
    const kB = rescueOvrKey(t, PHYS, 'membrane-transport')
    await db.meta.put({ key: kA, value: JSON.stringify({ setAt: 10, attemptsAtOverride: 2 }) })
    await backfillRescueLWW(db, { [kB]: JSON.stringify({ setAt: 20, attemptsAtOverride: 3 }) })
    // both keys coexist untouched — A's override is not clobbered by B's
    expect(JSON.parse((await db.meta.get(kA))!.value).setAt).toBe(10)
    expect(JSON.parse((await db.meta.get(kB))!.value).setAt).toBe(20)
  })

  it('ignores out-of-window conf/ovr keys (a stale bundle cannot resurrect a run)', async () => {
    const stale = rescueConfKey(1_000_000_000_000, ANAT, 'q1')
    await backfillRescueLWW(db, { [stale]: JSON.stringify({ signal: 'sure', at: 1 }) })
    expect(await db.meta.get(stale)).toBeUndefined()
  })
})

// ── cloud legacy migration (design D9 step 2 — read from the RAW bundle) ───────
describe('backfillRescueLWW — cloud legacy single key migration', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('a v27-era cloud legacy plan lands as a per-family key (matcher would skip it)', async () => {
    const legacyActive = mkEnv(mkPlan({ familyId: ANAT }), 100) // written by the pre-multi build
    // fresh v28 device (no local rescue) pulls a bundle still carrying the legacy key
    await backfillRescueLWW(db, { [RESCUE_PLAN_KEY]: legacyActive })
    // migrated into the per-family key, present before the first push …
    expect((await db.meta.get(rescuePlanKey(ANAT)))?.value).toBe(legacyActive)
    // … and the backfill does not itself persist the legacy single key locally
    expect(await db.meta.get(RESCUE_PLAN_KEY)).toBeUndefined()
  })

  it('a legacy null envelope (no familyId) is discarded, not applied to any family', async () => {
    const legacyNull = mkEnv(null, 100)
    await backfillRescueLWW(db, { [RESCUE_PLAN_KEY]: legacyNull })
    const count = await db.meta.where('key').startsWith('rescue:v1:plan:').count()
    expect(count).toBe(0)
  })
})

// ── anonymous → authed adoption: per-family SET-wins (design D3) ───────────────
describe('backfillRescueLWW — anonymous→authed adoption (per-family SET-wins)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  const KA = rescuePlanKey(ANAT)
  const KC = rescuePlanKey('微生物學')
  const KD = rescuePlanKey('藥理學')

  it('a cloud ACTIVE plan wins over a later-updatedAt anonymous local plan (same family)', async () => {
    const localAnon = mkEnv(mkPlan({ familyId: ANAT, lastStudiedAt: NOW + 1 }), 500)
    const cloudActive = mkEnv(mkPlan({ familyId: ANAT }), 100)
    await db.meta.put({ key: KA, value: localAnon })
    await backfillRescueLWW(db, { [KA]: cloudActive }, { cloudPlanWins: true })
    expect((await db.meta.get(KA))?.value).toBe(cloudActive)
  })

  it('an anonymous-ONLY subject is DROPPED when the account already has rescue state', async () => {
    const anonC = mkEnv(mkPlan({ familyId: '微生物學' }), 500) // anon-only
    const cloudA = mkEnv(mkPlan({ familyId: ANAT }), 100) // account's existing rescue state
    await db.meta.put({ key: KC, value: anonC })
    await backfillRescueLWW(db, { [KA]: cloudA }, { cloudPlanWins: true })
    expect(await db.meta.get(KC)).toBeUndefined() // anon-only C dropped
    expect((await db.meta.get(KA))?.value).toBe(cloudA) // cloud A adopted
  })

  it('a MALFORMED cloud per-family value does not shield an anon-only plan from the drop (Codex/Fable fix 4)', async () => {
    const anonC = mkEnv(mkPlan({ familyId: '微生物學' }), 500) // anon-only, active
    const cloudA = mkEnv(mkPlan({ familyId: ANAT }), 100) // valid existing rescue state → adoption
    await db.meta.put({ key: KC, value: anonC })
    // Cloud carries a KEY for C but the value is garbage — it must NOT count as
    // "the account has rescue state for C", so anon-only C is still dropped.
    await backfillRescueLWW(db, { [KA]: cloudA, [KC]: '{not-valid-json' }, { cloudPlanWins: true })
    expect(await db.meta.get(KC)).toBeUndefined() // dropped despite the malformed cloud key
    expect((await db.meta.get(KA))?.value).toBe(cloudA)
  })

  it('adoption does not resurrect an abandoned account plan (cloud null wins)', async () => {
    const anonD = mkEnv(mkPlan({ familyId: '藥理學', lastStudiedAt: NOW + 1 }), 500)
    const cloudNullD = mkEnv(null, 100) // account abandoned D earlier
    await db.meta.put({ key: KD, value: anonD })
    await backfillRescueLWW(db, { [KD]: cloudNullD }, { cloudPlanWins: true })
    expect(JSON.parse((await db.meta.get(KD))!.value).plan).toBeNull() // stays abandoned
  })

  it('brand-new account (no cloud rescue key) keeps all anonymous plans', async () => {
    const anonA = mkEnv(mkPlan({ familyId: ANAT }), 500)
    const anonC = mkEnv(mkPlan({ familyId: '微生物學' }), 500)
    await db.meta.put({ key: KA, value: anonA })
    await db.meta.put({ key: KC, value: anonC })
    await backfillRescueLWW(db, {}, { cloudPlanWins: true }) // cloud silent on rescue
    expect((await db.meta.get(KA))?.value).toBe(anonA)
    expect((await db.meta.get(KC))?.value).toBe(anonC)
  })

  it('a NORMAL (non-adoption) pull keeps LWW: a later local plan is not clobbered', async () => {
    const localLater = mkEnv(mkPlan({ familyId: ANAT, lastStudiedAt: NOW + 1 }), 500)
    const cloudEarlier = mkEnv(mkPlan({ familyId: ANAT }), 100)
    await db.meta.put({ key: KA, value: localLater })
    await backfillRescueLWW(db, { [KA]: cloudEarlier }) // no opts → default LWW unchanged
    expect((await db.meta.get(KA))?.value).toBe(localLater)
  })
})

// ── store lifecycle (per-family coexistence / resume / de-dup / archive) ───────
describe('rescue-store — per-family lifecycle', () => {
  beforeEach(async () => {
    stubLocalStorage()
    await __resetRescueStoreForTests()
    await db.delete()
    await db.open()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starting B while A is active yields TWO coexisting plans (no replace gate)', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-20', dailyMinutes: 40 })
    startRescue({ familyId: PHYS, examDate: '2026-07-22', dailyMinutes: 30 })
    const plans = getActivePlans()
    expect(plans.map((p) => p.familyId).sort()).toEqual([ANAT, PHYS].sort())
    expect(getActivePlan(ANAT)).not.toBeNull()
    expect(getActivePlan(PHYS)).not.toBeNull()
  })

  it('starting the same family again resumes (no new createdAt, no rewrite)', () => {
    const first = startRescue({ familyId: ANAT, examDate: '2026-07-20', dailyMinutes: 40 })
    expect(first.ok).toBe(true)
    const again = startRescue({ familyId: ANAT, examDate: '2026-07-25', dailyMinutes: 99 })
    expect(again).toMatchObject({ ok: true, resumed: true })
    expect(again.ok && again.plan.createdAt).toBe(first.ok && first.plan.createdAt)
    // resume does NOT rewrite the plan — exam date / minutes are unchanged
    expect(getActivePlan(ANAT)?.examDate).toBe('2026-07-20')
  })

  it('two same-millisecond starts get distinct createdAt (+1ms de-dup)', () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_123_456)
    const a = startRescue({ familyId: ANAT, examDate: '2026-07-20', dailyMinutes: 40 })
    const b = startRescue({ familyId: PHYS, examDate: '2026-07-20', dailyMinutes: 40 })
    expect(a.ok && b.ok && a.plan.createdAt).not.toBe(b.ok && b.plan.createdAt)
    spy.mockRestore()
  })

  it('archiveIfDue sweeps EVERY due plan, leaving future plans active', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-01', dailyMinutes: 40 }) // past → due
    startRescue({ familyId: PHYS, examDate: '2026-12-31', dailyMinutes: 40 }) // future
    const archived = archiveIfDue('2026-07-09')
    expect(archived).toBe(true)
    expect(getActivePlan(ANAT)).toBeNull() // archived
    expect(getActivePlan(PHYS)).not.toBeNull() // untouched
  })

  it('abandon clears only the targeted family', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-20', dailyMinutes: 40 })
    startRescue({ familyId: PHYS, examDate: '2026-07-22', dailyMinutes: 30 })
    abandonRescue(ANAT)
    expect(getActivePlan(ANAT)).toBeNull()
    expect(getActivePlan(PHYS)).not.toBeNull()
  })

  it('editRescuePlan updates examDate/minutes on the same run (createdAt preserved)', () => {
    const started = startRescue({ familyId: ANAT, examDate: '2026-07-20', dailyMinutes: 40 })
    const createdAt = started.ok ? started.plan.createdAt : 0
    editRescuePlan(ANAT, { examDate: '2026-07-17', dailyMinutes: 55 })
    const plan = getActivePlan(ANAT)!
    expect(plan.examDate).toBe('2026-07-17')
    expect(plan.dailyMinutes).toBe(55)
    expect(plan.createdAt).toBe(createdAt)
  })
})

// ── migration (localStorage / db.meta single → per-family) ────────────────────
describe('migrateRescueLocalState (one-time, per-family)', () => {
  beforeEach(async () => {
    stubLocalStorage()
    await __resetRescueStoreForTests()
    await db.delete()
    await db.open()
  })

  const seedLegacy = (): { createdAt: number } => {
    const createdAt = Date.now() - 60_000
    const lastStudiedAt = createdAt + 30_000
    localStorage.setItem(
      'neurons:rescue:v1',
      JSON.stringify({
        plan: { familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40, createdAt, lastStudiedAt },
        confidence: { q1: 'sure', q2: 'guess' },
        overrides: { c1: { setAt: lastStudiedAt, attemptsAtOverride: 3 } },
        telemetry: [{ t: 1, kind: 'x' }],
      }),
    )
    localStorage.setItem('neurons:rescue:blitzDone', String(createdAt))
    return { createdAt }
  }

  it('seeds the per-family envelope, confidence, overrides, and blitz marker', async () => {
    const { createdAt } = seedLegacy()
    const lastStudiedAt = createdAt + 30_000
    await migrateRescueLocalState()
    const env = JSON.parse((await db.meta.get(rescuePlanKey(ANAT)))!.value)
    expect(env.updatedAt).toBe(lastStudiedAt) // conservative seed
    expect(env.plan.familyId).toBe(ANAT)
    expect(env.plan.blitzDoneAt).toBe(lastStudiedAt)
    expect(JSON.parse((await db.meta.get(rescueConfKey(createdAt, ANAT, 'q1')))!.value)).toEqual({
      signal: 'sure',
      at: lastStudiedAt,
    })
    expect(JSON.parse((await db.meta.get(rescueOvrKey(createdAt, ANAT, 'c1')))!.value)).toEqual({
      setAt: lastStudiedAt,
      attemptsAtOverride: 3,
    })
    // the legacy single key is never left behind
    expect(await db.meta.get(RESCUE_PLAN_KEY)).toBeUndefined()
  })

  it('migrates a db.meta legacy single key (this device pre-multi) into the per-family key', async () => {
    const createdAt = Date.now() - 120_000
    const legacyEnv = JSON.stringify({
      plan: { familyId: PHYS, examDate: '2026-07-15', dailyMinutes: 25, createdAt, lastStudiedAt: createdAt },
      updatedAt: createdAt,
    })
    await db.meta.put({ key: RESCUE_PLAN_KEY, value: legacyEnv })
    await migrateRescueLocalState()
    expect((await db.meta.get(rescuePlanKey(PHYS)))?.value).toBe(legacyEnv)
    expect(await db.meta.get(RESCUE_PLAN_KEY)).toBeUndefined() // legacy row removed
  })

  it('is idempotent — a second run does not re-seed after abandon (marker guard)', async () => {
    seedLegacy()
    await migrateRescueLocalState()
    // simulate a later abandon writing an explicit null envelope for that family
    await db.meta.put({ key: rescuePlanKey(ANAT), value: mkEnv(null, Date.now()) })
    await migrateRescueLocalState() // must NOT resurrect the legacy plan
    expect(JSON.parse((await db.meta.get(rescuePlanKey(ANAT)))!.value).plan).toBeNull()
  })

  it('flags ONE explicit push for the engine mount when it seeds', async () => {
    seedLegacy()
    expect(consumeRescueMigrationPush()).toBe(false) // nothing seeded yet
    await migrateRescueLocalState()
    expect(consumeRescueMigrationPush()).toBe(true)
    expect(consumeRescueMigrationPush()).toBe(false) // one-shot
  })

  it('does not flag a push when there is nothing to migrate', async () => {
    await migrateRescueLocalState()
    expect(consumeRescueMigrationPush()).toBe(false)
  })
})

// ── account-switch wipe covers the rescue namespace ───────────────────────────
describe('account-switch wipe clears the rescue:v1 namespace', () => {
  beforeEach(async () => {
    stubLocalStorage() // clearLocalSyncedData touches localStorage (etag / presign / cache)
    await __resetRescueStoreForTests()
    await db.delete()
    await db.open()
  })

  it('wipes per-family plan envelopes + run-scoped conf/ovr keys but keeps device-local meta', async () => {
    const createdAt = Date.now()
    const rescueKeys = [
      rescuePlanKey(ANAT),
      rescuePlanKey(PHYS),
      rescueConfKey(createdAt, ANAT, 'q1'),
      rescueOvrKey(createdAt, ANAT, 'c1'),
    ]
    for (const key of rescueKeys) await db.meta.put({ key, value: '{}' })
    await db.meta.put({ key: 'guidedComplete', value: '1' }) // device-local → survives

    await clearLocalSyncedData(db)

    for (const key of rescueKeys) {
      expect(await db.meta.get(key), `${key} should be wiped`).toBeUndefined()
    }
    expect((await db.meta.get('guidedComplete'))?.value).toBe('1')
  })
})

// ── schema-downgrade reload signal (design D4) ────────────────────────────────
describe('sync-reload-signal (schema-downgrade one-shot)', () => {
  beforeEach(() => {
    __resetSchemaDowngradeReloadForTests()
  })

  it('fires the reload prompt exactly once, not on every dirty cycle', () => {
    let notified = 0
    const unsub = subscribeSchemaDowngradeReload(() => {
      notified++
    })
    expect(shouldShowSchemaDowngradeReload()).toBe(false)
    signalSchemaDowngradeReload()
    signalSchemaDowngradeReload() // a second (and third) 409 dirty cycle must NOT re-fire
    signalSchemaDowngradeReload()
    expect(shouldShowSchemaDowngradeReload()).toBe(true)
    expect(notified).toBe(1)
    unsub()
  })
})
