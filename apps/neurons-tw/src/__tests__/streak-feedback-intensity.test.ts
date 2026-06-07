import { describe, it, expect } from 'vitest'
import {
  streakFeedbackIntensity,
  STREAK_INTENSITY_STEP,
  STREAK_INTENSITY_MAX,
} from '../lib/motion/streakIntensity'

/**
 * Locks the continuous, capped streak→intensity contract (spec Req
 * "Correct-answer feedback intensity SHALL scale continuously with the current
 * answer streak"): baseline 1 at streak 0, monotonic linear growth, hard cap.
 */

describe('streakFeedbackIntensity', () => {
  it('returns baseline 1.0 at streak 0', () => {
    expect(streakFeedbackIntensity(0)).toBe(1)
  })

  it('grows linearly by STREAK_INTENSITY_STEP below the cap', () => {
    expect(streakFeedbackIntensity(1)).toBeCloseTo(1 + STREAK_INTENSITY_STEP, 6)
    expect(streakFeedbackIntensity(3)).toBeCloseTo(1 + 3 * STREAK_INTENSITY_STEP, 6)
  })

  it('is monotonic non-decreasing in streak', () => {
    let prev = streakFeedbackIntensity(0)
    for (let s = 1; s <= 30; s++) {
      const cur = streakFeedbackIntensity(s)
      expect(cur).toBeGreaterThanOrEqual(prev)
      prev = cur
    }
  })

  it('clamps at STREAK_INTENSITY_MAX for large streaks', () => {
    expect(streakFeedbackIntensity(1000)).toBe(STREAK_INTENSITY_MAX)
  })

  it('treats negative / non-finite streak as baseline', () => {
    expect(streakFeedbackIntensity(-5)).toBe(1)
    expect(streakFeedbackIntensity(NaN)).toBe(1)
  })
})
