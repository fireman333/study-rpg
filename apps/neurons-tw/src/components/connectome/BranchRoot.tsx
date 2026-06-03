/**
 * SVG sub-root node for one NT branch (DA / 5HT / GABA / Glu).
 *
 * Enhanced visual: white background disc + thick colored ring + neurotransmitter
 * pixel-art icon centered inside. Mirrors the cell-body styling of FamilyNode
 * so the first-layer hubs read as prominent ganglia, not tiny dots.
 *
 * Each branch's NT-specific icon comes from `THEME_PIXEL_NEURONS.sprites` by
 * key `branch:<NT>` (lowercase: da / 5ht / gaba / glu). Falls back to a colored
 * dot when the asset isn't yet generated.
 */

import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import type { NtBranch, Vec2 } from './layout'
import { NT_BRANCH_COLOR, NT_BRANCH_LABEL } from './layout'

export interface BranchRootProps {
  branch: NtBranch
  pos: Vec2
  /** Orientation hint so the label anchors on the correct side of the marker. */
  mode: 'horizontal' | 'vertical'
}

// First-layer hubs must read as bigger than the second-layer leaves
// (FamilyNode sprite ~ r=35). Hub radius 50 + 64px icon ⇒ ~1.4× the leaf disc.
const RADIUS = 50
const ICON_SIZE = 64

const SPRITE_KEY_FOR_BRANCH: Record<NtBranch, string> = {
  DA: 'branch:da',
  '5HT': 'branch:5ht',
  GABA: 'branch:gaba',
  Glu: 'branch:glu',
}

export function BranchRoot({ branch, pos, mode }: BranchRootProps): JSX.Element {
  const color = NT_BRANCH_COLOR[branch]
  const label = NT_BRANCH_LABEL[branch]
  const spriteUrl = THEME_PIXEL_NEURONS.sprites[SPRITE_KEY_FOR_BRANCH[branch]] ?? ''
  void mode

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      aria-label={`${branch} branch — ${label}`}
      role="group"
    >
      {/* Outer ring + white disc */}
      <circle r={RADIUS} fill="#fff" stroke={color} strokeWidth={3} />
      {/* Inner glow tint so the hub stands out vs leaf cell-bodies */}
      <circle r={RADIUS - 4} fill={color} fillOpacity={0.12} />

      {spriteUrl ? (
        <image
          href={spriteUrl}
          x={-ICON_SIZE / 2}
          y={-ICON_SIZE / 2}
          width={ICON_SIZE}
          height={ICON_SIZE}
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <circle r={9} fill={color} stroke="#3b2a18" strokeWidth={1.5} />
      )}

      {/* Branch label below the hub */}
      <text
        y={RADIUS + 14}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill="var(--signal-ink)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  )
}
