/**
 * Per-rarity animation timing tokens (milliseconds).
 *
 * Consumers SHALL import these so batch UX (e.g., gacha 10-pull skip-all) can
 * predict animation duration without re-implementing the timing logic.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Per-rarity timing tokens SHALL be exported as public constants ..."
 */

export type Rarity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

export interface RarityTiming {
  total: number
  envelope: number
  flip: number
  glow: number
  particle?: number
  hold: number
  /**
   * Z-axis spin rotation turns layered over the reveal sequence. Per
   * `neurons-mode` spec ("Rarity reveal animations SHALL share a centralized
   * timing baseline ..."), P1 SHALL have `spinTurns >= 3`; P2–P5 SHALL be 0.
   * Spin uses ease-out cubic (`cubic-bezier(.16,1,.3,1)`) producing a
   * 「快轉 → 減速 → 定位」 three-stage feel.
   */
  spinTurns: number
}

/**
 * Per-rarity reveal animation timings.
 *
 * Normative constraints (per `neurons-mode` spec):
 *   - All 5 rarities `total >= 1000ms` (no rarity flashes faster than 1000ms)
 *   - P1 `spinTurns >= 3` AND `total >= 1500ms` (multi-rotation spectacle)
 *   - P2–P5 `spinTurns === 0` (no spin; fade + scale + flash only)
 *
 * Values below are the implementation tuning; the constraints above are the
 * spec contract that may not be relaxed without a new change proposal.
 */
export const RARITY_TIMINGS: Record<Rarity, RarityTiming> = {
  P5: { total: 1000, envelope: 250, flip: 250, glow: 200, hold: 300, spinTurns: 0 },
  P4: { total: 1000, envelope: 250, flip: 250, glow: 200, hold: 300, spinTurns: 0 },
  P3: { total: 1100, envelope: 300, flip: 300, glow: 200, hold: 300, spinTurns: 0 },
  P2: { total: 1200, envelope: 300, flip: 300, glow: 300, hold: 300, spinTurns: 0 },
  P1: { total: 2800, envelope: 400, flip: 600, glow: 500, particle: 800, hold: 500, spinTurns: 3 },
} as const

export const SKIP_THRESHOLD_MS = 1000
export const TOAST_AUTO_DISMISS_MS = 8000

/**
 * Synapse SVG-tree animation timing tokens (ms).
 *
 * Consumed by `apps/neurons-tw/src/components/connectome/` SVG tree so animation
 * durations are introspectable and tests can deterministically wait the published
 * wall time.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Synapse-state timing tokens SHALL be exported as public constants for the connectome tree"
 */
export interface SynapseTimings {
  /** Edge pathLength 0 → 1 draw-in when a new synapse forms. */
  formation: number
  /** Stroke width + color + glow morph when state moves up (weak → strong). */
  strengthen: number
  /** Stroke morph down (strong → weak) OR opacity fade (weak → dormant). */
  decay: number
  /** Family leaf scale pulse + halo expand when a variant slot unlocks. */
  slotUnlock: number
}

export const SYNAPSE_TIMINGS: SynapseTimings = {
  formation: 600,
  strengthen: 400,
  decay: 600,
  slotUnlock: 500,
} as const

/**
 * EEG spike-train firing timing (ms) — correct-answer feedback burst.
 *
 * Added by polish-neurons-clinical-machine-aesthetic (EEG anchor). Renders as a
 * short peripheral spike-train burst; MUST NOT block answer resolution. Consumed
 * by `SpikeTrainFiring` primitive + QuizModal.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "EEG-anchored motion timing tokens SHALL be exported as public constants"
 */
export interface SpikeTrainTiming {
  /** Total burst duration (draw + decay) in ms. */
  burst: number
  /** Number of spikes in the train. */
  spikes: number
  /** Fade-out settle duration after the burst, ms. */
  settle: number
}

export const SPIKE_TRAIN_TIMING: SpikeTrainTiming = {
  burst: 280,
  spikes: 4,
  settle: 160,
} as const

/**
 * Signal-oscillation timing (ms) — loading / pending sine-trace motif.
 *
 * Added by polish-neurons-clinical-machine-aesthetic (EEG anchor). Replaces /
 * augments generic spinners with an oscillating signal trace.
 */
export interface OscillationTiming {
  /** One full oscillation period in ms (loop duration). */
  period: number
  /** Peak vertical amplitude in px (svg units). */
  amplitude: number
}

export const OSCILLATION_TIMING: OscillationTiming = {
  period: 900,
  amplitude: 10,
} as const
