/**
 * add-neurons-insight-ease-penalty: 觀念洞 (concept-gap) gets a DISTINCT, harsher
 * schedule than a plain wrong answer and a lucky guess. The three post-answer
 * "quality" schedules must be distinct on ease:
 *   觀念洞 (lowest) < plain-wrong < 我亂猜的 (ease preserved, highest),
 * all sharing interval 1 where applicable, and 觀念洞's ease floored at EASE_FLOOR.
 */

import { describe, it, expect } from 'vitest'
import {
  reviewCardBinary,
  reviewCardBinaryGuessed,
  reviewCardBinaryInsight,
  INSIGHT_EASE_MULTIPLIER,
  WRONG_EASE_MULTIPLIER,
  type BinaryReviewPrev,
} from '../srs'

const NOW = 1_700_000_000_000
const prev = (ease: number): BinaryReviewPrev => ({ interval: 20, easeFactor: ease, nextDueAt: NOW })

describe('reviewCardBinaryInsight (觀念洞 concept-gap schedule)', () => {
  it('forces interval 1 and decrements ease by INSIGHT_EASE_MULTIPLIER', () => {
    const r = reviewCardBinaryInsight({ prev: prev(2.5), now: NOW })
    expect(r.interval).toBe(1)
    expect(r.easeFactor).toBeCloseTo(2.5 * INSIGHT_EASE_MULTIPLIER, 10)
    expect(r.nextDueAt).toBe(NOW + 1 * 86_400_000)
  })

  it('is distinct on ease from plain-wrong and guessed: insight < wrong < guessed', () => {
    const p = prev(2.5)
    const insightEase = reviewCardBinaryInsight({ prev: p, now: NOW }).easeFactor
    const wrongEase = reviewCardBinary({ correct: false, prev: p, now: NOW }).easeFactor
    const guessedEase = reviewCardBinaryGuessed({ prev: p, now: NOW }).easeFactor
    expect(insightEase).toBeLessThan(wrongEase)
    expect(wrongEase).toBeLessThan(guessedEase)
    // guessed preserves ease (the divergence being fixed); insight is strictly below wrong.
    expect(guessedEase).toBe(2.5)
    expect(insightEase).toBeCloseTo(2.5 * INSIGHT_EASE_MULTIPLIER, 10)
    expect(wrongEase).toBeCloseTo(2.5 * WRONG_EASE_MULTIPLIER, 10)
  })

  it('never drops ease below the floor (single flag cannot collapse a card)', () => {
    // A card already near the floor stays at/above the floor after 觀念洞.
    const r = reviewCardBinaryInsight({ prev: prev(1.35), now: NOW })
    expect(r.easeFactor).toBeGreaterThanOrEqual(1.3)
  })
})
