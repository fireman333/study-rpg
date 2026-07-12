/**
 * useRescueChips — per-family rescue chip map (D countdown + RescueScore) for EVERY
 * active plan (multiple coexist per add-neurons-multi-subject-rescue).
 *
 * Extracted from OverviewPage's inline useMemo (add-neurons-exam-prep-hub) so the
 * 考前中心 hub's rescue status strip shows the SAME chip signal as the homepage family
 * cards without duplicating the ~14-line computation. Yield uses the corpus-percentile
 * fallback (no cram fetch); the RescueScene itself refines with cram tiers. Pure derived,
 * zero persistent state.
 */
import { useMemo } from 'react'
import type { Question } from '@study-rpg/core'
import { filterPoolByFamily } from '../quiz-pool'
import type { ConceptTagMap } from '../../concept-tags'
import { computeRescueD } from './rescue-lifecycle'
import { computeConceptMastery, computeRescueScore } from './rescue-score'
import { buildConceptYield } from './rescue-session'
import type { RescuePlan } from './rescue-sync-keys'
import { todayISO, type QuestionHistoryRow } from '../../db'

export interface RescueChip {
  /** Days to exam (computeRescueD). */
  d: number
  /** RescueScore in [0,100] over the family's high-yield concepts. */
  score: number
}

export function useRescueChips(
  rescuePlans: readonly RescuePlan[],
  questions: readonly Question[],
  conceptTags: ConceptTagMap,
  questionHistory: readonly QuestionHistoryRow[],
): Map<string, RescueChip> {
  return useMemo(() => {
    const m = new Map<string, RescueChip>()
    for (const plan of rescuePlans) {
      const scoped = filterPoolByFamily(questions, plan.familyId)
      const conceptYield = buildConceptYield([], scoped, conceptTags)
      const scopedHistory = questionHistory.filter((h) => h.family === plan.familyId)
      const mastery = computeConceptMastery(scopedHistory, conceptTags)
      m.set(plan.familyId, {
        d: computeRescueD(plan.examDate, todayISO()),
        score: computeRescueScore(mastery, conceptYield),
      })
    }
    return m
  }, [rescuePlans, questions, conceptTags, questionHistory])
}
