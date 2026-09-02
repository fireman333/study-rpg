/**
 * Cram-tab data types (add-neurons-cram-tab Phase 1).
 *
 * 速看 blocks are parsed from pre-produced HTML fragments; 押題 items are joined from
 * concept-recurrence + concept-tags. HONESTY invariant: 押題 carries ONLY raw counts +
 * tier — never normalized scores, hit-rate %, or guarantee language.
 */

/** One 速看 block. Discriminated union on `kind`; `heading` is the 中文 <h3> text (emoji stripped). */
export type CramBlock =
  | { kind: 'kernel'; heading: string; items: { html: string; cite?: string }[] }
  | { kind: 'kw'; heading: string; rows: { k: string; v: string }[] }
  | { kind: 'disc'; heading: string; cols: string[]; rows: string[][] }
  | { kind: 'num'; heading: string; rows: { label: string; value: string }[] }
  | { kind: 'skeleton'; heading: string; html: string }

/** One 押題 item — raw recurrence signal only (no derived scores). */
export interface CramPushItem {
  subjectId: string
  leafId: string
  zh: string
  tier: string
  sittingBreadth: number
  sittingsTotal: number
  questionCount: number
  sourceQuestionIds: string[]
}

export interface CramSubject {
  subjectId: string
  book: '醫學一' | '醫學二'
  /** 科 display name (same as subjectId). */
  name: string
  blocks: CramBlock[]
  push: CramPushItem[]
}

export interface CramBook {
  book: '醫學一' | '醫學二'
  subjects: CramSubject[]
}

export interface CramData {
  version: 1
  /** Most recent ingested sitting, e.g. '115-2'. Derived at build time — never a literal. */
  statUpTo: string
  /** Number of ingested sittings = the denominator of every 出題頻率 line. */
  sittingsTotal: number
  builtAt: string
  books: CramBook[]
}
