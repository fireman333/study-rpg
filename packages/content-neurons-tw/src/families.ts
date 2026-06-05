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
