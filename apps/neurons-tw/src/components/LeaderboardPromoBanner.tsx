/**
 * LeaderboardPromoBanner — dismissible promo on OverviewPage promoting the
 * leaderboard tab. Versioned localStorage key (`-v1`) so future major changes
 * can force re-appearance by bumping the suffix.
 *
 * Spec: openspec/specs/neurons-leaderboard/spec.md
 *   "HomePage promo banner SHALL surface leaderboard discovery on first visit"
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmojiIcon } from './EmojiIcon'

const DISMISS_KEY = 'neurons-leaderboard-promo-banner-dismissed-v1'

export default function LeaderboardPromoBanner(): JSX.Element | null {
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      const value = window.localStorage.getItem(DISMISS_KEY)
      setDismissed(value === 'true')
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
        <div style={headlineStyle}><EmojiIcon char="🏆" size={18} /> 加入 neurons-tw 排行榜</div>
        <div style={subStyle}>
          看你的變體收集進度、AP 累積、探索進度在所有玩家中排第幾名
        </div>
      </div>
      <div style={actionsStyle}>
        <Link to="/leaderboard" style={ctaStyle}>
          前往排名
        </Link>
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
  borderRadius: '4px',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '0.85rem',
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
