/**
 * Concept-tag vocabulary types (add-neurons-concept-tags §1.3).
 *
 * Each 一階 subject has a CLOSED two-level concept **tree**:
 *   - coarse `chapters` — the official 考選部 命題大綱 章節 (see
 *     reference/blueprint-coarse.json). A question's chapter is DERIVED from its
 *     leaf's `chapterId`; it is never tagged separately.
 *   - fine `leaves` — canonical concepts calibrated bottom-up against the actual
 *     4600-question corpus, named with the officially-listed textbook terminology.
 *
 * The vocabulary is closed and canonical: tags may only reference a leaf `id`
 * from the question's own subject tree, and synonyms are pre-mapped to a single
 * canonical leaf so recurrence breadth is never diluted across surface forms.
 */

/** A coarse 章節 node, one-to-one with the official blueprint chapter. */
export interface ConceptChapter {
  /** Stable canonical slug, unique within the subject; matches blueprint-coarse.json chapter id. */
  id: string
  /** Canonical Chinese chapter name (from 命題大綱). */
  zh: string
  /** Official English chapter name (from 命題大綱). */
  en: string
  /**
   * True when the blueprint lists this chapter but the corpus tests ~0 questions
   * under it (spec: "chapters listed in the 大綱 but tested by zero questions
   * SHALL be marked cold — not eligible for 押題").
   */
  cold?: boolean
}

/** A fine (leaf) concept — the unit a question is tagged with. */
export interface ConceptLeaf {
  /** Canonical slug (kebab-case, English), unique within the subject. */
  id: string
  /** Canonical Chinese name (國考/教科書慣用詞). */
  zh: string
  /** Canonical English name (officially-listed textbook terminology). */
  en: string
  /** Parent coarse chapter id; MUST be one of the subject's `chapters`. */
  chapterId: string
  /**
   * Surface forms (zh and/or en) that denote this same concept and collapse to it.
   * Never includes the canonical `zh` / `en` themselves.
   */
  synonyms: readonly string[]
  /**
   * True when the concept is tested in the corpus but not enumerated in the 大綱
   * (bottom-up addition; spec: "concepts tested in the corpus but not listed in
   * the 大綱 SHALL be added under the appropriate chapter").
   */
  bottomUp?: boolean
}

/** The closed concept tree for one subject. */
export interface SubjectConceptTree {
  /** Matches the corpus `question.subject` value verbatim. */
  subjectId: string
  /** 醫學一 / 醫學二. */
  paper: string
  chapters: readonly ConceptChapter[]
  leaves: readonly ConceptLeaf[]
}

/** Full vocabulary keyed by subjectId. */
export type ConceptVocab = Record<string, SubjectConceptTree>
