/**
 * Per-family variant collection chip — shows `🧬 X / N` (or `🏆 N / N` celebratory
 * when complete), where N is the family's pyramid total. Subscribes to
 * variant-gacha events for live updates without page reload.
 *
 * Spec: openspec/specs/neuron-variant-gacha/spec.md
 *   "Connectome page family cards SHALL display collected-variant count"
 */

import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { subscribeVariantGachaEvents, slotsForFamily } from '../lib/services/variant-gacha'

interface Props {
  familyId: string
}

export default function VariantCollectionChip({ familyId }: Props): JSX.Element {
  const [count, setCount] = useState(0)
  const total = slotsForFamily(familyId)

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

  const complete = total > 0 && count >= total
  const style: React.CSSProperties = complete
    ? { ...baseChipStyle, color: '#b58900', borderColor: '#b58900', background: '#fdf6e3' }
    : baseChipStyle

  return (
    <span
      style={style}
      title={complete ? `完整收集 ${total} / ${total} 變體` : `已收集 ${count} / ${total} 變體`}
    >
      {complete ? '🏆' : '🧬'} {count} / {total}
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
