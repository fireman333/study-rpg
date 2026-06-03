import { describe, it, expect } from 'vitest'
import { masteryEnergyMultiplier, applyMasteryToEnergy, type MasteryTier } from '../lib/mastery'

/**
 * wire-mastery-energy-acceleration — pure multiplier function.
 * Spec: neuron-family-mastery "Mastery tier SHALL accelerate energy acquisition
 * via a pure multiplier function".
 */

const TIERS: MasteryTier[] = ['none', 'P5', 'P4', 'P3', 'P2', 'P1']

describe('masteryEnergyMultiplier', () => {
  it('returns the first-cut value for each tier', () => {
    expect(masteryEnergyMultiplier('none')).toBe(1.0)
    expect(masteryEnergyMultiplier('P5')).toBe(1.0)
    expect(masteryEnergyMultiplier('P4')).toBe(1.05)
    expect(masteryEnergyMultiplier('P3')).toBe(1.1)
    expect(masteryEnergyMultiplier('P2')).toBe(1.2)
    expect(masteryEnergyMultiplier('P1')).toBe(1.3)
  })

  it('is never below 1.0', () => {
    for (const t of TIERS) expect(masteryEnergyMultiplier(t)).toBeGreaterThanOrEqual(1.0)
  })

  it('is monotonic non-decreasing none/P5 → P1', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(masteryEnergyMultiplier(TIERS[i])).toBeGreaterThanOrEqual(
        masteryEnergyMultiplier(TIERS[i - 1]),
      )
    }
  })
})

describe('applyMasteryToEnergy (integer gacha-energy faucet, base 3 — design D3)', () => {
  it('rounds base × mult to an integer', () => {
    expect(applyMasteryToEnergy(3, 1.0)).toBe(3)
    expect(applyMasteryToEnergy(3, 1.05)).toBe(3) // 3.15 → 3 (quantized)
    expect(applyMasteryToEnergy(3, 1.1)).toBe(3) // 3.30 → 3 (quantized)
    expect(applyMasteryToEnergy(3, 1.2)).toBe(4) // 3.60 → 4
    expect(applyMasteryToEnergy(3, 1.3)).toBe(4) // 3.90 → 4
  })
})
