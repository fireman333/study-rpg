/**
 * Build-time validator for the concept-tag vocabulary (add-neurons-concept-tags §1.4).
 *
 * Guarantees the tree stays CLOSED and CANONICAL so downstream tagging can never
 * silently invent or dilute a concept:
 *   R1  subjectId non-empty
 *   R2  chapter ids unique within a subject
 *   R3  leaf ids unique within a subject
 *   R4  every leaf.chapterId ∈ that subject's chapters (closed set)
 *   R5  canonical uniqueness — no two leaves in a subject share a normalized zh or en
 *   R6  synonym integrity — a normalized surface form resolves to at most one leaf,
 *       and never collides with a *different* leaf's canonical zh/en; a leaf never
 *       lists its own canonical as a synonym
 *   R7  every subject has ≥ 1 leaf
 *   R8  a non-cold chapter has ≥ 1 leaf; a cold chapter has 0 leaves
 *   R9  (cross-vocab) corpus↔vocab subject parity, when corpus subject ids are supplied
 *
 * `resolveLeaf` throws on any unknown subject / leaf id (No Silent Errors — unknown
 * enum values raise rather than fall through).
 */

import type { ConceptVocab, ConceptLeaf, SubjectConceptTree } from './types'

export interface ConceptVocabFailure {
  rule: string
  subjectId?: string
  leafId?: string
  message: string
}

/** Canonical normalization for synonym / search matching: trim, casefold, drop inner whitespace. */
export function normalizeSurface(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '')
}

function validateSubjectTree(tree: SubjectConceptTree, failures: ConceptVocabFailure[]): void {
  const sid = tree.subjectId
  if (!sid || sid.trim().length === 0) {
    failures.push({ rule: 'R1_SUBJECT_ID_EMPTY', message: 'A subject tree has an empty subjectId' })
    return
  }

  // R2 chapter id uniqueness
  const chapterIds = new Set<string>()
  for (const c of tree.chapters) {
    if (chapterIds.has(c.id)) {
      failures.push({ rule: 'R2_DUP_CHAPTER_ID', subjectId: sid, message: `duplicate chapter id "${c.id}"` })
    }
    chapterIds.add(c.id)
  }

  // R3 leaf id uniqueness  + R4 chapter membership
  const leafIds = new Set<string>()
  const leavesByChapter = new Map<string, number>()
  for (const l of tree.leaves) {
    if (leafIds.has(l.id)) {
      failures.push({ rule: 'R3_DUP_LEAF_ID', subjectId: sid, leafId: l.id, message: `duplicate leaf id "${l.id}"` })
    }
    leafIds.add(l.id)
    if (!chapterIds.has(l.chapterId)) {
      failures.push({
        rule: 'R4_LEAF_CHAPTER_NOT_IN_TREE',
        subjectId: sid,
        leafId: l.id,
        message: `leaf "${l.id}" chapterId "${l.chapterId}" is not a chapter of ${sid} (closed-set violation)`,
      })
    }
    leavesByChapter.set(l.chapterId, (leavesByChapter.get(l.chapterId) ?? 0) + 1)
  }

  // R5 canonical uniqueness (normalized zh / en)
  const zhSeen = new Map<string, string>()
  const enSeen = new Map<string, string>()
  for (const l of tree.leaves) {
    const nz = normalizeSurface(l.zh)
    const ne = normalizeSurface(l.en)
    if (nz && zhSeen.has(nz)) {
      failures.push({
        rule: 'R5_DUP_CANONICAL_ZH',
        subjectId: sid,
        leafId: l.id,
        message: `canonical zh "${l.zh}" collides with leaf "${zhSeen.get(nz)}"`,
      })
    } else if (nz) zhSeen.set(nz, l.id)
    if (ne && enSeen.has(ne)) {
      failures.push({
        rule: 'R5_DUP_CANONICAL_EN',
        subjectId: sid,
        leafId: l.id,
        message: `canonical en "${l.en}" collides with leaf "${enSeen.get(ne)}"`,
      })
    } else if (ne) enSeen.set(ne, l.id)
  }

  // R6 synonym integrity: normalized surface → single leaf, no collision with a different
  // leaf's canonical, no self-canonical synonym.
  const surfaceToLeaf = new Map<string, string>()
  for (const l of tree.leaves) {
    surfaceToLeaf.set(normalizeSurface(l.zh), l.id)
    surfaceToLeaf.set(normalizeSurface(l.en), l.id)
  }
  for (const l of tree.leaves) {
    for (const syn of l.synonyms) {
      const ns = normalizeSurface(syn)
      if (!ns) continue
      if (ns === normalizeSurface(l.zh) || ns === normalizeSurface(l.en)) {
        failures.push({
          rule: 'R6_SYNONYM_IS_OWN_CANONICAL',
          subjectId: sid,
          leafId: l.id,
          message: `synonym "${syn}" equals leaf "${l.id}"'s own canonical`,
        })
        continue
      }
      const existing = surfaceToLeaf.get(ns)
      if (existing && existing !== l.id) {
        failures.push({
          rule: 'R6_AMBIGUOUS_SYNONYM',
          subjectId: sid,
          leafId: l.id,
          message: `synonym "${syn}" also resolves to leaf "${existing}" — ambiguous surface form`,
        })
      } else {
        surfaceToLeaf.set(ns, l.id)
      }
    }
  }

  // R7 non-empty leaves
  if (tree.leaves.length === 0) {
    failures.push({ rule: 'R7_NO_LEAVES', subjectId: sid, message: `${sid} has no leaves` })
  }

  // R8 cold/non-cold chapter leaf presence
  for (const c of tree.chapters) {
    const n = leavesByChapter.get(c.id) ?? 0
    if (c.cold && n > 0) {
      failures.push({
        rule: 'R8_COLD_CHAPTER_HAS_LEAVES',
        subjectId: sid,
        message: `chapter "${c.id}" is marked cold but has ${n} leaves`,
      })
    }
    if (!c.cold && n === 0) {
      failures.push({
        rule: 'R8_CHAPTER_WITHOUT_LEAVES',
        subjectId: sid,
        message: `chapter "${c.id}" has 0 leaves — mark it cold or add a leaf`,
      })
    }
  }
}

export interface ValidateVocabOptions {
  /** Corpus subject ids (from questions.json) for R9 parity; omit to skip. */
  corpusSubjectIds?: readonly string[]
}

/** Validate the full vocabulary. Throws with all violations if any rule fails. */
export function validateConceptVocab(vocab: ConceptVocab, opts: ValidateVocabOptions = {}): void {
  const failures: ConceptVocabFailure[] = []
  for (const tree of Object.values(vocab)) validateSubjectTree(tree, failures)

  // R9 corpus↔vocab subject parity
  if (opts.corpusSubjectIds) {
    const vocabSubs = new Set(Object.keys(vocab))
    const corpusSubs = new Set(opts.corpusSubjectIds)
    for (const s of corpusSubs) {
      if (!vocabSubs.has(s)) {
        failures.push({ rule: 'R9_CORPUS_SUBJECT_MISSING_VOCAB', subjectId: s, message: `corpus subject "${s}" has no vocabulary tree` })
      }
    }
    for (const s of vocabSubs) {
      if (!corpusSubs.has(s)) {
        failures.push({ rule: 'R9_VOCAB_SUBJECT_NOT_IN_CORPUS', subjectId: s, message: `vocabulary subject "${s}" is absent from the corpus` })
      }
    }
  }

  if (failures.length > 0) {
    const lines = failures.map((f) => `  - [${f.rule}]${f.subjectId ? ` (${f.subjectId}${f.leafId ? '/' + f.leafId : ''})` : ''} ${f.message}`)
    throw new Error(
      `Concept vocabulary validation failed (${failures.length} violation${failures.length === 1 ? '' : 's'}):\n${lines.join('\n')}`,
    )
  }
}

/** Resolve a leaf by (subjectId, leafId). Throws on any unknown id — no silent fall-through. */
export function resolveLeaf(vocab: ConceptVocab, subjectId: string, leafId: string): ConceptLeaf {
  const tree = vocab[subjectId]
  if (!tree) throw new Error(`resolveLeaf: unknown subject "${subjectId}"`)
  const leaf = tree.leaves.find((l) => l.id === leafId)
  if (!leaf) throw new Error(`resolveLeaf: unknown leaf "${leafId}" in subject "${subjectId}"`)
  return leaf
}
