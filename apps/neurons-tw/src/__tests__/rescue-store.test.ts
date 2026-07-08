import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  startRescue,
  getActivePlan,
  abandonRescue,
  archiveIfDue,
  recordConfidence,
  getConfidence,
  setOverride,
  getOverride,
  clearOverride,
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

beforeEach(() => {
  stubLocalStorage()
  __resetRescueStoreForTests()
})

describe('rescue store lifecycle', () => {
  it('starts a device-local plan', () => {
    const r = startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    expect(r.ok).toBe(true)
    const plan = getActivePlan()
    expect(plan?.familyId).toBe('解剖學')
    expect(plan?.dailyMinutes).toBe(40)
  })

  it('enforces one-at-a-time: a different family needs confirm to replace', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    const blocked = startRescue({ familyId: '生理學', examDate: '2026-07-12', dailyMinutes: 30 })
    expect(blocked.ok).toBe(false)
    expect(getActivePlan()?.familyId).toBe('解剖學') // unchanged
    const replaced = startRescue({ familyId: '生理學', examDate: '2026-07-12', dailyMinutes: 30 }, { replace: true })
    expect(replaced.ok).toBe(true)
    expect(getActivePlan()?.familyId).toBe('生理學')
  })

  it('re-starting the SAME family does not need confirm', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    const again = startRescue({ familyId: '解剖學', examDate: '2026-07-11', dailyMinutes: 50 })
    expect(again.ok).toBe(true)
    expect(getActivePlan()?.dailyMinutes).toBe(50)
  })

  it('abandon clears the plan and per-run state', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    recordConfidence('q1', 'sure')
    abandonRescue()
    expect(getActivePlan()).toBeNull()
    expect(getConfidence('q1')).toBeUndefined()
  })

  it('archiveIfDue archives at examDate+1, not on the exam day', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    expect(archiveIfDue('2026-07-10')).toBe(false) // exam day
    expect(getActivePlan()).not.toBeNull()
    expect(archiveIfDue('2026-07-11')).toBe(true) // day after
    expect(getActivePlan()).toBeNull()
  })
})

describe('rescue store per-run state', () => {
  it('records + reads pre-reveal confidence', () => {
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    recordConfidence('q1', 'sure')
    recordConfidence('q2', 'guess')
    expect(getConfidence('q1')).toBe('sure')
    expect(getConfidence('q2')).toBe('guess')
  })

  it('sets / reads / clears override flags', () => {
    setOverride('c-hard', { setAt: 1000, attemptsAtOverride: 4 })
    expect(getOverride('c-hard')).toEqual({ setAt: 1000, attemptsAtOverride: 4 })
    clearOverride('c-hard')
    expect(getOverride('c-hard')).toBeUndefined()
  })
})

describe('rescue telemetry (thin, exportable)', () => {
  it('appends and exports flat JSON', () => {
    appendTelemetry({ kind: 'confidence-tap', questionId: 'q1', value: 'sure', t: 1 })
    appendTelemetry({ kind: 'priority-selected', questionId: 'q1', t: 2 })
    const dump = JSON.parse(exportTelemetry())
    expect(dump).toHaveLength(2)
    expect(dump[0]).toMatchObject({ kind: 'confidence-tap', questionId: 'q1', value: 'sure' })
  })

  it('survives a plan start (append-only across plans) but caps growth', () => {
    appendTelemetry({ kind: 'diagnostic-answered', t: 1 })
    startRescue({ familyId: '解剖學', examDate: '2026-07-10', dailyMinutes: 40 })
    expect(JSON.parse(exportTelemetry())).toHaveLength(1) // kept across plan start
  })
})
