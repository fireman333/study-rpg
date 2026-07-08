import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  startRescue,
  getActivePlan,
  abandonRescue,
  archiveIfDue,
  touchLastStudied,
  recordConfidence,
  getConfidence,
  setOverride,
  getOverride,
  markBlitzDone,
  isBlitzDone,
  appendTelemetry,
  exportTelemetry,
  __resetRescueStoreForTests,
} from '../lib/services/rescue/rescue-store'

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

describe('rescue store lifecycle (synced envelope)', () => {
  it('starts a plan (mirror is synchronous)', () => {
    const r = startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    expect(r.ok).toBe(true)
    const plan = getActivePlan()
    expect(plan?.familyId).toBe('解剖學')
    expect(plan?.dailyMinutes).toBe(40)
  })

  it('enforces one-at-a-time account-wide: a different family needs confirm to replace', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    const blocked = startRescue({ familyId: '生理學', examDate: '2026-07-12', dailyMinutes: 30 })
    expect(blocked.ok).toBe(false)
    expect(getActivePlan()?.familyId).toBe('解剖學') // unchanged
    const replaced = startRescue({ familyId: '生理學', examDate: '2026-07-12', dailyMinutes: 30 }, { replace: true })
    expect(replaced.ok).toBe(true)
    expect(getActivePlan()?.familyId).toBe('生理學')
  })

  it('re-starting the SAME family RESUMES the live run — no fresh createdAt (review-B1)', () => {
    const first = startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    const createdAt = (first as { plan: { createdAt: number } }).plan.createdAt
    recordConfidence('q1', 'sure')
    markBlitzDone(createdAt)
    const again = startRescue({ familyId: '解剖學', examDate: '2026-07-11', dailyMinutes: 50 })
    expect(again.ok).toBe(true)
    expect((again as { resumed?: boolean }).resumed).toBe(true)
    // The run is CONTINUED, not silently restarted: identity, settings, blitz
    // marker, and run-scoped confidence all survive (an accidental fresh
    // createdAt would LWW-clobber the cloud run account-wide).
    const plan = getActivePlan()!
    expect(plan.createdAt).toBe(createdAt)
    expect(plan.examDate).toBe('2026-07-10')
    expect(plan.dailyMinutes).toBe(40)
    expect(isBlitzDone(createdAt)).toBe(true)
    expect(getConfidence('q1')).toBe('sure')
  })

  it('an EXPLICIT same-family replace still mints a fresh run', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const first = startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    const c1 = (first as { plan: { createdAt: number } }).plan.createdAt
    vi.setSystemTime(1_800_000_060_000) // +60s → distinct createdAt
    const again = startRescue(
      { familyId: '解剖學', examDate: '2026-07-12', dailyMinutes: 50 },
      { replace: true },
    )
    expect(again.ok).toBe(true)
    expect((again as { resumed?: boolean }).resumed).toBeUndefined()
    expect(getActivePlan()?.createdAt).not.toBe(c1)
    expect(getActivePlan()?.dailyMinutes).toBe(50)
    vi.useRealTimers()
  })

  it('abandon writes an explicit null envelope and clears the active plan', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    recordConfidence('q1', 'sure')
    abandonRescue()
    expect(getActivePlan()).toBeNull()
    // confidence read with no active plan → undefined
    expect(getConfidence('q1')).toBeUndefined()
  })

  it('archiveIfDue archives at examDate+1, not on the exam day', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    expect(archiveIfDue('2026-07-10')).toBe(false) // exam day
    expect(getActivePlan()).not.toBeNull()
    expect(archiveIfDue('2026-07-11')).toBe(true) // day after
    expect(getActivePlan()).toBeNull()
  })

  it('touchLastStudied bumps lastStudiedAt on the active plan', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    const before = getActivePlan()!.lastStudiedAt
    touchLastStudied(before + 5000)
    expect(getActivePlan()!.lastStudiedAt).toBe(before + 5000)
  })
})

describe('rescue store per-run state (run-scoped)', () => {
  it('records + reads pre-reveal confidence for the active run', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    recordConfidence('q1', 'sure')
    recordConfidence('q2', 'guess')
    expect(getConfidence('q1')).toBe('sure')
    expect(getConfidence('q2')).toBe('guess')
  })

  it('starting a NEW run re-scopes confidence without deletes', () => {
    // Fake clock so the replacement plan gets a strictly-later createdAt (a real
    // replace is seconds apart; back-to-back synchronous starts would collide on ms).
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    recordConfidence('q1', 'sure')
    expect(getConfidence('q1')).toBe('sure')
    vi.setSystemTime(1_800_000_060_000) // +60s → fresh createdAt
    startRescue({ familyId: '生理學', examDate: '2026-07-12', dailyMinutes: 30 }, { replace: true })
    expect(getConfidence('q1')).toBeUndefined() // previous run's key ignored by readers
    vi.useRealTimers()
  })

  it('a re-tap overwrites the earlier signal (latest wins locally)', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    recordConfidence('q1', 'sure')
    recordConfidence('q1', 'guess')
    expect(getConfidence('q1')).toBe('guess')
  })

  it('sets / reads override flags for the active run', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    setOverride('c-hard', { setAt: 1000, attemptsAtOverride: 4 })
    expect(getOverride('c-hard')).toEqual({ setAt: 1000, attemptsAtOverride: 4 })
  })

  it('override without an active plan is a no-op (run-scoped)', () => {
    setOverride('c-hard', { setAt: 1000, attemptsAtOverride: 4 })
    expect(getOverride('c-hard')).toBeUndefined()
  })
})

describe('rescue blitz marker (rides the envelope)', () => {
  it('marks blitz done on the active plan and reads it back', () => {
    const r = startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    const createdAt = (r as { plan: { createdAt: number } }).plan.createdAt
    expect(isBlitzDone(createdAt)).toBe(false)
    markBlitzDone(createdAt)
    expect(isBlitzDone(createdAt)).toBe(true)
  })

  it('replacing the plan re-arms the blitz (new createdAt, blitzDoneAt absent)', () => {
    const r1 = startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    const c1 = (r1 as { plan: { createdAt: number } }).plan.createdAt
    markBlitzDone(c1)
    expect(isBlitzDone(c1)).toBe(true)
    const r2 = startRescue({ familyId: '生理學', examDate: '2026-07-12', dailyMinutes: 30 }, { replace: true })
    const c2 = (r2 as { plan: { createdAt: number } }).plan.createdAt
    expect(isBlitzDone(c2)).toBe(false) // re-armed
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
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    expect(JSON.parse(exportTelemetry())).toHaveLength(1) // kept across plan start
  })
})
