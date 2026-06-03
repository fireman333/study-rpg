/**
 * Self-verify demo SVG for SYNAPSE_TIMINGS — exercised by /motion-demo.
 *
 * Two static leaf placeholders + one edge between them. Triggers
 * formation / strengthen / decay / slotUnlock animations on demand against
 * the same primitives used by the production ConnectomeTreeSvg.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "/motion-demo route SHALL expose SVG tree animation primitives for self-verify"
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { SYNAPSE_TIMINGS, useRespectsReducedMotion } from '../../lib/motion'
import type { SynapseState } from '../../lib/db'

export type SynapseDemoAction = 'formation' | 'strengthen' | 'decay' | 'slotUnlock'

interface DemoState {
  visible: boolean
  state: SynapseState
  freshToken: number
  pulseToken: number
  fadingOut: boolean
}

const STATE_STYLE: Record<SynapseState, { stroke: string; strokeWidth: number; drawShadow: boolean }> = {
  dormant: { stroke: '#999', strokeWidth: 1, drawShadow: false },
  weak: { stroke: '#b58900', strokeWidth: 1.5, drawShadow: false },
  strong: { stroke: '#268bd2', strokeWidth: 3, drawShadow: true },
}

const LEFT_POS = { x: 60, y: 90 }
const RIGHT_POS = { x: 280, y: 90 }
const EDGE_PATH = `M ${LEFT_POS.x},${LEFT_POS.y} C 140,30 200,30 ${RIGHT_POS.x},${RIGHT_POS.y}`

export function SynapseDemoSvg(): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const [demo, setDemo] = useState<DemoState>({
    visible: false,
    state: 'weak',
    freshToken: 0,
    pulseToken: 0,
    fadingOut: false,
  })

  const trigger = (action: SynapseDemoAction): void => {
    if (action === 'formation') {
      setDemo({
        visible: true,
        state: 'weak',
        freshToken: Date.now(),
        pulseToken: 0,
        fadingOut: false,
      })
    } else if (action === 'strengthen') {
      setDemo((prev) => ({ ...prev, visible: true, state: 'strong', fadingOut: false }))
    } else if (action === 'decay') {
      // Weak → dormant fade-out (most visible decay variant).
      setDemo((prev) => ({ ...prev, visible: true, state: 'weak', fadingOut: true }))
    } else {
      setDemo((prev) => ({ ...prev, pulseToken: Date.now() }))
    }
  }

  const style = STATE_STYLE[demo.state]
  const targetOpacity = demo.fadingOut ? 0 : 1
  const isFreshForm = demo.freshToken > 0 && !demo.fadingOut

  const morphDurationS = reduced
    ? 0
    : demo.fadingOut
      ? SYNAPSE_TIMINGS.decay / 1000
      : SYNAPSE_TIMINGS.strengthen / 1000

  return (
    <div>
      <svg
        viewBox="0 0 340 180"
        role="img"
        aria-label="Synapse animation demo — left leaf and right leaf connected by one edge"
        style={{ width: '100%', maxWidth: 480, height: 'auto', background: '#fefbf2', border: '1px solid #c4a878', borderRadius: 4 }}
      >
        {demo.visible && (
          <motion.path
            key={`edge-${demo.freshToken}-${demo.state}-${demo.fadingOut ? 'fade' : 'live'}`}
            d={EDGE_PATH}
            fill="none"
            pathLength={1}
            strokeLinecap="round"
            initial={
              isFreshForm
                ? { pathLength: reduced ? 1 : 0, opacity: 1, strokeWidth: style.strokeWidth, stroke: style.stroke }
                : false
            }
            animate={{
              pathLength: 1,
              opacity: targetOpacity,
              strokeWidth: style.strokeWidth,
              stroke: style.stroke,
            }}
            transition={
              isFreshForm
                ? { duration: reduced ? 0 : SYNAPSE_TIMINGS.formation / 1000, ease: 'easeOut' }
                : { duration: morphDurationS, ease: 'easeInOut' }
            }
            style={{
              filter: style.drawShadow ? 'drop-shadow(0 0 4px rgba(38, 139, 210, 0.55))' : 'none',
            }}
            onAnimationComplete={() => {
              if (demo.fadingOut) {
                setDemo((prev) => ({ ...prev, visible: false, fadingOut: false }))
              }
            }}
          />
        )}

        {/* Left leaf */}
        <FixedLeaf pos={LEFT_POS} label="家族 A" color="#d4a04d" pulseToken={demo.pulseToken} reduced={reduced} side="left" />
        {/* Right leaf */}
        <FixedLeaf pos={RIGHT_POS} label="家族 B" color="#268bd2" pulseToken={0} reduced={reduced} side="right" />
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button style={btnStyle} onClick={() => trigger('formation')}>
          formation（{SYNAPSE_TIMINGS.formation}ms）
        </button>
        <button style={btnStyle} onClick={() => trigger('strengthen')}>
          strengthen（{SYNAPSE_TIMINGS.strengthen}ms）
        </button>
        <button style={btnStyle} onClick={() => trigger('decay')}>
          decay（{SYNAPSE_TIMINGS.decay}ms · fade out）
        </button>
        <button style={btnStyle} onClick={() => trigger('slotUnlock')}>
          slotUnlock（{SYNAPSE_TIMINGS.slotUnlock}ms · 左葉 pulse）
        </button>
      </div>

      <p style={{ marginTop: '0.5rem', color: '#5a3f29', fontSize: '0.85rem' }}>
        prefers-reduced-motion = <strong>{reduced ? 'reduce' : 'no-preference'}</strong>。reduce
        模式下：邊立刻顯示／消失、左葉 pulse 不發生。
      </p>
    </div>
  )
}

function FixedLeaf({
  pos,
  label,
  color,
  pulseToken,
  reduced,
  side,
}: {
  pos: { x: number; y: number }
  label: string
  color: string
  pulseToken: number
  reduced: boolean
  side: 'left' | 'right'
}): JSX.Element {
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      <motion.circle
        r={18}
        fill="transparent"
        stroke={color}
        strokeWidth={2}
        initial={{ opacity: 0, scale: 1 }}
        animate={
          pulseToken === 0
            ? { opacity: 0, scale: 1 }
            : reduced
              ? { opacity: 0, scale: 1 }
              : { opacity: [0, 0.9, 0], scale: [1, 1.7, 2] }
        }
        transition={{ duration: SYNAPSE_TIMINGS.slotUnlock / 1000, ease: 'easeOut' }}
        key={`halo-${pulseToken}`}
      />
      <motion.circle
        r={16}
        fill={color}
        stroke="#3b2a18"
        strokeWidth={1.5}
        animate={
          pulseToken === 0
            ? { scale: 1 }
            : reduced
              ? { scale: 1 }
              : { scale: [1, 1.15, 1] }
        }
        transition={{ duration: SYNAPSE_TIMINGS.slotUnlock / 1000, ease: 'easeOut' }}
        key={`leaf-${pulseToken}`}
        style={{ originX: 0.5, originY: 0.5 }}
      />
      <text
        x={side === 'left' ? -28 : 28}
        y={4}
        fontSize={12}
        fontWeight={600}
        fill="#3b2a18"
        textAnchor={side === 'left' ? 'end' : 'start'}
        style={{ userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  )
}

const btnStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
  padding: '0.4rem 0.75rem',
  color: '#5a3f29',
  cursor: 'pointer',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
  fontSize: '0.85rem',
}
