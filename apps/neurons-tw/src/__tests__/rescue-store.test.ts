import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  startRescue,
  getActivePlan,
  getActivePlans,
  abandonRescue,
  archiveIfDue,
  touchLastStudied,
  editRescuePlan,
  recordConfidence,
  getConfidence,
  setOverride,
  getOverride,
  markBlitzDone,
  isBlitzDone,
  deferBlitzDone,
  deferTouchLastStudied,
  flushPendingRescueLifecycle,
  hasPendingRescueLifecycle,
  appendTelemetry,
  exportTelemetry,
  __resetRescueStoreForTests,
} from '../lib/services/rescue/rescue-store'

// add-neurons-multi-subject-rescue — the store now mirrors PER-FAMILY plan
// envelopes; every read/write carries a familyId, and multiple families coexist.

const ANAT = '解剖學'
const PHYS = '生理學'

function stubLocalStorage(): void {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  })
}

beforeEach(async () => {
  stubLocalStorage()
  await __resetRescueStoreForTests()
})
afterEach(() => {
  // A test that fails mid-body must not leak fake timers into the next hook
  // (which awaits real-timer db microtasks → would hang the beforeEach).
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('rescue store lifecycle (per-family envelope)', () => {
  it('starts a plan (mirror is synchronous)', () => {
    const r = startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    expect(r.ok).toBe(true)
    const plan = getActivePlan(ANAT)
    expect(plan?.familyId).toBe(ANAT)
    expect(plan?.dailyMinutes).toBe(40)
  })

  it('starting a DIFFERENT family coexists — no replace gate', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const second = startRescue({ familyId: PHYS, examDate: '2026-07-12', dailyMinutes: 30 })
    expect(second.ok).toBe(true)
    expect(getActivePlan(ANAT)?.familyId).toBe(ANAT) // still active
    expect(getActivePlan(PHYS)?.familyId).toBe(PHYS)
    expect(getActivePlans().map((p) => p.familyId).sort()).toEqual([ANAT, PHYS].sort())
  })

  it('re-starting the SAME family RESUMES the live run — no fresh createdAt (review-B1)', () => {
    const first = startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const createdAt = (first as { plan: { createdAt: number } }).plan.createdAt
    recordConfidence(ANAT, createdAt, 'q1', 'sure')
    markBlitzDone(ANAT, createdAt)
    const again = startRescue({ familyId: ANAT, examDate: '2026-07-11', dailyMinutes: 50 })
    expect(again.ok).toBe(true)
    expect((again as { resumed?: boolean }).resumed).toBe(true)
    // The run is CONTINUED, not silently restarted: identity, settings, blitz
    // marker, and run-scoped confidence all survive (an accidental fresh
    // createdAt would LWW-clobber the cloud run for that family).
    const plan = getActivePlan(ANAT)!
    expect(plan.createdAt).toBe(createdAt)
    expect(plan.examDate).toBe('2026-07-10')
    expect(plan.dailyMinutes).toBe(40)
    expect(isBlitzDone(ANAT, createdAt)).toBe(true)
    expect(getConfidence(ANAT, 'q1')).toBe('sure')
  })

  it('an EXPLICIT same-family replace still mints a fresh run', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const first = startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const c1 = (first as { plan: { createdAt: number } }).plan.createdAt
    vi.setSystemTime(1_800_000_060_000) // +60s → distinct createdAt
    const again = startRescue(
      { familyId: ANAT, examDate: '2026-07-12', dailyMinutes: 50 },
      { replace: true },
    )
    expect(again.ok).toBe(true)
    expect((again as { resumed?: boolean }).resumed).toBeUndefined()
    expect(getActivePlan(ANAT)?.createdAt).not.toBe(c1)
    expect(getActivePlan(ANAT)?.dailyMinutes).toBe(50)
    vi.useRealTimers()
  })

  it('abandon writes an explicit null envelope and clears only that family', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    startRescue({ familyId: PHYS, examDate: '2026-07-12', dailyMinutes: 30 })
    recordConfidence(ANAT, getActivePlan(ANAT)!.createdAt, 'q1', 'sure')
    abandonRescue(ANAT)
    expect(getActivePlan(ANAT)).toBeNull()
    expect(getActivePlan(PHYS)).not.toBeNull() // sibling untouched
    // confidence read with no active plan → undefined
    expect(getConfidence(ANAT, 'q1')).toBeUndefined()
  })

  it('archiveIfDue archives every plan at examDate+1, not on the exam day', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    startRescue({ familyId: PHYS, examDate: '2026-07-20', dailyMinutes: 40 })
    expect(archiveIfDue('2026-07-10')).toBe(false) // ANAT exam day, PHYS future
    expect(getActivePlan(ANAT)).not.toBeNull()
    expect(archiveIfDue('2026-07-11')).toBe(true) // day after ANAT
    expect(getActivePlan(ANAT)).toBeNull()
    expect(getActivePlan(PHYS)).not.toBeNull() // future plan untouched
  })

  it('touchLastStudied bumps lastStudiedAt on the given family', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const before = getActivePlan(ANAT)!.lastStudiedAt
    touchLastStudied(ANAT, before + 5000)
    expect(getActivePlan(ANAT)!.lastStudiedAt).toBe(before + 5000)
  })

  it('editRescuePlan rewrites examDate/minutes in place (createdAt preserved)', () => {
    const started = startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const createdAt = (started as { plan: { createdAt: number } }).plan.createdAt
    editRescuePlan(ANAT, { examDate: '2026-07-17', dailyMinutes: 55 })
    const plan = getActivePlan(ANAT)!
    expect(plan.examDate).toBe('2026-07-17')
    expect(plan.dailyMinutes).toBe(55)
    expect(plan.createdAt).toBe(createdAt)
  })
})

describe('rescue store per-run state (run-scoped, per-family)', () => {
  it('records + reads pre-reveal confidence for the active run', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const cA = getActivePlan(ANAT)!.createdAt
    recordConfidence(ANAT, cA, 'q1', 'sure')
    recordConfidence(ANAT, cA, 'q2', 'guess')
    expect(getConfidence(ANAT, 'q1')).toBe('sure')
    expect(getConfidence(ANAT, 'q2')).toBe('guess')
  })

  it('starting a NEW run re-scopes confidence without deletes', () => {
    // Fake clock so the replacement plan gets a strictly-later createdAt.
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    recordConfidence(ANAT, getActivePlan(ANAT)!.createdAt, 'q1', 'sure')
    expect(getConfidence(ANAT, 'q1')).toBe('sure')
    vi.setSystemTime(1_800_000_060_000) // +60s → fresh createdAt
    startRescue({ familyId: ANAT, examDate: '2026-07-12', dailyMinutes: 30 }, { replace: true })
    expect(getConfidence(ANAT, 'q1')).toBeUndefined() // previous run's key ignored by readers
    vi.useRealTimers()
  })

  it('confidence keys for two coexisting families do not collide', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    startRescue({ familyId: PHYS, examDate: '2026-07-12', dailyMinutes: 30 })
    recordConfidence(ANAT, getActivePlan(ANAT)!.createdAt, 'q1', 'sure')
    recordConfidence(PHYS, getActivePlan(PHYS)!.createdAt, 'q1', 'guess')
    expect(getConfidence(ANAT, 'q1')).toBe('sure')
    expect(getConfidence(PHYS, 'q1')).toBe('guess') // same qid, different family
  })

  it('a re-tap overwrites the earlier signal (latest wins locally)', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const cRT = getActivePlan(ANAT)!.createdAt
    recordConfidence(ANAT, cRT, 'q1', 'sure')
    recordConfidence(ANAT, cRT, 'q1', 'guess')
    expect(getConfidence(ANAT, 'q1')).toBe('guess')
  })

  it('sets / reads override flags for the active run', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    setOverride(ANAT, 'c-hard', { setAt: 1000, attemptsAtOverride: 4 })
    expect(getOverride(ANAT, 'c-hard')).toEqual({ setAt: 1000, attemptsAtOverride: 4 })
  })

  it('override on a shared concept affects only the intended family', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    startRescue({ familyId: PHYS, examDate: '2026-07-12', dailyMinutes: 30 })
    setOverride(ANAT, 'membrane-transport', { setAt: 1000, attemptsAtOverride: 4 })
    expect(getOverride(ANAT, 'membrane-transport')).toBeDefined()
    expect(getOverride(PHYS, 'membrane-transport')).toBeUndefined() // sibling unaffected
  })

  it('override without an active plan is a no-op (run-scoped)', () => {
    setOverride(ANAT, 'c-hard', { setAt: 1000, attemptsAtOverride: 4 })
    expect(getOverride(ANAT, 'c-hard')).toBeUndefined()
  })

  it('recordConfidence no-ops when the explicit run createdAt no longer matches (replaced / abandoned)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const first = startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const oldCreatedAt = (first as { plan: { createdAt: number } }).plan.createdAt
    // A tap carrying the OPENING run createdAt lands while that run is still active.
    recordConfidence(ANAT, oldCreatedAt, 'q1', 'sure')
    expect(getConfidence(ANAT, 'q1')).toBe('sure')
    // The plan is sync-replaced mid-session (a new run, new createdAt).
    vi.setSystemTime(1_800_000_060_000)
    startRescue({ familyId: ANAT, examDate: '2026-07-12', dailyMinutes: 30 }, { replace: true })
    // A late tap still carrying the OLD run createdAt must NOT record under the new run.
    recordConfidence(ANAT, oldCreatedAt, 'q2', 'guess')
    expect(getConfidence(ANAT, 'q2')).toBeUndefined()
    vi.useRealTimers()
  })
})

describe('rescue blitz marker (rides each family envelope)', () => {
  it('marks blitz done on the active plan and reads it back', () => {
    const r = startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const createdAt = (r as { plan: { createdAt: number } }).plan.createdAt
    expect(isBlitzDone(ANAT, createdAt)).toBe(false)
    markBlitzDone(ANAT, createdAt)
    expect(isBlitzDone(ANAT, createdAt)).toBe(true)
  })

  it('replacing the plan re-arms the blitz (new createdAt, blitzDoneAt absent)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const r1 = startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const c1 = (r1 as { plan: { createdAt: number } }).plan.createdAt
    markBlitzDone(ANAT, c1)
    expect(isBlitzDone(ANAT, c1)).toBe(true)
    vi.setSystemTime(1_800_000_060_000)
    const r2 = startRescue({ familyId: ANAT, examDate: '2026-07-12', dailyMinutes: 30 }, { replace: true })
    const c2 = (r2 as { plan: { createdAt: number } }).plan.createdAt
    expect(isBlitzDone(ANAT, c2)).toBe(false) // re-armed
    vi.useRealTimers()
  })
})

describe('deferred lifecycle writes (startup-pull gate, module-level — survives unmount)', () => {
  it('a deferred blitz completion flushes onto the still-active run', () => {
    const r = startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const createdAt = (r as { plan: { createdAt: number } }).plan.createdAt
    deferBlitzDone(ANAT, createdAt)
    expect(hasPendingRescueLifecycle()).toBe(true)
    expect(isBlitzDone(ANAT, createdAt)).toBe(false) // held while gated
    flushPendingRescueLifecycle()
    expect(hasPendingRescueLifecycle()).toBe(false)
    expect(isBlitzDone(ANAT, createdAt)).toBe(true) // written once the gate cleared
  })

  it('a deferred blitz completion does NOT resurrect a replaced run', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const r = startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const oldCreatedAt = (r as { plan: { createdAt: number } }).plan.createdAt
    deferBlitzDone(ANAT, oldCreatedAt)
    vi.setSystemTime(1_800_000_060_000)
    const r2 = startRescue({ familyId: ANAT, examDate: '2026-07-12', dailyMinutes: 30 }, { replace: true })
    const newCreatedAt = (r2 as { plan: { createdAt: number } }).plan.createdAt
    flushPendingRescueLifecycle()
    expect(isBlitzDone(ANAT, newCreatedAt)).toBe(false) // stale createdAt must not mark the fresh run
    vi.useRealTimers()
  })

  it('a deferred study-touch flushes onto a still-active plan and no-ops on an abandoned one', () => {
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    const before = getActivePlan(ANAT)!.lastStudiedAt
    deferTouchLastStudied(ANAT)
    deferTouchLastStudied(PHYS) // no plan for PHYS → flush is a safe no-op
    expect(hasPendingRescueLifecycle()).toBe(true)
    flushPendingRescueLifecycle()
    expect(hasPendingRescueLifecycle()).toBe(false)
    expect(getActivePlan(ANAT)!.lastStudiedAt).toBeGreaterThanOrEqual(before)
    expect(getActivePlan(PHYS)).toBeNull()
  })

  it('flush is idempotent — a no-op when nothing is pending', () => {
    expect(hasPendingRescueLifecycle()).toBe(false)
    flushPendingRescueLifecycle() // must not throw
    expect(hasPendingRescueLifecycle()).toBe(false)
  })
})

describe('rescue telemetry (thin, exportable, device-local)', () => {
  it('appends and exports flat JSON', () => {
    appendTelemetry({ kind: 'confidence-tap', questionId: 'q1', value: 'sure', t: 1 })
    appendTelemetry({ kind: 'priority-selected', questionId: 'q1', t: 2 })
    const dump = JSON.parse(exportTelemetry())
    expect(dump).toHaveLength(2)
    expect(dump[0]).toMatchObject({ kind: 'confidence-tap', questionId: 'q1', value: 'sure' })
  })

  it('survives a plan start (append-only across plans)', () => {
    appendTelemetry({ kind: 'diagnostic-answered', t: 1 })
    startRescue({ familyId: ANAT, examDate: '2026-07-10', dailyMinutes: 40 })
    expect(JSON.parse(exportTelemetry())).toHaveLength(1) // kept across plan start
  })
})
