/**
 * Doctor training mechanic for the 二階 medexam2 content pack.
 *
 * Locked by `redesign-hospital-economy` (2026-05-17) — cost / success rate /
 * pity threshold are LITERALS per design D4. Failure preserves rarity (no
 * downgrade); pity counter is per-doctor and persistent across game sessions.
 *
 * `attemptTraining` is a PURE function: it takes the current doctor state +
 * RNG provider + revenue and returns the desired next state. Persistence and
 * IndexedDB writes happen in the app layer.
 */

import type { Rarity } from './recruitment'
import { RARITY_POWER_MULTIPLIER } from './recruitment'

/** Rarities that can be the source of a training attempt (P1 is terminal). */
export type TrainableRarity = Exclude<Rarity, 'P1'>

/** Revenue cost per upgrade path. */
export const TRAINING_COSTS: Record<TrainableRarity, number> = {
  P5: 1_000,
  P4: 5_000,
  P3: 25_000,
  P2: 125_000,
}

/** Base success rate per upgrade path (RNG roll target). */
export const TRAINING_BASE_SUCCESS_RATES: Record<TrainableRarity, number> = {
  P5: 0.5,
  P4: 0.3,
  P3: 0.15,
  P2: 0.05,
}

/**
 * Pity threshold per doctor. Once `pityCounter >= TRAINING_PITY_THRESHOLD`
 * (i.e., 5 consecutive failures), the next attempt deterministically succeeds.
 * Pity is per-doctor and does NOT reset across upgrade levels — see spec
 * `doctor-training` Req 3.
 */
export const TRAINING_PITY_THRESHOLD = 5

/** Maps a current rarity to the rarity reached on success (P1 is terminal). */
export const TRAINING_NEXT_RARITY: Record<TrainableRarity, Rarity> = {
  P5: 'P4',
  P4: 'P3',
  P3: 'P2',
  P2: 'P1',
}

/** Minimal doctor shape `attemptTraining` reads. */
export interface TrainableDoctor {
  id: string
  rarity: Rarity
  pityCounter: number
}

export type TrainingAttemptResult =
  | {
      kind: 'success'
      doctorId: string
      fromRarity: TrainableRarity
      toRarity: Rarity
      newPowerMultiplier: number
      newPityCounter: 0
      revenueSpent: number
      /** True iff the success was forced by pity (skipped RNG roll). */
      pityTriggered: boolean
    }
  | {
      kind: 'failure'
      doctorId: string
      fromRarity: TrainableRarity
      /** The rarity the attempt was targeting (would-be on success). */
      toRarity: Rarity
      newPityCounter: number
      revenueSpent: number
    }
  | {
      kind: 'aborted'
      doctorId: string
      reason: 'terminal-rarity' | 'insufficient-revenue'
      requiredRevenue: number
    }

export interface AttemptTrainingOptions {
  /** Current `gameCounters.revenue` value (read-only — caller mutates). */
  currentRevenue: number
  /** RNG provider returning a float in `[0, 1)`. Caller wires Math.random
   *  (or a seeded RNG for tests / deterministic replay). */
  rng: () => number
}

/**
 * Resolve a single training attempt for the given doctor.
 *
 * Pure: does not mutate `doctor`, does not touch persistence, does not call
 * `Math.random` directly. Pity short-circuits the RNG roll when triggered.
 *
 * Caller's responsibility (after a non-aborted result):
 *   - deduct `revenueSpent` from `gameCounters.revenue`
 *   - on `success`: update `doctor.rarity = toRarity`, `doctor.powerMultiplier
 *     = newPowerMultiplier`, `doctor.pityCounter = 0`
 *   - on `failure`: update `doctor.pityCounter = newPityCounter` (rarity stays)
 *   - append a `trainingHistory` row in either case
 */
export function attemptTraining(
  doctor: TrainableDoctor,
  opts: AttemptTrainingOptions,
): TrainingAttemptResult {
  if (doctor.rarity === 'P1') {
    return {
      kind: 'aborted',
      doctorId: doctor.id,
      reason: 'terminal-rarity',
      requiredRevenue: 0,
    }
  }

  const fromRarity = doctor.rarity as TrainableRarity
  const cost = TRAINING_COSTS[fromRarity]

  if (opts.currentRevenue < cost) {
    return {
      kind: 'aborted',
      doctorId: doctor.id,
      reason: 'insufficient-revenue',
      requiredRevenue: cost,
    }
  }

  const toRarity = TRAINING_NEXT_RARITY[fromRarity]
  const pityTriggered = doctor.pityCounter >= TRAINING_PITY_THRESHOLD
  const succeeded = pityTriggered || opts.rng() < TRAINING_BASE_SUCCESS_RATES[fromRarity]

  if (succeeded) {
    return {
      kind: 'success',
      doctorId: doctor.id,
      fromRarity,
      toRarity,
      newPowerMultiplier: RARITY_POWER_MULTIPLIER[toRarity],
      newPityCounter: 0,
      revenueSpent: cost,
      pityTriggered,
    }
  }

  return {
    kind: 'failure',
    doctorId: doctor.id,
    fromRarity,
    toRarity,
    newPityCounter: doctor.pityCounter + 1,
    revenueSpent: cost,
  }
}
