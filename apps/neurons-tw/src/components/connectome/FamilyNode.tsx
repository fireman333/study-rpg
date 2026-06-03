/**
 * SVG leaf node for one neuron family. Renders sprite (via `artKey`),
 * label, AP chip, firedToday halo. Subscribes to AP slot unlock events
 * to drive a one-shot pulse + halo per design.md D7.
 *
 * Spec: openspec/specs/connectome-collection/spec.md
 *   "SVG tree synapse formation, strengthening, decay, and slot-unlock
 *    SHALL drive Framer Motion animations gated by useRespectsReducedMotion"
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Subject } from '@study-rpg/core'
import { SYNAPSE_TIMINGS, useRespectsReducedMotion } from '../../lib/motion'
import { subscribeConnectomeEvents } from '../../lib/services/connectome'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import type { Vec2 } from './layout'
import { neonForFamily } from './colors'

export interface FamilyNodeProps {
  family: Subject
  pos: Vec2
  ap: number
  firedToday: boolean
  /** Which side of the sprite the text label sits on (bilateral horizontal layout). */
  labelSide?: 'left' | 'right'
}

const SPRITE_SIZE = 64
const PULSE_SCALE = 1.15

export function FamilyNode({
  family,
  pos,
  ap,
  firedToday,
  labelSide = 'right',
}: FamilyNodeProps): JSX.Element {
  const labelOffsetX = labelSide === 'left' ? -(SPRITE_SIZE / 2 + 10) : SPRITE_SIZE / 2 + 10
  const textAnchor = labelSide === 'left' ? ('end' as const) : ('start' as const)
  const reduced = useRespectsReducedMotion()
  const [pulseToken, setPulseToken] = useState(0)

  useEffect(() => {
    const sub = subscribeConnectomeEvents({
      'connectome.variantSlotUnlocked': (payload) => {
        if (payload.familyId !== family.id) return
        setPulseToken((n) => n + 1)
      },
    })
    return () => sub.dispose()
  }, [family.id])

  const spriteUrl = THEME_PIXEL_NEURONS.sprites[`subject:${family.id}`] ?? ''
  const labelStripped = family.displayName.replace(/\s*—.+$/, '')

  return (
    <g transform={`translate(${pos.x}, ${pos.y})`} aria-label={`${family.id} — ${family.displayName}`} role="group">
      {/* Breathing firedToday glow — 2 concentric rings in the NEON variant of
          the family color, with a Gaussian blur filter so it reads as a soft
          halo rather than a thick dark ring. Lower peak opacity + bigger
          radii avoid the "heavy dark stroke" look. */}
      {firedToday && (() => {
        const { core: neonCore, halo: neonHalo } = neonForFamily(family.color ?? '#888')
        const filterId = `fam-glow-${family.id}`
        if (reduced) {
          return (
            <>
              <circle r={SPRITE_SIZE * 0.78} fill={neonHalo} fillOpacity={0.18} />
              <circle r={SPRITE_SIZE * 0.62} fill="none" stroke={neonCore} strokeOpacity={0.55} strokeWidth={2.5} />
            </>
          )
        }
        return (
          <>
            <defs>
              <filter id={filterId} x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>
            {/* Outer haze — blurred disc just outside the cell-body frame
                (r=0.55). Halved from previous 1.15 → 0.70 per user feedback.
                Still extends past the frame by enough to read as a soft halo
                bloom around each fired leaf. */}
            <motion.circle
              r={SPRITE_SIZE * 0.7}
              fill={neonHalo}
              filter={`url(#${filterId})`}
              initial={{ opacity: 0.25, scale: 1 }}
              animate={{ opacity: [0.25, 0.85, 0.25], scale: [1, 1.15, 1] }}
              transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity }}
              style={{ originX: 0.5, originY: 0.5 }}
            />
            {/* Inner ring — thin neon stroke just outside the white frame. */}
            <motion.circle
              r={SPRITE_SIZE * 0.6}
              fill="none"
              stroke={neonCore}
              strokeWidth={4}
              filter={`url(#${filterId})`}
              initial={{ opacity: 0.35, scale: 1 }}
              animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.18, 1] }}
              transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity, delay: 0.08 }}
              style={{ originX: 0.5, originY: 0.5 }}
            />
          </>
        )
      })()}
      {/* Cell-body frame: white circle disc + colored ring; once unlocked
          (AP > 0), the disc fills with a tinted family color. */}
      <circle
        r={SPRITE_SIZE * 0.55}
        fill={ap > 0 ? family.color ?? '#fff' : '#fff'}
        fillOpacity={ap > 0 ? 0.28 : 1}
        stroke={family.color ?? '#3b2a18'}
        strokeWidth={ap > 0 ? 2.5 : 1.8}
      />
      <motion.circle
        r={SPRITE_SIZE * 0.6}
        fill="transparent"
        stroke={family.color ?? '#000'}
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

      {/* Sprite + scale pulse on slot-unlock */}
      <motion.g
        animate={
          pulseToken === 0
            ? { scale: 1 }
            : reduced
              ? { scale: 1 }
              : { scale: [1, PULSE_SCALE, 1] }
        }
        transition={{ duration: SYNAPSE_TIMINGS.slotUnlock / 1000, ease: 'easeOut' }}
        style={{ originX: 0.5, originY: 0.5 }}
        key={`pulse-${pulseToken}`}
      >
        {spriteUrl ? (
          <image
            href={spriteUrl}
            x={-SPRITE_SIZE / 2}
            y={-SPRITE_SIZE / 2}
            width={SPRITE_SIZE}
            height={SPRITE_SIZE}
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <circle r={SPRITE_SIZE / 2} fill={family.color ?? '#888'} stroke="#3b2a18" strokeWidth={1.5} />
        )}
      </motion.g>

      {/* Display label — short Linnean line (strip the " — descriptor" tail to keep tree clean). */}
      <text
        x={labelOffsetX}
        y={-4}
        fontSize={13}
        fontWeight={600}
        textAnchor={textAnchor}
        fill={family.color ?? '#3b2a18'}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {labelStripped}
      </text>
      <text
        x={labelOffsetX}
        y={11}
        fontSize={11}
        textAnchor={textAnchor}
        fill="var(--signal-ink)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {family.id}
      </text>
      <text
        x={labelOffsetX}
        y={26}
        fontSize={10}
        fontFamily="'VT323', monospace"
        textAnchor={textAnchor}
        fill="var(--signal-cyan)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        AP {ap}
      </text>
    </g>
  )
}
