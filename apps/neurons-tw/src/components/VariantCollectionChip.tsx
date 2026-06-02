/**
 * Per-family variant collection chip — shows `🧬 X / 5` (or `🏆 5 / 5` celebratory
 * when complete) on each family card. Subscribes to variant-gacha events for
 * live updates without page reload.
 *
 * Spec: openspec/specs/neuron-variant-gacha/spec.md
 *   "Connectome page family cards SHALL display collected-variant count"
 */

import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { subscribeVariantGachaEvents, SLOTS_PER_FAMILY } from '../lib/services/variant-gacha'

interface Props {
  familyId: string
}

export default function VariantCollectionChip({ familyId }: Props): JSX.Element {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refresh = async (): Promise<void> => {
      const n = await db.neuronVariants.where('familyId').equals(familyId).count()
      if (!cancelled) setCount(n)
    }
    void refresh()
    const sub = subscribeVariantGachaEvents({
      variantRolled: ({ variant }) => {
        if (variant.familyId === familyId) void refresh()
      },
    })
    return () => {
      cancelled = true
      sub.dispose()
    }
  }, [familyId])

  const complete = count >= SLOTS_PER_FAMILY
  const style: React.CSSProperties = complete
    ? { ...baseChipStyle, color: '#b58900', borderColor: '#b58900', background: '#fdf6e3' }
    : baseChipStyle

  return (
    <span
      style={style}
      title={complete ? `完整收集 ${SLOTS_PER_FAMILY} / ${SLOTS_PER_FAMILY} 變體` : `已收集 ${count} / ${SLOTS_PER_FAMILY} 變體`}
    >
      {complete ? '🏆' : '🧬'} {count} / {SLOTS_PER_FAMILY}
    </span>
  )
}

const baseChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.1rem 0.45rem',
  border: '1px solid #8c6d4a',
  borderRadius: '999px',
  background: '#fff',
  color: '#5a3f29',
  fontSize: '0.72rem',
  fontFamily: 'inherit',
}
