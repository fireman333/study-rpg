import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, todayISO } from '../lib/db'
import {
  recordSynapseWire,
  hasPreTodayWrongBasis,
  type PrescriptionPlan,
} from '../lib/services/prescription'
import {
  initializePrescriptionWireListener,
  armPrescriptionWireCredit,
  __resetPrescriptionWireForTests,
  PRESCRIPTION_WIRE_EVENTS,
} from '../lib/services/prescription-wire'
import { events as connectomeEvents } from '../lib/services/connectome'
import {
  buildBundleSnapshot,
  applyBundleSnapshot,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'

const WIRE = (pairKey: string) => `prescription:v1:wire:${todayISO()}:${pairKey}`

async function wireCount(): Promise<number> {
  return db.meta.where('key').startsWith(`prescription:v1:wire:${todayISO()}:`).count()
}

/** Poll until the async listener writes settle (or time out). */
async function waitFor(cond: () => Promise<boolean>, ms = 1500): Promise<void> {
  const start = Date.now()
  for (;;) {
    if (await cond()) return
    if (Date.now() - start > ms) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

async function putPlan(over: Partial<PrescriptionPlan> = {}): Promise<void> {
  const plan: PrescriptionPlan = {
    date: todayISO(),
    createdAt: 1,
    seed: 's',
    wrongTarget: 1,
    breadthTarget: 0,
    breadthFamilyId: 'phys',
    breadthFamilyLabel: '生理',
    wrongEligibleQuestionIds: ['w1', 'w2'],
    breadthEligibleQuestionIds: [],
    yearScope: null,
    ...over,
  }
  await db.meta.put({ key: `prescription:v1:plan:${plan.date}`, value: JSON.stringify(plan) })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  __resetPrescriptionWireForTests()
})

// ── 6.6 pins ──────────────────────────────────────────────────────────────────

describe('wire listener event pins', () => {
  it('subscribes exactly connectome.synapseFormed / connectome.synapseStrengthened', () => {
    // Literal pin — a rename on the emitter side must break HERE, visibly,
    // instead of silently un-wiring the T3/T4 objectives.
    expect(PRESCRIPTION_WIRE_EVENTS).toEqual([
      'connectome.synapseFormed',
      'connectome.synapseStrengthened',
    ])
  })
})

// ── 6.3 wire-key dedup + UNION ────────────────────────────────────────────────

describe('wire keys (write-once per pair per day)', () => {
  it('formed + strengthened same pair same day → ONE wire key', async () => {
    await recordSynapseWire('生理學|藥理學') // formed
    await recordSynapseWire('生理學|藥理學') // strengthened later the same day
    expect(await wireCount()).toBe(1)
    expect((await db.meta.get(WIRE('生理學|藥理學')))?.value).toBe('1')
  })

  it('two distinct pairs → 2 wire keys', async () => {
    await recordSynapseWire('生理學|藥理學')
    await recordSynapseWire('微生物學|藥理學')
    expect(await wireCount()).toBe(2)
  })

  it('cross-device UNION via snapshot→apply round-trip', async () => {
    await db.meta.put({ key: WIRE('生理學|藥理學'), value: '1' })
    const bundle = await buildBundleSnapshot(db)
    const metaRows = bundle.data.meta as Array<{ key: string; value: string }>
    expect(metaRows.some((r) => r.key === WIRE('生理學|藥理學'))).toBe(true)
    // Fresh device state with a DIFFERENT pair recorded locally.
    await db.delete()
    await db.open()
    await db.meta.put({ key: WIRE('微生物學|生化學'), value: '1' })
    const incoming: BundleSnapshot = {
      meta: { schema_version: 26, updated_at: 'x', client_id: 'c', app_version: '0.4.0' },
      data: { meta: metaRows },
    }
    await applyBundleSnapshot(db, incoming)
    // UNION: both pairs count → enough for T4's ≥2-synapse condition either side.
    expect(await wireCount()).toBe(2)
  })
})

// ── listener registration + anti-farm arming ──────────────────────────────────

describe('prescription wire listener (boot registration + anti-farm gate)', () => {
  it('armed listener writes a wire key off the real emitter (both event names)', async () => {
    initializePrescriptionWireListener()
    initializePrescriptionWireListener() // StrictMode double-mount: idempotent
    armPrescriptionWireCredit(true)
    connectomeEvents.emit('connectome.synapseFormed', {
      pairKey: '生理學|藥理學',
      state: 'dormant',
    })
    await waitFor(async () => (await wireCount()) === 1)
    connectomeEvents.emit('connectome.synapseStrengthened', {
      pairKey: '微生物學|藥理學',
      fromState: 'weak',
      toState: 'strong',
    })
    await waitFor(async () => (await wireCount()) === 2)
    // same pair strengthening again → still write-once
    connectomeEvents.emit('connectome.synapseStrengthened', {
      pairKey: '生理學|藥理學',
      fromState: 'weak',
      toState: 'strong',
    })
    await new Promise((r) => setTimeout(r, 60))
    expect(await wireCount()).toBe(2)
    armPrescriptionWireCredit(false)
  })

  it('unarmed listener mints NO tier-countable wire key (anti-farm)', async () => {
    initializePrescriptionWireListener()
    armPrescriptionWireCredit(false)
    connectomeEvents.emit('connectome.synapseFormed', {
      pairKey: '生理學|藥理學',
      state: 'dormant',
    })
    await new Promise((r) => setTimeout(r, 60))
    expect(await wireCount()).toBe(0)
  })
})

// ── anti-farm basis (settlement-hook intersection) ────────────────────────────

describe('hasPreTodayWrongBasis', () => {
  it('true only when the counted repairs intersect the frozen wrong snapshot', async () => {
    await putPlan({ wrongEligibleQuestionIds: ['w1', 'w2'] })
    expect(await hasPreTodayWrongBasis(['w2', 'freshX'])).toBe(true)
    // deliberately failing fresh questions today then repairing them → no basis
    expect(await hasPreTodayWrongBasis(['freshX', 'freshY'])).toBe(false)
    expect(await hasPreTodayWrongBasis([])).toBe(false)
  })

  it('false with no plan today', async () => {
    expect(await hasPreTodayWrongBasis(['w1'])).toBe(false)
  })
})
