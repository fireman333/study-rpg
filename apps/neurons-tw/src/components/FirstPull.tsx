/**
 * First-pull (首抽) UI — the one-time starter ritual.
 *
 * - `FirstPullButton` — the explicit CTA. `placement="onboarding"` shows inside
 *   the onboarding card (which only renders while not dismissed); `placement=
 *   "toolbar"` is the fallback that shows only AFTER onboarding is dismissed but
 *   before first-pull is done. Both gate on `firstPullDone` and emit a request.
 * - `FirstPullModal` — mounted once on the homepage (has the ContentPack). It
 *   runs the four silent pulls on request and shows ONE combined reveal of the
 *   four starter neurons; on dismiss it runs the single deferred achievement check.
 *
 * Spec: openspec/specs/neurons-first-pull/spec.md
 */

import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { AnimatePresence, motion } from 'framer-motion'
import type { ContentPack } from '@study-rpg/core'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { db, HOMEPAGE_ONBOARDING_DISMISSED_KEY, type VariantRarity } from '../lib/db'
import { useRespectsReducedMotion } from '../lib/motion'
import VariantSprite from './VariantSprite'
import {
  FIRST_PULL_DONE_KEY,
  finalizeFirstPullAchievements,
  makeResolveName,
  onFirstPullRequest,
  requestFirstPull,
  runFirstPull,
  type FirstPullOutcome,
} from '../lib/services/first-pull'

const RARITY_LABEL: Record<VariantRarity, string> = {
  P0: 'P0 始源',
  P1: 'P1 夯',
  P2: 'P2 頂級',
  P3: 'P3 人上人',
  P4: 'P4 NPC',
  P5: 'P5 拉完了',
}

const RARITY_COLOR: Record<VariantRarity, string> = {
  P0: '#a64dd4',
  P1: '#d4a04d',
  P2: '#c44d4d',
  P3: '#6a8c3f',
  P4: '#6a9bc4',
  P5: '#9b9b9b',
}

// ─── CTA button ──────────────────────────────────────────────────────────────

export function FirstPullButton({
  placement,
}: {
  placement: 'onboarding' | 'toolbar'
}): JSX.Element | null {
  const [state, setState] = useState<{ done: boolean; dismissed: boolean } | null>(null)

  useEffect(() => {
    const sub = liveQuery(async () => {
      const done = (await db.meta.get(FIRST_PULL_DONE_KEY))?.value === 'true'
      const dismissed =
        (await db.meta.get(HOMEPAGE_ONBOARDING_DISMISSED_KEY))?.value === 'true'
      return { done, dismissed }
    }).subscribe({
      next: setState,
      // Fail closed (don't nag) on read error.
      error: () => setState({ done: true, dismissed: true }),
    })
    return () => sub.unsubscribe()
  }, [])

  if (!state || state.done) return null
  // Toolbar fallback only appears once onboarding is dismissed (avoids showing
  // two 首抽 CTAs at once while the onboarding card is visible).
  if (placement === 'toolbar' && !state.dismissed) return null

  const style = placement === 'onboarding' ? onboardingCtaStyle : toolbarCtaStyle
  return (
    <button
      type="button"
      style={style}
      onClick={() => requestFirstPull()}
      aria-label="首抽：點亮四大家族"
      title="一次性首抽：四大神經傳導物家族各得一隻代表神經元"
    >
      🎲 首抽 · 點亮四大家族
    </button>
  )
}

// ─── Reveal modal + orchestrator ──────────────────────────────────────────────

export function FirstPullModal({ pack }: { pack: ContentPack }): JSX.Element | null {
  const [outcome, setOutcome] = useState<FirstPullOutcome | null>(null)
  const runningRef = useRef(false)
  const reduced = useRespectsReducedMotion()

  useEffect(() => {
    const resolveName = makeResolveName(pack)
    return onFirstPullRequest(() => {
      if (runningRef.current) return
      runningRef.current = true
      void runFirstPull(resolveName)
        .then((res) => {
          if (res) setOutcome(res)
        })
        .catch((e) => console.error('[first-pull] run failed', e))
        .finally(() => {
          runningRef.current = false
        })
    })
  }, [pack])

  if (!outcome) return null

  const resolveName = makeResolveName(pack)
  const drawn = outcome.draws.filter((d) => d.pull.ok && d.pull.variant)

  const dismiss = (): void => {
    const prev = outcome.prevStats
    setOutcome(null)
    // Defer the single achievement check until after the reveal closes so its
    // toasts/modals don't fight the reveal (per spec; boot backfill is the net).
    void finalizeFirstPullAchievements(prev)
  }

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="首抽結果：四大家族代表神經元"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0.18 : 0.35, ease: 'easeOut' }}
        style={overlayStyle}
        onClick={dismiss}
      >
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0.18 : 0.45, ease: 'easeOut' }}
          style={cardStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={titleStyle}>🎉 首抽完成 · 四大家族各誕生一隻</div>
          <div style={gridStyle}>
            {drawn.map((d) => {
              const v = d.pull.variant!
              const color = RARITY_COLOR[v.rarity]
              const spriteUrl = SPRITE_MAP[v.spriteKey] ?? SPRITE_MAP['variant:default'] ?? ''
              return (
                <div key={d.branch} style={{ ...miniCardStyle, borderColor: color }}>
                  <div style={branchTagStyle}>{d.branch}</div>
                  <div style={spriteWrapStyle}>
                    <VariantSprite row={v} size={84} alt={v.displayName}>
                      <img
                        src={spriteUrl}
                        alt={v.displayName}
                        className="neuron-sprite--alive"
                        style={spriteStyle}
                      />
                    </VariantSprite>
                  </div>
                  <div style={{ ...rarityChipStyle, color, borderColor: color }}>
                    {RARITY_LABEL[v.rarity]}
                  </div>
                  <div style={familyNameStyle}>{resolveName(d.familyId)}</div>
                  <div style={variantNameStyle}>{v.displayName}</div>
                </div>
              )
            })}
          </div>
          <button type="button" style={dismissButtonStyle} onClick={dismiss}>
            收下 ✓ 開始探索腦圖
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const onboardingCtaStyle: React.CSSProperties = {
  marginTop: '0.2rem',
  marginRight: '0.5rem',
  padding: '0.5rem 1.1rem',
  borderRadius: '6px',
  border: '1px solid #a64dd4',
  background: 'linear-gradient(135deg, #b86bdd 0%, #a64dd4 100%)',
  color: '#fff',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const toolbarCtaStyle: React.CSSProperties = {
  padding: '0.55rem 0.9rem',
  borderRadius: '8px',
  border: '2px solid #a64dd4',
  background: '#f6ecfb',
  color: '#7d3aa8',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  padding: '1rem',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
}

const cardStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '3px solid #b58900',
  borderRadius: '10px',
  padding: '1.1rem 1.25rem',
  width: 'min(560px, 96vw)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.8rem',
  color: '#5a3f29',
  boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#1a1410',
  textAlign: 'center',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '0.7rem',
  width: '100%',
}

const miniCardStyle: React.CSSProperties = {
  position: 'relative',
  background: '#fff',
  border: '2px solid #b58900',
  borderRadius: '8px',
  padding: '0.55rem 0.5rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.3rem',
}

const branchTagStyle: React.CSSProperties = {
  position: 'absolute',
  top: '0.3rem',
  left: '0.4rem',
  fontSize: '0.7rem',
  fontWeight: 700,
  color: '#8c6d4a',
}

const spriteWrapStyle: React.CSSProperties = {
  width: '84px',
  height: '84px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const spriteStyle: React.CSSProperties = {
  width: '84px',
  height: '84px',
  imageRendering: 'pixelated',
}

const rarityChipStyle: React.CSSProperties = {
  border: '2px solid',
  padding: '0.1rem 0.5rem',
  borderRadius: '999px',
  fontSize: '0.72rem',
  fontWeight: 700,
}

const familyNameStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#5a3f29',
  textAlign: 'center',
}

const variantNameStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 700,
  color: '#1a1410',
  textAlign: 'center',
}

const dismissButtonStyle: React.CSSProperties = {
  marginTop: '0.2rem',
  padding: '0.55rem 1.4rem',
  background: '#b58900',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontFamily: 'inherit',
  fontSize: '0.95rem',
  fontWeight: 700,
  cursor: 'pointer',
}
