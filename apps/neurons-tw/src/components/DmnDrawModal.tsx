import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { useRespectsReducedMotion, RARITY_TIMINGS } from '../lib/motion'
import { drawDmnCard, type DrawDmnCardResult } from '../lib/services/dmn-fate-card'
import { useDmnStatus } from '../lib/hooks/useDmnStatus'
import type { DmnRarity, DmnEventKind } from '@study-rpg/content-neurons-tw'

interface Props {
  onClose: () => void
}

type Phase = 'pre' | 'rolling' | 'revealed'

const RARITY_LABEL: Record<DmnRarity, string> = {
  P1: 'P1 鑽石',
  P2: 'P2 金',
  P3: 'P3 銀',
  P4: 'P4 銅',
}

const RARITY_COLOR: Record<DmnRarity, string> = {
  P1: '#d4a04d',
  P2: '#c4a04d',
  P3: '#8c8c8c',
  P4: '#a87c4d',
}

const EVENT_LABEL: Record<DmnEventKind, string> = {
  'family-buff': 'Family Buff · 1 小時內某科 AP 加倍',
  'variant-rate-up': 'Variant Rate-Up · 下次 variant 抽卡稀有度提升',
  'quick-review-batch': 'Quick Review · 立刻彈出 5 道 SRS due 題',
  'streak-shield': 'Streak Shield · 下次斷 streak 時為你擋下一次',
  'hidden-reveal': 'Hidden Reveal · 透露下一張 P1 卡的輪廓',
}

export default function DmnDrawModal({ onClose }: Props): JSX.Element {
  const [phase, setPhase] = useState<Phase>('pre')
  const [result, setResult] = useState<DrawDmnCardResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const status = useDmnStatus()
  const reduced = useRespectsReducedMotion()

  const triggerDraw = async (): Promise<void> => {
    setPhase('rolling')
    setError(null)
    try {
      // Brief animation delay so the "rolling" state is visible
      await new Promise((resolve) => setTimeout(resolve, reduced ? 300 : 900))
      const drawn = await drawDmnCard()
      if (!drawn) {
        setError('抽卡失敗 — 沒有可用次數或卡池已空')
        setPhase('pre')
        return
      }
      setResult(drawn)
      setPhase('revealed')
    } catch (err) {
      console.error('[dmn-draw-modal] drawDmnCard threw:', err)
      setError(`抽卡錯誤：${(err as Error).message}`)
      setPhase('pre')
    }
  }

  const transition = { duration: reduced ? 0.18 : 0.35, ease: 'easeOut' as const }

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="DMN 抽卡"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition}
        className="modal-backdrop"
        style={overlayStyle}
        onClick={phase === 'revealed' ? onClose : undefined}
      >
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          style={cardStyle}
          onClick={(e) => e.stopPropagation()}
        >
          {phase === 'pre' && (
            <>
              <h2 style={titleStyle}>DMN 啟動</h2>
              <p style={subtitleStyle}>
                你的大腦進入 Default Mode Network — 自發產生靈感的時刻。
              </p>
              <p style={hintStyle}>
                可用次數：<strong>{status.drawsAvailable}</strong> / 已蒐集：
                <strong>{status.ownedCount}</strong> / {status.catalogSize}
              </p>
              {error && <p style={errorStyle}>{error}</p>}
              <div style={buttonRowStyle}>
                <button type="button" onClick={onClose} style={secondaryBtnStyle}>
                  取消
                </button>
                <button
                  type="button"
                  onClick={triggerDraw}
                  disabled={status.drawsAvailable < 1}
                  style={{
                    ...primaryBtnStyle,
                    opacity: status.drawsAvailable < 1 ? 0.5 : 1,
                    cursor: status.drawsAvailable < 1 ? 'default' : 'pointer',
                  }}
                >
                  發散一抽 →
                </button>
              </div>
            </>
          )}

          {phase === 'rolling' && (
            <div style={rollingWrapStyle}>
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                style={spinnerStyle}
              >
                ◌
              </motion.div>
              <p style={rollingTextStyle}>DMN 啟動中…</p>
            </div>
          )}

          {phase === 'revealed' && result && (
            <DmnRevealCard result={result} onClose={onClose} reduced={reduced} />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function DmnRevealCard({
  result,
  onClose,
  reduced,
}: {
  result: DrawDmnCardResult
  onClose: () => void
  reduced: boolean
}): JSX.Element {
  const { card, catalog } = result
  const color = RARITY_COLOR[card.rarity]
  const spriteUrl = SPRITE_MAP[card.artworkId] ?? SPRITE_MAP['variant:default'] ?? ''
  const timing = RARITY_TIMINGS[card.rarity]
  // P1 spectacle spin per `neurons-mode` spec. P2-P4 spinTurns === 0 →
  // wrapper transition is no-op. Reduced-motion suppresses spin regardless.
  const spinTurns = reduced ? 0 : timing.spinTurns
  // Reveal fade-in duration follows rarity baseline (>= 1000ms per spec).
  const revealDurationSec = reduced ? 0.18 : Math.max(timing.total, 1000) / 1000

  return (
    <motion.div
      initial={{ rotate: 0, opacity: reduced ? 0 : 0 }}
      animate={{ rotate: 360 * spinTurns, opacity: 1 }}
      transition={{
        rotate: {
          duration: spinTurns === 0 ? 0 : 1.5,
          ease: [0.16, 1, 0.3, 1],
        },
        opacity: { duration: revealDurationSec, ease: 'easeOut' },
      }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.7rem' }}
    >
      <div style={{ ...rarityBadgeStyle, color, borderColor: color }}>
        {RARITY_LABEL[card.rarity]}
      </div>
      <div style={spriteWrapStyle}>
        <img src={spriteUrl} alt={card.displayName} style={spriteStyle} />
      </div>
      <div style={cardNameStyle}>{card.displayName}</div>
      <p style={descStyle}>{catalog.description}</p>
      <div style={eventChipStyle}>✦ {EVENT_LABEL[card.eventKind]}</div>
      <button type="button" onClick={onClose} style={primaryBtnStyle}>
        收下 ✓
      </button>
    </motion.div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1200,
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  background: '#1c1838',
  border: '3px solid #5d4ec4',
  borderRadius: '10px',
  padding: '2rem 1.6rem 1.4rem',
  width: 'min(420px, 92vw)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.7rem',
  color: '#e6e6fa',
  boxShadow: '0 16px 48px rgba(93, 78, 196, 0.5)',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.4rem',
  color: '#d4c4ff',
  letterSpacing: '0.1em',
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: '#b8b3d4',
  textAlign: 'center',
  lineHeight: 1.6,
}

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  color: '#9b9b9b',
  textAlign: 'center',
}

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  color: '#ff8888',
}

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.6rem',
  marginTop: '0.4rem',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.4rem',
  background: '#5d4ec4',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.05em',
}

const secondaryBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: 'transparent',
  border: '1px solid #5d4ec4',
  color: '#b8b3d4',
}

const rollingWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '2rem 0',
}

const spinnerStyle: React.CSSProperties = {
  fontSize: '3rem',
  color: '#d4c4ff',
  display: 'inline-block',
}

const rollingTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: '#b8b3d4',
}

const rarityBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-0.75rem',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#1c1838',
  border: '2px solid',
  padding: '0.2rem 0.85rem',
  borderRadius: '999px',
  fontSize: '0.85rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const spriteWrapStyle: React.CSSProperties = {
  width: '160px',
  height: '160px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0f0c24',
  border: '2px solid #3d3270',
  borderRadius: '8px',
  marginTop: '0.4rem',
}

const spriteStyle: React.CSSProperties = {
  width: '128px',
  height: '128px',
  imageRendering: 'pixelated',
}

const cardNameStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 700,
  color: '#fff',
  textAlign: 'center',
}

const descStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.82rem',
  color: '#b8b3d4',
  textAlign: 'center',
  lineHeight: 1.55,
  padding: '0 0.6rem',
}

const eventChipStyle: React.CSSProperties = {
  background: '#2d2055',
  border: '1px solid #5d4ec4',
  borderRadius: '999px',
  padding: '0.3rem 0.85rem',
  fontSize: '0.75rem',
  color: '#d4c4ff',
  textAlign: 'center',
}
