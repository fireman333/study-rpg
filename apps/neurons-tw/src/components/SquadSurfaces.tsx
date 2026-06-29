/**
 * Squad surfaces (redesign-neurons-homepage-squad-and-maze-focus).
 *
 * The editable squad picker moved OFF the crowded homepage INTO the 圖鑑
 * (/collection) tab, reusing the dex cards as the picker:
 *   - SquadPreview     — homepage READ-ONLY avatar-stack + 「到圖鑑編隊 →」link.
 *   - SquadManager     — top of /collection: a 5-slot manager (filled / empty
 *                        「選擇神經元」) with per-slot remove.
 *   - SquadCardAction  — per dex card: 「＋加入隊伍」/「✓已入隊」/「隊伍已滿」toggle.
 *
 * Data layer is UNCHANGED — every surface reads/writes the same `activeSquad`
 * meta envelope via ../lib/services/study-squad (no Dexie / R2 schema bump).
 *
 * Capability specs: neurons-study-squad + neurons-variant-collection-view (MODIFIED).
 */

import { Link } from 'react-router-dom'
import type { VariantRarity } from '../lib/db'
import {
  useActiveSquad,
  removeSquadMember,
  variantKey,
  MAX_SQUAD_SIZE,
} from '../lib/services/study-squad'
import VariantSprite from './VariantSprite'

const RARITY_COLOR: Record<VariantRarity, string> = {
  P0: '#a64dd4',
  P1: '#d4a04d',
  P2: '#c44d4d',
  P3: '#6a8c3f',
  P4: '#6a9bc4',
  P5: '#9b9b9b',
}

/**
 * SquadPreview — the homepage's READ-ONLY squad surface (replaces the old editable
 * StudySquadPanel). A compact avatar-stack of the ≤ MAX_SQUAD_SIZE members + a link
 * to the /collection editor. No add/remove affordance lives here.
 */
export function SquadPreview(): JSX.Element {
  const squad = useActiveSquad()
  return (
    <section style={previewStyle} aria-label="神經元遠征隊">
      <span style={previewTitleStyle}>🧫 神經元遠征隊</span>
      {squad.length === 0 ? (
        <span style={previewEmptyStyle}>還沒組隊 — 選 5 隻神經元代表你的答題隊伍</span>
      ) : (
        <span style={previewStackStyle}>
          {squad.map((row) => (
            <span key={variantKey(row.familyId, row.slotIndex)} title={row.displayName} style={previewSpriteWrapStyle}>
              <VariantSprite row={row} size={34} />
            </span>
          ))}
          <span style={previewCountStyle}>
            {squad.length} / {MAX_SQUAD_SIZE}
          </span>
        </span>
      )}
      <Link to="/collection?squad=1" style={previewLinkStyle}>
        到圖鑑編隊 →
      </Link>
    </section>
  )
}

/**
 * SquadManager — the editing home at the top of /collection. A fixed row of
 * MAX_SQUAD_SIZE slots: filled = sprite + name + rarity + remove ×; empty = dashed
 * 「選擇神經元」placeholder. `id="squad-manager"` is the `?squad=1` scroll target.
 */
export function SquadManager(): JSX.Element {
  const squad = useActiveSquad()
  const slots = Array.from({ length: MAX_SQUAD_SIZE }, (_, i) => squad[i] ?? null)
  return (
    <section id="squad-manager" style={managerStyle} aria-label="神經元遠征隊編隊">
      <div style={managerHeaderStyle}>
        <span style={managerTitleStyle}>🧫 神經元遠征隊</span>
        <span style={managerSubtitleStyle}>選 {MAX_SQUAD_SIZE} 隻代表你的答題隊伍 — 點下方圖鑑卡片加入</span>
        <span style={managerCountStyle}>
          {squad.length} / {MAX_SQUAD_SIZE}
        </span>
      </div>
      <div style={slotRowStyle}>
        {slots.map((row, i) =>
          row ? (
            <div
              key={variantKey(row.familyId, row.slotIndex)}
              style={filledSlotStyle(RARITY_COLOR[row.rarity])}
            >
              <VariantSprite row={row} size={48} />
              <span style={slotNameStyle}>{row.displayName}</span>
              <span style={{ ...slotRarityStyle, color: RARITY_COLOR[row.rarity], borderColor: RARITY_COLOR[row.rarity] }}>
                {row.rarity}
              </span>
              <button
                type="button"
                style={removeBtnStyle}
                aria-label={`將 ${row.displayName} 移出隊伍`}
                title="移出隊伍"
                onClick={() => void removeSquadMember(row.familyId, row.slotIndex)}
              >
                ×
              </button>
            </div>
          ) : (
            <div key={`empty-${i}`} style={emptySlotStyle} aria-label="空隊伍格">
              <span style={emptySlotPlusStyle} aria-hidden>
                ＋
              </span>
              <span style={emptySlotLabelStyle}>選擇神經元</span>
            </div>
          ),
        )}
      </div>
    </section>
  )
}

/**
 * SquadCardAction — the per dex-card squad toggle (top-right corner). Always
 * visible (no edit mode). `onToggle` is the page handler: add when free, remove
 * when a member, or surface the「先移除一隻」hint when full (the full button stays
 * clickable so the hint can fire — it is not DOM-disabled).
 */
export function SquadCardAction({
  inSquad,
  full,
  onToggle,
}: {
  inSquad: boolean
  /** Squad is at MAX_SQUAD_SIZE and this card is NOT a member. */
  full: boolean
  onToggle: () => void
}): JSX.Element {
  const label = inSquad ? '✓ 已入隊' : full ? '隊伍已滿' : '＋ 加入隊伍'
  const style = inSquad ? squadActionInStyle : full ? squadActionFullStyle : squadActionAddStyle
  return (
    <button
      type="button"
      style={style}
      aria-pressed={inSquad}
      aria-disabled={full && !inSquad}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      title={inSquad ? '點擊移出隊伍' : full ? '隊伍已滿，先移除一隻再加入' : '加入神經元遠征隊'}
    >
      {label}
    </button>
  )
}

// ─── SquadPreview styles (homepage, read-only) ─────────────────────────────────

const previewStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.55rem',
  background: 'linear-gradient(135deg, #fdf2e8 0%, #f5e6d3 100%)',
  border: '2px solid #d4a04d',
  borderRadius: '8px',
  padding: '0.55rem 0.85rem',
  marginBottom: '1rem',
  boxShadow: '0 2px 6px rgba(212, 160, 77, 0.15)',
}

const previewTitleStyle: React.CSSProperties = {
  fontSize: '0.92rem',
  fontWeight: 700,
  color: '#5a3f29',
}

const previewStackStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
}

const previewSpriteWrapStyle: React.CSSProperties = {
  display: 'inline-flex',
  width: 34,
  height: 34,
}

const previewCountStyle: React.CSSProperties = {
  marginLeft: '0.3rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#8c6d4a',
}

const previewEmptyStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#8c6d4a',
}

const previewLinkStyle: React.CSSProperties = {
  marginLeft: 'auto',
  padding: '0.3rem 0.7rem',
  borderRadius: '6px',
  border: '1px solid #c4a878',
  background: '#fff',
  color: '#8c6d4a',
  fontSize: '0.82rem',
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

// ─── SquadManager styles (collection top) ──────────────────────────────────────

const managerStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fdf2e8 0%, #f5e6d3 100%)',
  border: '2px solid #d4a04d',
  borderRadius: '8px',
  padding: '0.75rem 0.9rem',
  marginBottom: '1rem',
  boxShadow: '0 2px 6px rgba(212, 160, 77, 0.15)',
}

const managerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginBottom: '0.6rem',
}

const managerTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#5a3f29',
}

const managerSubtitleStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#8c6d4a',
}

const managerCountStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: '0.85rem',
  fontWeight: 700,
  color: '#8c6d4a',
}

const slotRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
}

function filledSlotStyle(accent: string): React.CSSProperties {
  return {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.2rem',
    width: 'clamp(96px, 18vw, 120px)',
    padding: '0.45rem 0.4rem 0.5rem',
    background: '#fff',
    border: `2px solid ${accent}`,
    borderRadius: '8px',
  }
}

const slotNameStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#3a2a1a',
  textAlign: 'center',
  lineHeight: 1.2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
}

const slotRarityStyle: React.CSSProperties = {
  fontSize: '0.64rem',
  fontWeight: 700,
  padding: '0 0.3rem',
  borderRadius: '999px',
  border: '1px solid',
  background: '#fdf6e3',
}

const removeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 4,
  width: 20,
  height: 20,
  lineHeight: '18px',
  textAlign: 'center',
  borderRadius: '999px',
  border: '1px solid #c44d4d',
  background: '#fff',
  color: '#c44d4d',
  fontSize: '0.85rem',
  fontWeight: 700,
  cursor: 'pointer',
  padding: 0,
}

const emptySlotStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.2rem',
  width: 'clamp(96px, 18vw, 120px)',
  minHeight: 96,
  padding: '0.45rem',
  background: 'rgba(255, 255, 255, 0.35)',
  border: '2px dashed #c4a878',
  borderRadius: '8px',
  color: '#a8895c',
}

const emptySlotPlusStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 700,
}

const emptySlotLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
}

// ─── SquadCardAction styles (per dex card) ─────────────────────────────────────

const squadActionBaseStyle: React.CSSProperties = {
  padding: '0.2rem 0.5rem',
  borderRadius: '999px',
  fontSize: '0.72rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const squadActionAddStyle: React.CSSProperties = {
  ...squadActionBaseStyle,
  background: '#fff',
  color: '#4d8c4d',
  border: '1.5px solid #4d8c4d',
}

const squadActionInStyle: React.CSSProperties = {
  ...squadActionBaseStyle,
  background: '#e8f5e8',
  color: '#2f6b2f',
  border: '1.5px solid #4d8c4d',
}

const squadActionFullStyle: React.CSSProperties = {
  ...squadActionBaseStyle,
  background: '#ece3d0',
  color: '#a89074',
  border: '1px solid #d3c4a4',
}
