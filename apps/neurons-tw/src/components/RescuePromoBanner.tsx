/**
 * RescuePromoBanner — dismissible promo on OverviewPage surfacing the 考前救急
 * (last-minute exam rescue) mode. Versioned localStorage key (`-v1`) so future
 * major copy changes can force re-appearance by bumping the suffix.
 *
 * Rescue is a full-screen overlay (not a route), so the CTA calls back into
 * OverviewPage's openRescue() rather than navigating.
 *
 * Spec: openspec/specs/neurons-single-subject-rescue/spec.md
 *   "Homepage SHALL surface an always-on 考前救急 entry"
 */

import { useEffect, useState } from 'react'
import { EmojiIcon } from './EmojiIcon'

const DISMISS_KEY = 'neurons-rescue-promo-banner-dismissed-v1'

interface Props {
  /** Opens the rescue overview (OverviewPage.openRescue with no family). */
  onOpen: () => void
}

export default function RescuePromoBanner({ onOpen }: Props): JSX.Element | null {
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === 'true')
    } catch {
      // localStorage unavailable (private mode / disabled) — treat as not-dismissed.
      setDismissed(false)
    }
  }, [])

  if (dismissed === null) return null
  if (dismissed) return null

  const handleDismiss = (): void => {
    try {
      window.localStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // Persistence failed — still hide for current page lifetime via state.
    }
    setDismissed(true)
  }

  return (
    <div style={bannerStyle}>
      <div style={textBlockStyle}>
        <div style={headlineStyle}>
          <EmojiIcon char="⏱️" size={18} /> 考前救急：鎖科目，把時間花在最能救分的題
        </div>
        <div style={subStyle}>
          綁定考試日與每天可讀分鐘，系統每天排出最高投報率的錯題；多科可並存。詳見右上{' '}
          <EmojiIcon char="❓" size={13} decorative /> →「考前救急」。
        </div>
      </div>
      <div style={actionsStyle}>
        <button type="button" onClick={onOpen} style={ctaStyle}>
          開始救急
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="關閉橫幅"
          style={dismissStyle}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// Styles mirror LeaderboardPromoBanner (cream/brown pixel aesthetic, hard shadow).
const bannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  flexWrap: 'wrap',
  background: '#fdf6e3',
  border: '2px solid #5a3f29',
  borderRadius: '4px',
  padding: '0.7rem 0.9rem',
  marginBottom: '1rem',
  boxShadow: '4px 4px 0 #5a3f29',
  fontFamily: 'var(--font-pixel-cjk)',
}

const textBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  flex: '1 1 auto',
  minWidth: '12rem',
}

const headlineStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#5a3f29',
}

const subStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#8c6d4a',
}

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
}

const ctaStyle: React.CSSProperties = {
  padding: '0.4rem 0.85rem',
  background: '#b58900',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const dismissStyle: React.CSSProperties = {
  width: '1.8rem',
  height: '1.8rem',
  background: 'transparent',
  border: '1.5px solid #8c6d4a',
  borderRadius: '4px',
  color: '#5a3f29',
  cursor: 'pointer',
  fontSize: '0.9rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
}
