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
