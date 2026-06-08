/**
 * Per-family variant collection chip — shows `🧬 X 隻` (pure count, no denominator;
 * the catalog total is hidden in the open-collection范式, so there is no `X / N`
 * and no celebratory full-collection state). Subscribes to variant-gacha events
 * for live updates without page reload.
 *
 * Spec: openspec/specs/neuron-variant-gacha/spec.md
 *   "Connectome page family cards SHALL display collected-variant count"
 */

import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { subscribeVariantGachaEvents } from '../lib/services/variant-gacha'
import { ownedSlotCountForFamily } from '../lib/services/variant-ownership'
import { EmojiIcon } from './EmojiIcon'

interface Props {
  familyId: string
}

export default function VariantCollectionChip({ familyId }: Props): JSX.Element {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Canonical per-family distinct-owned projection — a cross-device fusion
    // ghost slot (variant row, 0 held individuals) does NOT inflate this count.
    const refresh = async (): Promise<void> => {
      const n = await ownedSlotCountForFamily(db, familyId)
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

  return (
    <span style={baseChipStyle} title={`已收集 ${count} 隻變體`}>
      <EmojiIcon char="🧬" size={14} /> {count} 隻
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
