import { MOCK_RARITY_COLOR } from '@study-rpg/content-neurons-tw'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import type { MockRollResult } from '../lib/services/mock-variant-gacha'

// Post-submit reveal strip for the mock-exam variant roll
// (add-neurons-exam-set-mock-variants). Static one-shot — rendered once in the
// 模擬考試 results summary when a roll resolved (cap not spent).

export function MockVariantRevealBadge({ result }: { result: MockRollResult }): JSX.Element {
  const color = MOCK_RARITY_COLOR[result.rarity]
  const spriteUrl = SPRITE_MAP[result.spriteKey]
  return (
    <div style={{ ...wrapStyle, borderColor: color }} aria-live="polite">
      {spriteUrl ? (
        <img src={spriteUrl} alt="" style={spriteImgStyle} />
      ) : (
        <span style={glyphStyle} aria-hidden>
          🧬
        </span>
      )}
      <div>
        <p style={captionStyle}>
          {result.isNew ? '🎉 收集到新的模擬考神經元！' : '✨ 模擬考神經元 +1'}
        </p>
        <p style={nameStyle}>
          <span style={{ ...rarityStyle, color }}>{result.rarity}</span>
          {result.displayName}
          {!result.isNew && <span style={dupeStyle}>（第 {result.copies} 隻）</span>}
        </p>
      </div>
    </div>
  )
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  margin: '10px 0',
  padding: '8px 12px',
  border: '2px solid',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
}

const glyphStyle: React.CSSProperties = { fontSize: 28 }

const spriteImgStyle: React.CSSProperties = { width: 40, height: 40, imageRendering: 'pixelated' }

const captionStyle: React.CSSProperties = { margin: 0, fontSize: 13, opacity: 0.85 }

const nameStyle: React.CSSProperties = { margin: '2px 0 0', fontSize: 15, fontWeight: 700 }

const rarityStyle: React.CSSProperties = { fontWeight: 800, marginRight: 6 }

const dupeStyle: React.CSSProperties = { marginLeft: 6, fontSize: 12, opacity: 0.6 }
