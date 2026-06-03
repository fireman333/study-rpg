/**
 * Public API surface for neurons-tw motion library.
 *
 * Capability spec: openspec/specs/neurons-motion-library/spec.md
 */

export { Toast } from './Toast'
export type { ToastProps, ToastVariant } from './Toast'

export { RarityRevealModal } from './RarityRevealModal'
export type { RarityRevealModalProps } from './RarityRevealModal'

export { AchievementUnlockModal } from './AchievementUnlockModal'
export type { AchievementUnlockModalProps, AchievementUnlockModalContent } from './AchievementUnlockModal'

export { NumberTickUp } from './NumberTickUp'
export type { NumberTickUpProps } from './NumberTickUp'

export { ReducedMotionAware } from './ReducedMotionAware'
export type { ReducedMotionAwareProps } from './ReducedMotionAware'

export { useRespectsReducedMotion } from './useRespectsReducedMotion'

export { ParticleBurst } from './ParticleBurst'
export type { ParticleBurstProps } from './ParticleBurst'

export { SpikeTrainFiring } from './SpikeTrainFiring'
export type { SpikeTrainFiringProps } from './SpikeTrainFiring'

export { SignalOscillation } from './SignalOscillation'
export type { SignalOscillationProps } from './SignalOscillation'

export { AmbientFiring } from './AmbientFiring'
export type { AmbientFiringProps } from './AmbientFiring'

export { AnswerFeedbackFlash } from './AnswerFeedbackFlash'
export type { AnswerFeedbackFlashProps } from './AnswerFeedbackFlash'

export { CelebrationHalo } from './CelebrationHalo'
export type { CelebrationHaloProps } from './CelebrationHalo'

export {
  RARITY_TIMINGS,
  SKIP_THRESHOLD_MS,
  TOAST_AUTO_DISMISS_MS,
  SYNAPSE_TIMINGS,
  SPIKE_TRAIN_TIMING,
  OSCILLATION_TIMING,
} from './timings'
export type {
  Rarity,
  RarityTiming,
  SynapseTimings,
  SpikeTrainTiming,
  OscillationTiming,
} from './timings'
