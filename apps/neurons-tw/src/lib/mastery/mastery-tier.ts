/**
 * Mastery tier derivation — pure function.
 *
 * Spec: openspec/specs/neuron-family-mastery/spec.md
 *   "Mastery tier SHALL be derived by pure function with count + accuracy
 *    double-gate"
 */

export type MasteryTier = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'none'

const MIN_ATTEMPTS_TO_ASSESS = 5

interface TierGate {
  tier: Exclude<MasteryTier, 'none' | 'P5'>
  minCorrect: number
  minAccuracy: number
}

const TIER_GATES: readonly TierGate[] = [
  { tier: 'P1', minCorrect: 200, minAccuracy: 0.9 },
  { tier: 'P2', minCorrect: 80, minAccuracy: 0.8 },
  { tier: 'P3', minCorrect: 30, minAccuracy: 0.7 },
  { tier: 'P4', minCorrect: 10, minAccuracy: 0.6 },
]

export function deriveMasteryTier(correct: number, total: number): MasteryTier {
  if (total < MIN_ATTEMPTS_TO_ASSESS) return 'none'
  const accuracy = total > 0 ? correct / total : 0
  for (const gate of TIER_GATES) {
    if (correct >= gate.minCorrect && accuracy >= gate.minAccuracy) {
      return gate.tier
    }
  }
  return 'P5'
}

export const TIER_LABELS: Record<MasteryTier, string> = {
  P1: 'P1 大師',
  P2: 'P2 專精',
  P3: 'P3 熟練',
  P4: 'P4 入門',
  P5: 'P5 新手',
  none: '—',
}

export const TIER_COLORS: Record<MasteryTier, string> = {
  P1: '#d4a04d', // gold (DA)
  P2: '#9b6dd9', // purple
  P3: '#6a9bc4', // blue (GABA)
  P4: '#6a8c3f', // green (Glu)
  P5: '#8c6d4a', // brown
  none: '#9b9b9b', // muted grey
}

/**
 * Mastery → energy-acquisition multiplier (wire-mastery-energy-acceleration).
 *
 * The 精通軸 (mastery axis) accelerates the 能量軸: a practiced family yields energy
 * faster per correct answer (Hebbian consolidation). Single source of truth —
 * consumed by both correct-answer energy faucets (connectome.recordCorrectAnswer)
 * and the MasteryChip display.
 *
 * First-cut, dogfood-tunable. Monotonic non-decreasing none/P5 → P1; never < 1.0.
 * Spec: openspec/specs/neuron-family-mastery/spec.md
 *   "Mastery tier SHALL accelerate energy acquisition via a pure multiplier function"
 */
const MASTERY_ENERGY_MULTIPLIER: Record<MasteryTier, number> = {
  none: 1.0,
  P5: 1.0,
  P4: 1.05,
  P3: 1.1,
  P2: 1.2,
  P1: 1.3,
}

export function masteryEnergyMultiplier(tier: MasteryTier): number {
  return MASTERY_ENERGY_MULTIPLIER[tier]
}

/** Apply a mastery multiplier to an integer energy base (gacha-energy faucet). */
export function applyMasteryToEnergy(base: number, mult: number): number {
  return Math.round(base * mult)
}
