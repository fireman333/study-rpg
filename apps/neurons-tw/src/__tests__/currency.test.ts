import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  awardEnergy,
  awardEnergyInTx,
  spendEnergyInTx,
  readBalance,
  readEarned,
  readSpent,
} from '../lib/services/currency'

/**
 * Collection 2.0 neural-energy currency. Balance = earned − spent (derived,
 * never negative). Earn/spend are monotonic meta counters.
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('neural-energy currency', () => {
  it('starts at zero when no keys exist', async () => {
    expect(await readEarned()).toBe(0)
    expect(await readSpent()).toBe(0)
    expect(await readBalance()).toBe(0)
  })

  it('awardEnergy raises earned and balance', async () => {
    await awardEnergy(10)
    expect(await readEarned()).toBe(10)
    expect(await readBalance()).toBe(10)
  })

  it('balance = earned − spent', async () => {
    await awardEnergy(50)
    await db.transaction('rw', db.meta, () => spendEnergyInTx(20))
    expect(await readSpent()).toBe(20)
    expect(await readBalance()).toBe(30)
  })

  it('awardEnergyInTx joins an existing transaction', async () => {
    await db.transaction('rw', db.meta, () => awardEnergyInTx(7))
    expect(await readEarned()).toBe(7)
  })

  it('balance never goes negative', async () => {
    await db.transaction('rw', db.meta, () => spendEnergyInTx(100))
    expect(await readBalance()).toBe(0)
  })

  it('ignores non-positive amounts', async () => {
    await awardEnergy(0)
    await awardEnergy(-5)
    expect(await readEarned()).toBe(0)
  })
})
