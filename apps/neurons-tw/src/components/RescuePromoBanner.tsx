/**
 * RescuePromoBanner — dismissible promo on OverviewPage. Repurposed
 * (add-neurons-exam-prep-hub) from a standalone 考前救急 promo into a 考前中心 hub
 * entry banner: it now advertises the consolidated hub (猜題 / 講義 / 救急 / 五分鐘速看)
 * and navigates to `/cram` rather than opening a duplicate rescue overlay. The homepage
 * rescue CTA + FamilyPicker header entry + `?rescue=` return-loop are untouched.
 *
 * Versioned localStorage key bumped `-v1` → `-v2` so the new hub message surfaces once
 * to users who dismissed the old rescue-only banner.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmojiIcon } from './EmojiIcon'

const DISMISS_KEY = 'neurons-rescue-promo-banner-dismissed-v2'

export default function RescuePromoBanner(): JSX.Element | null {
  const navigate = useNavigate()
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
          <EmojiIcon char="🎯" size={18} /> 考前中心：猜題・講義・救急・五分鐘速看，一站到齊
        </div>
        <div style={subStyle}>
          臨考前把該做的事一次做完 —— 各科考點整理與速看、單元講義、鎖科救急、五分鐘掃描，都在題庫 →「考前中心」。
        </div>
      </div>
      <div style={actionsStyle}>
        <button type="button" onClick={() => navigate('/cram')} style={ctaStyle}>
          前往考前中心
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
