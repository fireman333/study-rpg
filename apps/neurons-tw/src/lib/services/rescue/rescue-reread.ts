/**
 * Single-subject rescue — concept re-read card resolver (pure).
 *
 * When stop-loss trips on a HIGH-frequency stuck concept, the engine injects a
 * ~30-second re-read card (retrieval is useless on never-encoded material). The
 * cram kernel HTML lives at SUBJECT level (`CramSubject.blocks[kind==='kernel']`),
 * not per-concept, so a concept card is resolved from the concept's `CramPushItem`
 * (its label + `sourceQuestionIds`), falling back to the subject-level kernel items
 * when the concept has no push item. The fallback is explicitly flagged so callers
 * (and telemetry) know it is family-level, not concept-precise.
 *
 * Spec: neurons-single-subject-rescue "Stop-loss ... concept-scoped re-read card".
 */

import type { CramData } from '@study-rpg/content-neurons-tw'

type CramSubject = CramData['books'][number]['subjects'][number]
type KernelItem = { html: string; cite?: string }

export interface ConceptRereadCard {
  /** 'concept' = resolved from the concept's push item; 'subject-fallback' = family-level kernel. */
  source: 'concept' | 'subject-fallback'
  conceptId: string
  /** Concept label (present when a push item was found). */
  conceptZh?: string
  /** Source question ids of the concept (for pulling explanations); empty on fallback. */
  sourceQuestionIds: string[]
  /** Kernel re-read lines (subject-level 高頻考古 essence — supporting material). */
  kernelItems: KernelItem[]
}

/** Find a subject's cram entry. Pure. */
export function findCramSubject(cram: CramData | null, subjectId: string): CramSubject | undefined {
  if (!cram) return undefined
  return cram.books.flatMap((b) => b.subjects).find((s) => s.subjectId === subjectId)
}

/** Subject-level kernel essence lines (same source the 5-min speed-review uses). Pure. */
export function subjectKernelItems(subject: CramSubject | undefined): KernelItem[] {
  if (!subject) return []
  return subject.blocks
    .filter((b) => b.kind === 'kernel')
    .flatMap((b) => (b.kind === 'kernel' ? b.items : []))
}

/**
 * Resolve a concept-scoped re-read card. Concept-precise when a push item exists,
 * else a labelled subject-level fallback.
 */
export function resolveConceptRereadCard(
  subject: CramSubject | undefined,
  conceptId: string,
): ConceptRereadCard {
  const kernelItems = subjectKernelItems(subject)
  const push = subject?.push.find((p) => p.leafId === conceptId)
  if (push) {
    return {
      source: 'concept',
      conceptId,
      conceptZh: push.zh,
      sourceQuestionIds: push.sourceQuestionIds ?? [],
      kernelItems,
    }
  }
  return { source: 'subject-fallback', conceptId, sourceQuestionIds: [], kernelItems }
}
