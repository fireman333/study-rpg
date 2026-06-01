import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRespectsReducedMotion, RARITY_TIMINGS } from '../lib/motion'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { subscribeVariantGachaEvents, type VariantRolledPayload } from '../lib/services/variant-gacha'
import type { VariantRarity } from '../lib/db'
import { SpriteSheetPlayer } from './SpriteSheetPlayer'

interface QueuedReveal {
  id: number
  payload: VariantRolledPayload
}

const RARITY_LABEL: Record<VariantRarity, string> = {
  P1: 'P1 夯',
  P2: 'P2 頂級',
  P3: 'P3 人上人',
  P4: 'P4 NPC',
  P5: 'P5 拉完了',
}

const RARITY_COLOR: Record<VariantRarity, string> = {
  P1: '#d4a04d',
  P2: '#c44d4d',
  P3: '#6a8c3f',
  P4: '#6a9bc4',
  P5: '#9b9b9b',
}

let nextId = 0

export default function VariantUnlockModal(): JSX.Element {
  const [queue, setQueue] = useState<QueuedReveal[]>([])
  const reduced = useRespectsReducedMotion()

  useEffect(() => {
    const sub = subscribeVariantGachaEvents({
      variantRolled: (payload) => {
        setQueue((prev) => [...prev, { id: nextId++, payload }])
      },
    })
    return () => sub.dispose()
  }, [])

  const dismissCurrent = (): void => {
    setQueue((prev) => prev.slice(1))
  }

  const current = queue[0]
  if (!current) return <></>

  const { variant, familyDisplayName } = current.payload
  const spriteUrl = SPRITE_MAP[variant.spriteKey] ?? SPRITE_MAP['variant:default'] ?? ''
  const color = RARITY_COLOR[variant.rarity]
  const timing = RARITY_TIMINGS[variant.rarity]
  // Card entry duration (in seconds for Framer Motion) follows the centralized
  // baseline. Reduced-motion users still get a brief opacity-only fade.
  const cardDurationSec = reduced ? 0.18 : Math.max(timing.total, 1000) / 1000
  // P1 spectacle spin per `neurons-mode` spec: 3 turns over 1.5s ease-out cubic.
  // Non-P1 rarities have spinTurns === 0 and the wrapper is a no-op.
  const spinTurns = reduced ? 0 : timing.spinTurns

  const overlayInitial = reduced ? { opacity: 0 } : { opacity: 0 }
  const overlayAnimate = { opacity: 1 }
  const overlayExit = { opacity: 0 }
  const cardInitial = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }
  const cardAnimate = reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }
  const cardExit = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95 }
  const overlayTransition = { duration: reduced ? 0.18 : 0.35, ease: 'easeOut' as const }
  const cardTransition = { duration: cardDurationSec, ease: 'easeOut' as const }

  return (
    <AnimatePresence>
      <motion.div
        key={current.id}
        role="dialog"
        aria-modal="true"
        aria-label={`新變體解鎖：${familyDisplayName} ${variant.displayName}`}
        initial={overlayInitial}
        animate={overlayAnimate}
        exit={overlayExit}
        transition={overlayTransition}
        className="modal-backdrop"
        style={overlayStyle}
        onClick={dismissCurrent}
      >
        {/*
          Spin wrapper — P1 SHALL spin >= 3 turns over >= 1500ms ease-out cubic
          per `neurons-mode` spec. P2-P5 have spinTurns === 0 → no-op wrapper.
          Reduced-motion gets spinTurns 0 regardless of rarity.
        */}
        <motion.div
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 * spinTurns }}
          transition={{
            duration: spinTurns === 0 ? 0 : 1.5,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{ display: 'inline-block' }}
          onClick={(e) => e.stopPropagation()}
        >
        <motion.div
          initial={cardInitial}
          animate={cardAnimate}
          exit={cardExit}
          transition={cardTransition}
          style={{ ...cardStyle, borderColor: color }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ ...rarityBadgeStyle, color, borderColor: color }}>{RARITY_LABEL[variant.rarity]}</div>
          <div style={slotChipStyle}>Slot {variant.slotIndex}</div>
          <div style={spriteWrapStyle}>
            {SPRITE_MAP[`${variant.spriteKey}:evolve`] ? (
              // Hero variant ships an evolve sheet → play the 進化爆光 on reveal.
              <SpriteSheetPlayer spriteKeyBase={variant.spriteKey} state="evolve" size={128} />
            ) : (
              <img
                src={spriteUrl}
                alt={variant.displayName}
                className="neuron-sprite--alive"
                style={spriteStyle}
              />
            )}
          </div>
          <div style={familyNameStyle}>{familyDisplayName}</div>
          <div style={variantNameStyle}>{variant.displayName}</div>
          {variant.wasPityFloor && <div style={pityChipStyle}>保底</div>}
          <button
            type="button"
            onClick={dismissCurrent}
            style={dismissButtonStyle}
          >
            收下 ✓
          </button>
          {queue.length > 1 && (
            <div style={queueHintStyle}>還有 {queue.length - 1} 個變體待揭曉</div>
          )}
        </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  background: '#f4ecd8',
  border: '3px solid #b58900',
  borderRadius: '8px',
  padding: '1.25rem 1.5rem 1rem',
  width: 'min(360px, 92vw)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.6rem',
  color: '#5a3f29',
  boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
}

const rarityBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-0.7rem',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#f4ecd8',
  border: '2px solid',
  padding: '0.15rem 0.7rem',
  borderRadius: '999px',
  fontSize: '0.85rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const slotChipStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  fontSize: '0.7rem',
  padding: '0.1rem 0.5rem',
  border: '1px solid #8c6d4a',
  borderRadius: '999px',
  color: '#5a3f29',
  background: '#fff',
}

const spriteWrapStyle: React.CSSProperties = {
  width: '128px',
  height: '128px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#fff',
  border: '2px solid #8c6d4a',
  borderRadius: '6px',
  marginTop: '0.3rem',
}

const spriteStyle: React.CSSProperties = {
  width: '128px',
  height: '128px',
  imageRendering: 'pixelated',
}

const familyNameStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#5a3f29',
  marginTop: '0.2rem',
  textAlign: 'center',
}

const variantNameStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#1a1410',
  textAlign: 'center',
}

const pityChipStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  padding: '0.15rem 0.6rem',
  background: '#fdf6e3',
  border: '2px solid #b58900',
  borderRadius: '999px',
  color: '#b58900',
  fontWeight: 600,
}

const dismissButtonStyle: React.CSSProperties = {
  marginTop: '0.4rem',
  padding: '0.5rem 1.2rem',
  background: '#b58900',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const queueHintStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#8c6d4a',
  fontStyle: 'italic',
}
