/**
 * Skill tree topology + unlock evaluator + fallback content.
 *
 * Pure module: no DOM, no React, no IndexedDB. Theme packs provide content via
 * `ThemePack.skillTree`; when missing or incomplete, the engine fallback below
 * keeps the UI runnable.
 */

import type { ThemePack, PlayerStats } from '../types'

/** A single node on a skill branch. */
export interface SkillNode {
  /** Theme sprite key (looked up in `theme.sprites`). */
  spriteKey: string
  /** Display name (e.g. `翻書術 I`). Hidden while locked. */
  name: string
  /** 1-2 line flavor text shown when an unlocked node is clicked. */
  flavor: string
}

export type SkillBranchStatKey = 'knowledge' | 'reflex' | 'memory' | 'stamina'

/** Branch = 9 nodes for a single stat. */
export interface SkillBranch {
  statKey: SkillBranchStatKey
  /** Length MUST equal {@link SKILL_TREE_NODES_PER_BRANCH}. */
  nodes: SkillNode[]
}

export interface SkillTreeContent {
  /** Length MUST equal 4, ordered to match DEFAULT_STAT_SCHEMA.order. */
  branches: SkillBranch[]
}

/** Branch index 0 always unlocked at statValue = 0. */
export const SKILL_TREE_NODES_PER_BRANCH = 9
/** Linear threshold delta between consecutive nodes. */
export const SKILL_TREE_THRESHOLD_STEP = 100

/** Stat order for skill tree column rendering. Matches DEFAULT_STAT_SCHEMA.order. */
export const SKILL_BRANCH_ORDER: readonly SkillBranchStatKey[] = [
  'knowledge',
  'reflex',
  'memory',
  'stamina',
] as const

/** Threshold (stat value) required to unlock the node at given index. */
export function thresholdForIndex(index: number): number {
  return index * SKILL_TREE_THRESHOLD_STEP
}

/**
 * How many nodes in this branch are unlocked given a stat value.
 *
 * Formula: min(floor(statValue / 100) + 1, branch.nodes.length).
 * statValue = 0 → 1 (the first node is always unlocked).
 * statValue = 100 → 2; … ; statValue ≥ 800 → 9.
 */
export function unlockedCount(statValue: number, branch: SkillBranch): number {
  if (statValue < 0) return 1
  const raw = Math.floor(statValue / SKILL_TREE_THRESHOLD_STEP) + 1
  return Math.min(raw, branch.nodes.length)
}

/**
 * Detect newly unlocked nodes given a prev→next stats transition.
 *
 * Returns nodes in branch order (per SKILL_BRANCH_ORDER) then index order
 * (ascending). Empty array if no thresholds crossed.
 */
export function detectUnlocks(
  prev: PlayerStats,
  next: PlayerStats,
  content: SkillTreeContent,
): SkillNode[] {
  const out: SkillNode[] = []
  for (const branch of content.branches) {
    const prevCount = unlockedCount(prev[branch.statKey] ?? 0, branch)
    const nextCount = unlockedCount(next[branch.statKey] ?? 0, branch)
    if (nextCount <= prevCount) continue
    for (let i = prevCount; i < nextCount; i++) {
      const node = branch.nodes[i]
      if (node) out.push(node)
    }
  }
  return out
}

/** Engine fallback when theme.skillTree is missing/incomplete. */
function buildFallbackBranch(statKey: SkillBranchStatKey): SkillBranch {
  const nodes: SkillNode[] = []
  for (let i = 0; i < SKILL_TREE_NODES_PER_BRANCH; i++) {
    nodes.push({
      spriteKey: `skill-placeholder-${statKey}-${i + 1}`,
      name: `${statKey} node ${i + 1}`,
      flavor: '（主題包尚未提供文案）',
    })
  }
  return { statKey, nodes }
}

export const ENGINE_FALLBACK_SKILL_TREE: SkillTreeContent = {
  branches: SKILL_BRANCH_ORDER.map(buildFallbackBranch),
}

/**
 * Resolve the active skill tree content with fallback semantics.
 *
 * If `theme.skillTree` is missing entirely, returns ENGINE_FALLBACK_SKILL_TREE.
 * If a branch is missing or has fewer than 9 nodes, fills from fallback per
 * missing position. Emits one console.warn naming what was substituted.
 */
export function resolveSkillTree(theme: ThemePack): SkillTreeContent {
  if (!theme.skillTree) {
    console.warn(
      `[skill-tree] theme "${theme.meta.id}" does not provide skillTree; using engine fallback for all 4 branches`,
    )
    return ENGINE_FALLBACK_SKILL_TREE
  }
  const supplied = theme.skillTree
  const branches: SkillBranch[] = []
  const missing: string[] = []
  for (const statKey of SKILL_BRANCH_ORDER) {
    const fallback = buildFallbackBranch(statKey)
    const found = supplied.branches.find((b) => b.statKey === statKey)
    if (!found) {
      branches.push(fallback)
      missing.push(`${statKey} (entire branch)`)
      continue
    }
    if (found.nodes.length === SKILL_TREE_NODES_PER_BRANCH) {
      branches.push(found)
      continue
    }
    // Partial: fill from fallback per missing index
    const filled: SkillNode[] = []
    for (let i = 0; i < SKILL_TREE_NODES_PER_BRANCH; i++) {
      const themeNode = found.nodes[i]
      if (themeNode) {
        filled.push(themeNode)
      } else {
        filled.push(fallback.nodes[i])
        missing.push(`${statKey}[${i + 1}]`)
      }
    }
    branches.push({ statKey, nodes: filled })
  }
  if (missing.length > 0) {
    console.warn(
      `[skill-tree] theme "${theme.meta.id}" missing keys, substituted fallback for: ${missing.join(', ')}`,
    )
  }
  return { branches }
}
