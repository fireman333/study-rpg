/**
 * Shared layout types + NT-branch palette/order for the connectome SVG tree.
 *
 * Per `add-connectome-svg-tree` design.md D9: the active layout is force-sim
 * (`force-sim.ts` + `graph-builder.ts`), not a deterministic layout. This
 * module is now type/constant re-exports only.
 */

import type { Vec2 } from './force-sim'

export type { Vec2 }

export type NtBranch = 'DA' | '5HT' | 'GABA' | 'Glu'

export const NT_BRANCH_ORDER: readonly NtBranch[] = ['DA', '5HT', 'GABA', 'Glu'] as const

export const NT_BRANCH_COLOR: Record<NtBranch, string> = {
  DA: '#d4a04d',
  '5HT': '#c44d4d',
  GABA: '#6a9bc4',
  Glu: '#5c9b6b',
}

export const NT_BRANCH_LABEL: Record<NtBranch, string> = {
  DA: 'DA · 多巴胺',
  '5HT': '5-HT · 血清素',
  GABA: 'GABA · γ-胺基丁酸',
  Glu: 'Glu · 麩胺酸',
}

/** Decode the pair-key wire format `"familyA|familyB"` used by SynapseRow.pairKey. */
export function decodePairKey(pairKey: string): [string, string] {
  const [a, b] = pairKey.split('|')
  return [a, b]
}
