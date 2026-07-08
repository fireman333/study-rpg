import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  RESCUE_PLAN_KEY,
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
} from '../lib/services/rescue/rescue-store'
import { clearLocalSyncedData } from '../lib/sync/account-guard'

// add-neurons-rescue-r2-sync — the rescue family's merge is a registered backfill
// post-pass (plan envelope latest-action-wins, per-key conf/ovr LWW); the
// metaAdapter first-write-wins is only its transport default.

const NOW = 1_800_000_000_000 // fixed "now" for window math

const mkPlan = (over: Partial<RescuePlan> = {}): RescuePlan => ({
  familyId: '解剖學',
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
  it('the plan key is always synced', () => {
    expect(isSyncedRescueKey(RESCUE_PLAN_KEY, NOW)).toBe(true)
  })

  it('in-window conf/ovr keys sync; out-of-window ones do not', () => {
    const inWin = NOW - RESCUE_RUN_SYNC_WINDOW_MS + 1000
    const outWin = NOW - RESCUE_RUN_SYNC_WINDOW_MS - 1000
    expect(isSyncedRescueKey(rescueConfKey(inWin, 'q1'), NOW)).toBe(true)
    expect(isSyncedRescueKey(rescueOvrKey(inWin, 'c1'), NOW)).toBe(true)
    expect(isSyncedRescueKey(rescueConfKey(outWin, 'q1'), NOW)).toBe(false)
    expect(isSyncedRescueKey(rescueOvrKey(outWin, 'c1'), NOW)).toBe(false)
  })

  it('tolerates forward clock skew up to +1 day', () => {
    const ahead = NOW + RESCUE_RUN_SYNC_FORWARD_SKEW_MS - 1000
    const tooFarAhead = NOW + RESCUE_RUN_SYNC_FORWARD_SKEW_MS + 1000
    expect(isSyncedRescueKey(rescueConfKey(ahead, 'q1'), NOW)).toBe(true)
    expect(isSyncedRescueKey(rescueConfKey(tooFarAhead, 'q1'), NOW)).toBe(false)
  })

  it('never matches a non plan/conf/ovr rescue key (telemetry stays local)', () => {
    expect(isSyncedRescueKey('rescue:v1:telemetry', NOW)).toBe(false)
    expect(isSyncedRescueKey('rescue:v1:conf:', NOW)).toBe(false) // malformed → no createdAt
  })

  it('question / concept ids containing hyphens parse correctly', () => {
    const key = rescueConfKey(NOW, '104-1-醫學一-解剖學-Q1')
    expect(isSyncedRescueKey(key, NOW)).toBe(true)
  })

  it('isSyncedMetaKey delegates to the rescue matcher (snapshot == apply)', () => {
    expect(isSyncedMetaKey(RESCUE_PLAN_KEY)).toBe(true)
    // out-of-window rescue key is rejected in BOTH directions (one test, one function)
    const stale = rescueConfKey(1_000_000_000_000, 'q1')
    expect(isSyncedMetaKey(stale)).toBe(false)
  })
})

// ── pure LWW pickers ──────────────────────────────────────────────────────────
describe('pickPlanEnvelopeLWW (pure)', () => {
  it('latest updatedAt wins in both directions', () => {
    const early = mkEnv(mkPlan(), 100)
    const late = mkEnv(mkPlan({ familyId: '生理學' }), 200)
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
    const a = mkEnv(mkPlan({ familyId: '解剖學' }), 100)
    const b = mkEnv(mkPlan({ familyId: '生理學' }), 100)
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

// ── backfill post-pass (db convergence) ───────────────────────────────────────
describe('backfillRescueLWW (post-pass convergence)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('plan envelope converges to the latest action in either pull order', async () => {
    const early = mkEnv(mkPlan(), 100)
    const late = mkEnv(mkPlan({ familyId: '生理學' }), 200)
    // device holds early, pulls late
    await db.meta.put({ key: RESCUE_PLAN_KEY, value: early })
    await backfillRescueLWW(db, { [RESCUE_PLAN_KEY]: late })
    expect((await db.meta.get(RESCUE_PLAN_KEY))?.value).toBe(late)
    // device holds late, pulls early → keeps late
    await db.meta.put({ key: RESCUE_PLAN_KEY, value: late })
    await backfillRescueLWW(db, { [RESCUE_PLAN_KEY]: early })
    expect((await db.meta.get(RESCUE_PLAN_KEY))?.value).toBe(late)
  })

  it('explicit-null clear propagates and does not resurrect from a stale bundle', async () => {
    const active = mkEnv(mkPlan(), 100)
    const cleared = mkEnv(null, 200)
    await db.meta.put({ key: RESCUE_PLAN_KEY, value: active })
    await backfillRescueLWW(db, { [RESCUE_PLAN_KEY]: cleared })
    expect((await db.meta.get(RESCUE_PLAN_KEY))?.value).toBe(cleared)
    // a later stale bundle carrying the older active envelope must NOT resurrect
    await backfillRescueLWW(db, { [RESCUE_PLAN_KEY]: active })
    expect((await db.meta.get(RESCUE_PLAN_KEY))?.value).toBe(cleared)
  })

  it('drops a malformed stored plan envelope so the reader regenerates', async () => {
    await db.meta.put({ key: RESCUE_PLAN_KEY, value: '{was-broken' })
    await backfillRescueLWW(db, { [RESCUE_PLAN_KEY]: '{was-broken' })
    expect(await db.meta.get(RESCUE_PLAN_KEY)).toBeUndefined()
  })

  it('confidence keys merge per-key by latest `at`', async () => {
    const key = rescueConfKey(Date.now(), 'q1')
    await db.meta.put({ key, value: JSON.stringify({ signal: 'sure', at: 100 }) })
    await backfillRescueLWW(db, { [key]: JSON.stringify({ signal: 'guess', at: 200 }) })
    expect((await db.meta.get(key))?.value).toBe(JSON.stringify({ signal: 'guess', at: 200 }))
    // older incoming loses
    await backfillRescueLWW(db, { [key]: JSON.stringify({ signal: 'sure', at: 50 }) })
    expect(JSON.parse((await db.meta.get(key))!.value).signal).toBe('guess')
  })

  it('override keys merge per-key by latest `setAt`', async () => {
    const key = rescueOvrKey(Date.now(), 'c1')
    await db.meta.put({ key, value: JSON.stringify({ setAt: 100, attemptsAtOverride: 4 }) })
    await backfillRescueLWW(db, { [key]: JSON.stringify({ setAt: 200, attemptsAtOverride: 6 }) })
    expect(JSON.parse((await db.meta.get(key))!.value).setAt).toBe(200)
  })

  it('ignores out-of-window conf/ovr keys (a stale bundle cannot resurrect a run)', async () => {
    const stale = rescueConfKey(1_000_000_000_000, 'q1')
    await backfillRescueLWW(db, { [stale]: JSON.stringify({ signal: 'sure', at: 1 }) })
    expect(await db.meta.get(stale)).toBeUndefined()
  })
})

// ── migration (localStorage → synced meta) ────────────────────────────────────
describe('migrateRescueLocalState (one-time, idempotent)', () => {
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
        plan: { familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40, createdAt, lastStudiedAt },
        confidence: { q1: 'sure', q2: 'guess' },
        overrides: { c1: { setAt: lastStudiedAt, attemptsAtOverride: 3 } },
        telemetry: [{ t: 1, kind: 'x' }],
      }),
    )
    localStorage.setItem('neurons:rescue:blitzDone', String(createdAt))
    return { createdAt }
  }

  it('seeds the envelope, confidence, overrides, and blitz marker with a conservative timestamp', async () => {
    const { createdAt } = seedLegacy()
    const lastStudiedAt = createdAt + 30_000
    await migrateRescueLocalState()
    const env = JSON.parse((await db.meta.get(RESCUE_PLAN_KEY))!.value)
    expect(env.updatedAt).toBe(lastStudiedAt) // conservative seed
    expect(env.plan.familyId).toBe('解剖學')
    expect(env.plan.blitzDoneAt).toBe(lastStudiedAt)
    expect(JSON.parse((await db.meta.get(rescueConfKey(createdAt, 'q1')))!.value)).toEqual({
      signal: 'sure',
      at: lastStudiedAt,
    })
    expect(JSON.parse((await db.meta.get(rescueOvrKey(createdAt, 'c1')))!.value)).toEqual({
      setAt: lastStudiedAt,
      attemptsAtOverride: 3,
    })
  })

  it('is idempotent — a second run does not re-seed (marker guard)', async () => {
    const { createdAt } = seedLegacy()
    await migrateRescueLocalState()
    // simulate a later abandon writing an explicit null envelope
    await db.meta.put({ key: RESCUE_PLAN_KEY, value: mkEnv(null, Date.now()) })
    await migrateRescueLocalState() // must NOT resurrect the legacy plan
    expect(JSON.parse((await db.meta.get(RESCUE_PLAN_KEY))!.value).plan).toBeNull()
    // confidence keys are not re-seeded either (still just the originals)
    expect(await db.meta.get(rescueConfKey(createdAt, 'q1'))).toBeDefined()
  })

  it('skips migration when the cloud already holds an envelope (discard local shell)', async () => {
    seedLegacy()
    const cloudEnv = mkEnv(mkPlan({ familyId: '藥理學', createdAt: Date.now() }), Date.now())
    await db.meta.put({ key: RESCUE_PLAN_KEY, value: cloudEnv })
    // clear the marker so migrate actually evaluates the db-envelope guard
    localStorage.removeItem('neurons:rescue:migrated')
    await migrateRescueLocalState()
    expect((await db.meta.get(RESCUE_PLAN_KEY))?.value).toBe(cloudEnv) // untouched
    // nothing was seeded → no explicit push owed to the engine mount
    expect(consumeRescueMigrationPush()).toBe(false)
  })

  it('flags ONE explicit push for the engine mount when it seeds (quick-fix: no lingering plan)', async () => {
    seedLegacy()
    expect(consumeRescueMigrationPush()).toBe(false) // nothing seeded yet
    await migrateRescueLocalState()
    // The boot migration can run before the sync engine attaches its Dexie push
    // hooks — the engine mount consumes this one-shot flag and schedules an
    // explicit push so the migrated plan doesn't wait for an unrelated write.
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

  it('wipes the plan envelope + run-scoped conf/ovr keys but keeps device-local meta', async () => {
    const createdAt = Date.now()
    const rescueKeys = [
      RESCUE_PLAN_KEY,
      rescueConfKey(createdAt, 'q1'),
      rescueOvrKey(createdAt, 'c1'),
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
