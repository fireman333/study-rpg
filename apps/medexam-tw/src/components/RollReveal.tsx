import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { RollResult } from '@study-rpg/core'

type Sprites = Record<string, string>

const RARITY_LABEL: Record<string, string> = {
  N: 'COMMON',
  R: 'RARE',
  SR: 'SUPER RARE',
  SSR: 'ULTRA RARE',
  UR: 'LEGENDARY',
}

const RARITY_DURATION_MS: Record<string, number> = {
  N: 300,
  R: 1_000,
  SR: 2_000,
  SSR: 3_000,
  UR: 5_000,
}

export function RollReveal({ result, sprites, onDone }: { result: RollResult; sprites: Sprites; onDone: () => void }) {
  const dur = RARITY_DURATION_MS[result.rarity] ?? 500
  useEffect(() => {
    const t = setTimeout(onDone, dur)
    return () => clearTimeout(t)
  }, [dur, onDone])
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={`card-reveal rarity-${result.rarity}`}
      onClick={onDone}
    >
      <div className="rarity-tag" style={{ color: `var(--rarity-${result.rarity.toLowerCase()})` }}>
        {RARITY_LABEL[result.rarity]}
        {result.wasPity ? '  (PITY!)' : ''}
      </div>
      <img className="reveal-sprite" src={sprites[result.item.artKey]} alt={result.item.name} />
      <div className="item-name">{result.item.name}</div>
      <div className="flavor">{result.item.flavor}</div>
      <div className="loot-stats">點一下繼續</div>
    </motion.div>
  )
}
