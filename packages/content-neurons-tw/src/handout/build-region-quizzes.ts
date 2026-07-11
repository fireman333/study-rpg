/**
 * Pure region-keyed quiz-plan builder for the 考前講義 (add-neurons-histology-handout).
 *
 * Extracted from build-handout so the region-config contract — shared by every region-keyed subject
 * (組織學 first, then 胚胎/病理/藥理) — is unit-testable without touching the filesystem. Throws on any
 * violation; the build wrapper converts the throw into a loud `process.exit(1)`, and verify-handout
 * asserts on the throws directly.
 */
import type { HandoutChapterQuiz } from './handout-types'

export interface RegionConfig {
  regionId: string
  title: string
  leafIds: string[]
  targetDepth: 'full' | 'brief'
}

/**
 * One HandoutChapterQuiz per region (`memberRegionIds:[self]` → the scene renders 測驗本區 and no
 * signpost). Each region's pool is the UNION of its leaves' questions; because a question may be
 * tagged to leaves in different regions it can appear in several pools — a cover at question
 * granularity, NOT a partition. Throws on:
 *  - a config leaf absent from `canonicalLeaves`
 *  - a leaf shared across regions, or a canonical leaf left unassigned (strict leaf partition —
 *    this subsumes the no-orphan-question guarantee for questions tagged to canonical leaves)
 *  - an invalid `targetDepth`
 *  - a 0-leaf / 0-question region
 *  - bidirectional config↔HTML region-id drift
 */
export function buildRegionKeyedQuizzes(
  subjectId: string,
  config: RegionConfig[],
  canonicalLeaves: Set<string>,
  htmlRegionIds: string[],
  leafToQids: Map<string, string[]>,
): HandoutChapterQuiz[] {
  // Leaf partition: canonical membership + no leaf shared + targetDepth enum.
  const assigned = new Set<string>()
  for (const r of config) {
    if (r.targetDepth !== 'full' && r.targetDepth !== 'brief')
      throw new Error(`${subjectId}/${r.regionId} targetDepth "${r.targetDepth}" not 'full' | 'brief'`)
    for (const leaf of r.leafIds) {
      if (!canonicalLeaves.has(leaf)) throw new Error(`${subjectId}/${r.regionId} leaf "${leaf}" not in concept-recurrence`)
      if (assigned.has(leaf)) throw new Error(`${subjectId} leaf "${leaf}" assigned to >1 region (partition violation)`)
      assigned.add(leaf)
    }
  }
  for (const leaf of canonicalLeaves)
    if (!assigned.has(leaf))
      throw new Error(`${subjectId} canonical leaf "${leaf}" unassigned to any region (leaf partition incomplete → orphan questions)`)

  // Bidirectional config ↔ HTML region-id drift.
  const configIds = new Set(config.map((r) => r.regionId))
  for (const r of config)
    if (!htmlRegionIds.includes(r.regionId)) throw new Error(`config region "${r.regionId}" has no HTML .hdt-region (${subjectId})`)
  for (const rid of htmlRegionIds)
    if (!configIds.has(rid)) throw new Error(`HTML region "${rid}" has no config entry (${subjectId})`)

  return config.map((r) => {
    const sourceQuestionIds = [...new Set(r.leafIds.flatMap((l) => leafToQids.get(l) ?? []))]
    if (r.leafIds.length === 0 || sourceQuestionIds.length === 0)
      throw new Error(`${subjectId}/${r.regionId} resolved 0 leaves or 0 questions`)
    return { regionId: r.regionId, label: r.title, memberRegionIds: [r.regionId], leafIds: r.leafIds, sourceQuestionIds }
  })
}
