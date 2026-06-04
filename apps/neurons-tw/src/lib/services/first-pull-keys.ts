/**
 * First-pull meta key constants — split into a cycle-free module so the reset
 * path (connectome.ts) can clear first-pull state without importing the
 * first-pull orchestrator (which → variant-gacha → connectome would cycle).
 *
 * Single source of truth for the key strings (the sync allowlist in
 * lib/sync/tables.ts mirrors these as literals, matching the existing
 * `maze:<branch>:*` convention in that file).
 */
import { NT_BRANCHES } from '../maze/graph'
import type { NtBranchId } from '@study-rpg/content-neurons-tw'

/** Persisted once-only flag (synced, monotonic-OR — never written 'false'). */
export const FIRST_PULL_DONE_KEY = 'firstPullDone'

/** Per-branch starter family key (synced) — drives the starter-lit maze node. */
export const starterFamilyKey = (branch: NtBranchId): string =>
  `maze:${branch.toLowerCase()}:starterFamily`

/** All four starter-family meta keys (for sync allowlist + reset). */
export const STARTER_FAMILY_KEYS: string[] = NT_BRANCHES.map(starterFamilyKey)
