/**
 * Single canonical source for the 11-family → NT-branch mapping (per
 * add-neurons-per-branch-decor design D2). Consumed at runtime by the app's
 * context-art branch derivation AND at build time by `scripts/build.ts` (which
 * sets each subject's `group`), so the two never drift (coding principle §6).
 *
 * Branch assignment per `wire-neurons-content-and-theme` design.md Decision 1.
 */

/**
 * The four neurotransmitter branches of the neuron phylogenetic taxonomy.
 * Intentionally a parallel to the app-side `NtBranch` in
 * `apps/neurons-tw/src/components/connectome/layout.ts` (identical union): the
 * app depends on this content pack, not vice versa, and hoisting the type into
 * `@study-rpg/core` would widen the published fork contract (a MAJOR change).
 * Kept in sync by hand; both are 4-literal unions.
 */
export type NtBranchId = 'DA' | '5HT' | 'GABA' | 'Glu'

/** Maps each subject id (= neuron family id) to its NT branch. */
export const FAMILY_NT_BRANCH: Record<string, NtBranchId> = {
  藥理學: 'DA',
  公共衛生學: 'DA',
  寄生蟲學: '5HT',
  組織學: '5HT',
  生物化學: 'GABA',
  病理學: 'GABA',
  免疫學: 'GABA',
  解剖學: 'Glu',
  生理學: 'Glu',
  胚胎學: 'Glu',
  微生物學: 'Glu',
}

/**
 * The 11 neuron families (= 11 exam subjects), in canonical order. Single source
 * of truth for the grid maze's per-family entries + per-family energy pools
 * (redesign-neurons-maze-rotjs-grid). Order matches `scripts/build-grid-maze.mjs`
 * FAMILIES (the border-entry angle order) + the committed `grid-graph.json`.
 *
 * The maze is now flat — the player sees no neurotransmitter grouping. The
 * NT-branch data below survives ONLY as internal data for `neurons-character-card`
 * + `neurons-variant-context-art` (NOT the maze).
 */
export const FAMILY_IDS: string[] = [
  '藥理學',
  '公共衛生學',
  '寄生蟲學',
  '組織學',
  '生物化學',
  '病理學',
  '免疫學',
  '解剖學',
  '生理學',
  '胚胎學',
  '微生物學',
]

/**
 * The four NT branches in canonical iteration order. Relocated here from
 * `apps/neurons-tw/src/lib/maze/graph.ts` (redesign-neurons-maze-rotjs-grid)
 * so the rewritten flat-grid maze module no longer owns NT-branch data; the
 * only remaining app consumer is first-pull (its legacy per-branch starter keys).
 */
export const NT_BRANCHES: NtBranchId[] = ['DA', '5HT', 'GABA', 'Glu']

/** Families belonging to each branch, derived from the single-source mapping. */
export const FAMILIES_BY_BRANCH: Record<NtBranchId, string[]> = (() => {
  const out = { DA: [], '5HT': [], GABA: [], Glu: [] } as Record<NtBranchId, string[]>
  for (const [fam, branch] of Object.entries(FAMILY_NT_BRANCH)) out[branch].push(fam)
  return out
})()

/** The NT branch a family belongs to (or undefined if unmapped). */
export const branchOfFamily = (familyId: string): NtBranchId | undefined =>
  FAMILY_NT_BRANCH[familyId]

/**
 * Per-subject distinct accent color — single canonical source
 * (decouple-neurons-subjects-from-nt-branches). Each of the 11 families gets its
 * OWN color so the family picker no longer reads as 4 NT-branch groups (per
 * `neurons-mode`「Connectome visual」: an accent color SHALL NOT signal an
 * NT-branch group). Consumed at build time by `scripts/build.ts` (sets each
 * subject's `color`), replacing the prior 4-color `NT_COLOR[ntBranch]` map.
 *
 * 4 ANCHORS keep their original NT-branch color verbatim ⇒ zero sprite re-tint:
 *   解剖學 (Glu green) · 組織學 (5-HT red, H&E) · 生物化學 (GABA blue) · 藥理學 (DA gold).
 * The other 7 take new mutually-distinct colors; their sprites get re-tinted in a
 * follow-up change (until then card accent ≠ sprite tint is an accepted transient).
 */
export const FAMILY_COLOR: Record<string, string> = {
  解剖學: '#6a8c3f', // anchor — Glu green
  胚胎學: '#7e7b25', // new
  組織學: '#c44d4d', // anchor — 5-HT red (H&E)
  生理學: '#27866f', // new
  生物化學: '#6a9bc4', // anchor — GABA blue
  微生物學: '#278634', // new
  免疫學: '#696cd3', // new
  寄生蟲學: '#ca4970', // new
  公共衛生學: '#c639ba', // new
  藥理學: '#d4a04d', // anchor — DA gold
  病理學: '#9859cf', // new
}

/** The two 國考第一階 exam papers. */
export type ExamPaper = '醫學一' | '醫學二'

/**
 * Which exam paper each subject belongs to — backs the family picker's two-row
 * grouping (decouple-neurons-subjects-from-nt-branches), replacing the prior
 * NT-branch grouping. Derived from the shipped corpus: each subject assigned to
 * its dominant book, then ordered by median qNumber — recovers the official 第一階
 * composition (醫學一 = 5 normal-structure subjects, 醫學二 = 6 mechanism /
 * pathology subjects). Display-only; does NOT reorder `FAMILY_IDS` (maze-coupled).
 */
export const FAMILY_EXAM_PAPER: Record<string, ExamPaper> = {
  解剖學: '醫學一',
  胚胎學: '醫學一',
  組織學: '醫學一',
  生理學: '醫學一',
  生物化學: '醫學一',
  微生物學: '醫學二',
  免疫學: '醫學二',
  寄生蟲學: '醫學二',
  公共衛生學: '醫學二',
  藥理學: '醫學二',
  病理學: '醫學二',
}

/** Within-paper subject order (= 試題順序, corpus median-qNumber order). */
export const EXAM_PAPER_ORDER: Record<ExamPaper, string[]> = {
  醫學一: ['解剖學', '胚胎學', '組織學', '生理學', '生物化學'],
  醫學二: ['微生物學', '免疫學', '寄生蟲學', '公共衛生學', '藥理學', '病理學'],
}
