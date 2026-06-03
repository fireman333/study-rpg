/**
 * HomepageOnboarding — brief, skippable first-visit guide for the homepage core
 * loop. One-tap dismiss persists `meta['homepageOnboardingDismissed'] = 'true'`
 * so it never reappears (including after F5). The DEV reset path
 * (`resetConnectomeForDebug`) clears the flag so a reset user sees it again.
 *
 * The existing `/connectome` empty-state callout is intentionally left in place
 * (it serves users who land directly on `/connectome`); these do not conflict.
 *
 * Spec: openspec/specs/neurons-homepage/spec.md
 *   "Homepage SHALL surface a one-tap-dismissable first-visit onboarding that
 *    never reappears once dismissed"
 */

import { useEffect, useState } from 'react'
import { db, HOMEPAGE_ONBOARDING_DISMISSED_KEY } from '../lib/db'

type Visibility = 'loading' | 'shown' | 'hidden'

export function HomepageOnboarding(): JSX.Element | null {
  const [vis, setVis] = useState<Visibility>('loading')

  useEffect(() => {
    let disposed = false
    db.meta
      .get(HOMEPAGE_ONBOARDING_DISMISSED_KEY)
      .then((row) => {
        if (disposed) return
        setVis(row?.value === 'true' ? 'hidden' : 'shown')
      })
      .catch(() => {
        // On read failure, fail closed (don't nag): treat as hidden.
        if (!disposed) setVis('hidden')
      })
    return () => {
      disposed = true
    }
  }, [])

  const dismiss = (): void => {
    setVis('hidden')
    void db.meta
      .put({ key: HOMEPAGE_ONBOARDING_DISMISSED_KEY, value: 'true' })
      .catch((err) => console.warn('[HomepageOnboarding] persist dismiss failed:', err))
  }

  if (vis !== 'shown') return null

  return (
    <section role="region" aria-label="新手指引" style={cardStyle}>
      <button type="button" onClick={dismiss} aria-label="關閉新手指引" style={closeBtnStyle}>
        ×
      </button>
      <strong style={openerStyle}>👋 歡迎！這裡只要像考生一樣唸書 + 做題</strong>
      <ol style={stepsStyle}>
        <li>
          <strong>📖 開始閱讀</strong>：按計時器累積閱讀時間，每 30 分鐘換一次 DMN 抽卡。
        </li>
        <li>
          <strong>🎲 答題</strong>：跨 family 隨機練，或點下方科目卡指定範圍。答對讓該 family 放電（fire）。
        </li>
        <li>
          <strong>🔗 自動長出連線</strong>：同一天兩個 family 各答對 5 題，就在上方 connectome 長出 synapse —
          規則不用背，畫面會替你呈現。
        </li>
      </ol>
      <button type="button" onClick={dismiss} style={ctaStyle}>
        知道了，開始 →
      </button>
    </section>
  )
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  background: 'linear-gradient(135deg, #fdf2e8 0%, #f5e6d3 100%)',
  border: '2px solid #d4a04d',
  borderRadius: '8px',
  padding: '0.9rem 1.1rem',
  marginBottom: '1rem',
  boxShadow: '0 2px 6px rgba(212, 160, 77, 0.15)',
}

const openerStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '1.02rem',
  color: '#5a3f29',
  marginBottom: '0.45rem',
}

const stepsStyle: React.CSSProperties = {
  margin: '0 0 0.6rem',
  paddingLeft: '1.2rem',
  fontSize: '0.9rem',
  lineHeight: 1.6,
  color: '#3a2a1a',
}

const ctaStyle: React.CSSProperties = {
  padding: '0.45rem 1rem',
  borderRadius: '6px',
  border: '1px solid #b8893a',
  background: '#d4a04d',
  color: '#fff',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: '0.4rem',
  right: '0.5rem',
  background: 'transparent',
  border: 'none',
  fontSize: '1.3rem',
  lineHeight: 1,
  color: '#8c6d4a',
  cursor: 'pointer',
  padding: '0.1rem 0.3rem',
}
