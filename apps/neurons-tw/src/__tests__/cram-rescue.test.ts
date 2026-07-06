import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  recordCramRescueAnswer,
  getPrescriptionStatus,
  deriveStatus,
  CRAM_RESCUE_TARGET,
} from '../lib/services/prescription'

describe('考前救援 bonus (cram rescue)', () => {
  beforeEach(async () => {
    await db.meta.clear()
  })

  it('CRAM_RESCUE_TARGET is 1 (dogfood default)', () => {
    expect(CRAM_RESCUE_TARGET).toBe(1)
  })

  it('cramRescueDone is false with no cram-practice answers today', async () => {
    const s = await getPrescriptionStatus()
    expect(s.cramRescueDone).toBe(false)
  })

  it('one cram-practice answer flips cramRescueDone to true', async () => {
    await recordCramRescueAnswer('q1')
    const s = await getPrescriptionStatus()
    expect(s.cramRescueDone).toBe(true)
  })

  it('is write-once per question (same qid twice does not double-count)', async () => {
    await recordCramRescueAnswer('q1')
    await recordCramRescueAnswer('q1')
    const rows = await db.meta.where('key').startsWith('prescription:v1:cramRescue:').count()
    expect(rows).toBe(1)
  })

  it('deriveStatus carries cramRescueDone (default false, explicit true)', () => {
    expect(deriveStatus(null, 0, 0, 0).cramRescueDone).toBe(false)
    expect(deriveStatus(null, 0, 0, 0, true).cramRescueDone).toBe(true)
  })
})
