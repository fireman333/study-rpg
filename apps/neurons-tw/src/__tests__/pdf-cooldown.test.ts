import { describe, it, expect, beforeEach } from 'vitest'
import { getCooldownUntil, recordThrottleStrike, noteDriveSuccess } from '../platform/pdfCooldown'
import { db } from '../lib/db'

const T0 = 1_000_000_000_000
const M30 = 30 * 60_000
const H2 = 2 * 3_600_000
const H6 = 6 * 3_600_000
const H24 = 24 * 3_600_000

beforeEach(async () => {
  await db.meta.delete('pdfDriveCooldown')
})

describe('pdfCooldown — progressive ladder', () => {
  it('escalates 30m → 2h → 6h → 24h and caps at 24h', async () => {
    expect(await recordThrottleStrike(T0)).toBe(T0 + M30)
    expect(await recordThrottleStrike(T0)).toBe(T0 + H2)
    expect(await recordThrottleStrike(T0)).toBe(T0 + H6)
    expect(await recordThrottleStrike(T0)).toBe(T0 + H24)
    expect(await recordThrottleStrike(T0)).toBe(T0 + H24) // capped
  })

  it('getCooldownUntil is active before expiry, 0 after', async () => {
    await recordThrottleStrike(T0)
    expect(await getCooldownUntil(T0)).toBe(T0 + M30)
    expect(await getCooldownUntil(T0 + M30 + 1)).toBe(0)
  })

  it('no cooldown by default', async () => {
    expect(await getCooldownUntil(T0)).toBe(0)
  })
})

describe('pdfCooldown — success reset', () => {
  it('clears strikes + cooldown after 3 consecutive successes; next strike starts at 30m again', async () => {
    await recordThrottleStrike(T0) // strike 1 → 30m
    await recordThrottleStrike(T0) // strike 2 → 2h
    expect(await getCooldownUntil(T0)).toBe(T0 + H2)

    await noteDriveSuccess(T0)
    await noteDriveSuccess(T0)
    expect(await getCooldownUntil(T0)).toBe(T0 + H2) // 2 successes: not yet reset

    await noteDriveSuccess(T0) // 3rd → full reset
    expect(await getCooldownUntil(T0)).toBe(0)
    expect(await recordThrottleStrike(T0)).toBe(T0 + M30) // strike count reset to 1
  })

  it('noteDriveSuccess is a no-op when there is no cooldown to clear', async () => {
    // steady state (never throttled) → no row written
    await noteDriveSuccess(T0)
    expect(await db.meta.get('pdfDriveCooldown')).toBeUndefined()
  })
})
