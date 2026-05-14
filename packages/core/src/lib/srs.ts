/**
 * Minimal SM-2 spaced repetition.
 * Caller passes the user's quality rating (0..5); we return updated card state.
 *
 * Not FSRS — that comes in M2 (port from Skola). This is good enough for MVP.
 */

import type { SrsCard, QuestionId } from '../types'

const DAY = 86_400_000

export function newCard(questionId: QuestionId, now: number = Date.now()): SrsCard {
  return { questionId, ease: 2.5, interval: 0, dueAt: now, lapses: 0 }
}

export function reviewCard(card: SrsCard, quality: number, now: number = Date.now()): SrsCard {
  const q = Math.max(0, Math.min(5, quality))

  if (q < 3) {
    // Lapse: reset interval, bump lapses
    return { ...card, interval: 1, dueAt: now + DAY, lapses: card.lapses + 1, ease: Math.max(1.3, card.ease - 0.2) }
  }

  const newEase = Math.max(1.3, card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  let newInterval: number
  if (card.interval === 0) newInterval = 1
  else if (card.interval === 1) newInterval = 6
  else newInterval = Math.round(card.interval * newEase)

  return {
    ...card,
    ease: newEase,
    interval: newInterval,
    dueAt: now + newInterval * DAY,
  }
}

export function dueCards(cards: SrsCard[], now: number = Date.now()): SrsCard[] {
  return cards.filter((c) => c.dueAt <= now)
}
