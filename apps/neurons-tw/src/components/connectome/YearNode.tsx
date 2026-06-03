/**
 * Small year sub-node — one per (subject × exam year). Rendered as a small
 * circle with the ROC year inscribed, attached to its parent leaf via a short
 * dendrite-like edge.
 *
 * Visual: dimmer than the main leaf so the eye treats it as auxiliary detail.
 */

import { memo } from 'react'

export interface YearNodeProps {
  year: number
  pos: { x: number; y: number }
  parentColor: string
  dragging?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
}

const RADIUS = 12

function YearNodeInner({ year, pos, parentColor, dragging, onPointerDown }: YearNodeProps): JSX.Element {
  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      aria-label={`民國 ${year} 年題目`}
      onPointerDown={onPointerDown}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      <circle
        r={RADIUS}
        fill="#fefbf2"
        stroke={parentColor}
        strokeWidth={1.5}
        opacity={dragging ? 1 : 0.92}
      />
      <text
        x={0}
        y={3.5}
        fontSize={10.5}
        fontWeight={600}
        textAnchor="middle"
        fill={parentColor}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {year}
      </text>
    </g>
  )
}

export const YearNode = memo(YearNodeInner)
