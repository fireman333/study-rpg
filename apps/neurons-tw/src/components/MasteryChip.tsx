/**
 * Per-family mastery chip — tier badge + animated count (via motion library
 * NumberTickUp) + accuracy %. Subscribes to mastery events for live updates.
 *
 * Spec: openspec/specs/neuron-family-mastery/spec.md
 *   "Mastery chip UI SHALL render per family using motion library NumberTickUp"
 */

import { useEffect, useState } from 'react'
import { NumberTickUp } from '../lib/motion'
import {
  deriveMasteryTier,
  masteryEnergyMultiplier,
  TIER_COLORS,
  TIER_LABELS,
  type MasteryTier,
} from '../lib/mastery'
import { getMastery, masteryEvents } from '../lib/services/mastery'

interface Props {
  familyId: string
  displayName?: string
}

export default function MasteryChip({ familyId, displayName }: Props): JSX.Element {
  const [correct, setCorrect] = useState(0)
  const [total, setTotal] = useState(0)
  const [prevCorrect, setPrevCorrect] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refresh = async (): Promise<void> => {
      const row = await getMastery(familyId)
      if (cancelled || !row) return
      setPrevCorrect((p) => correct !== row.correct ? correct : p)
      setCorrect(row.correct)
      setTotal(row.total)
    }
    void refresh()
    const handler = (p: { familyId: string; correct: number; total: number }): void => {
      if (p.familyId !== familyId) return
      setPrevCorrect(correct)
      setCorrect(p.correct)
      setTotal(p.total)
    }
    masteryEvents.on('mastery.updated', handler)
    return () => {
      cancelled = true
      masteryEvents.off('mastery.updated', handler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId])

  const tier: MasteryTier = deriveMasteryTier(correct, total)
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : null
  // Mastery-axis energy boost (wire-mastery-energy-acceleration): show the active
  // acceleration when the family's tier multiplies energy acquisition (> 1.0).
  const energyBoostPct = Math.round((masteryEnergyMultiplier(tier) - 1) * 100)

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.15rem 0.5rem',
        border: `1.5px solid ${TIER_COLORS[tier]}`,
        borderRadius: '3px',
        background: '#fdf6e3',
        fontSize: '0.78rem',
        fontFamily: 'inherit',
      }}
      title={displayName ? `${displayName} 熟練度` : '熟練度'}
    >
      <strong style={{ color: TIER_COLORS[tier] }}>{TIER_LABELS[tier]}</strong>
      <span style={{ color: '#5a3f29' }}>
        <NumberTickUp from={prevCorrect} to={correct} durationMs={500} />/{total}
      </span>
      <span style={{ color: '#8c6d4a' }}>
        {accuracy !== null ? `${accuracy}%` : '—'}
      </span>
      {energyBoostPct > 0 && (
        <span
          style={{ color: TIER_COLORS[tier], fontWeight: 600 }}
          title="熟練度加速能量獲取"
        >
          ⚡+{energyBoostPct}%
        </span>
      )}
    </span>
  )
}
