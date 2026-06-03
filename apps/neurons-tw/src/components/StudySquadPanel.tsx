/**
 * Study-squad party panel on the connectome homepage (add-neurons-study-squad).
 *
 * Renders the active squad as a party row + an 出征 action that drills the
 * player's cross-subject wrong questions, plus a collapsible editor to assemble
 * the squad from collected variants (≤ MAX_SQUAD_SIZE). Empty squad → an
 * assemble-your-squad placeholder. The 出征 QuizModal itself is owned by
 * OverviewPage (it holds the pack + pool); this panel only signals intent.
 *
 * Capability spec: openspec/specs/neurons-study-squad/spec.md
 */

import { useEffect, useMemo, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, type NeuronVariantRow } from '../lib/db'
import {
  addSquadMember,
  removeSquadMember,
  useActiveSquad,
  variantKey,
  MAX_SQUAD_SIZE,
} from '../lib/services/study-squad'
import VariantSprite from './VariantSprite'

interface Props {
  /** Count of cross-subject wrong questions (gates the 出征 button). */
  expeditionCount: number
  /** Open the 出征 drill (OverviewPage owns the QuizModal). */
  onExpedition: () => void
}

function useCollectedVariants(): NeuronVariantRow[] {
  const [rows, setRows] = useState<NeuronVariantRow[]>([])
  useEffect(() => {
    const sub = liveQuery(() => db.neuronVariants.orderBy('familyId').toArray()).subscribe({
      next: (val) => setRows(val),
      error: () => setRows([]),
    })
    return () => sub.unsubscribe()
  }, [])
  return rows
}

export default function StudySquadPanel({ expeditionCount, onExpedition }: Props): JSX.Element {
  const squad = useActiveSquad()
  const collected = useCollectedVariants()
  const [editing, setEditing] = useState(false)
  const squadKeys = useMemo(
    () => new Set(squad.map((r) => variantKey(r.familyId, r.slotIndex))),
    [squad],
  )
  const full = squad.length >= MAX_SQUAD_SIZE

  return (
    <section style={panelStyle} aria-label="出戰隊伍">
      <div style={headerRowStyle}>
        <span style={titleStyle}>🧫 出戰隊伍</span>
        <span style={countStyle}>
          {squad.length} / {MAX_SQUAD_SIZE}
        </span>
        {collected.length > 0 && (
          <button
            type="button"
            style={editToggleStyle}
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
          >
            {editing ? '完成' : '編輯隊伍'}
          </button>
        )}
      </div>

      {squad.length === 0 ? (
        <p style={placeholderStyle}>
          {collected.length === 0
            ? '先去答題收集你的第一隻 neuron，就能組出戰隊伍。'
            : '還沒組隊 — 點「編輯隊伍」挑出你的 neuron 一起出征、答對時一起歡呼。'}
        </p>
      ) : (
        <div style={partyRowStyle}>
          {squad.map((row) => (
            <span key={variantKey(row.familyId, row.slotIndex)} title={row.displayName}>
              <VariantSprite row={row} size={52} />
            </span>
          ))}
        </div>
      )}

      <div style={actionRowStyle}>
        <button
          type="button"
          style={expeditionCount > 0 ? expeditionButtonStyle : expeditionButtonDisabledStyle}
          onClick={onExpedition}
          disabled={expeditionCount === 0}
          aria-label="出征：全科錯題練習"
          title={
            expeditionCount > 0
              ? `對你目前未答對的 ${expeditionCount} 題出征`
              : '目前沒有未答對的題目'
          }
        >
          ⚔️ 出征 · 全科錯題
          <span style={expeditionCountBadgeStyle}>{expeditionCount} 題</span>
        </button>
        {expeditionCount === 0 && (
          <span style={emptyHintStyle}>目前沒有未答對的題目 — 先去答題吧。</span>
        )}
      </div>

      {editing && (
        <div style={editorStyle}>
          <p style={editorHintStyle}>
            點變體加入 / 移出隊伍（最多 {MAX_SQUAD_SIZE} 隻）。
          </p>
          <div style={editorGridStyle}>
            {collected.map((row) => {
              const key = variantKey(row.familyId, row.slotIndex)
              const inSquad = squadKeys.has(key)
              const disabled = !inSquad && full
              return (
                <button
                  key={key}
                  type="button"
                  style={{
                    ...variantPickStyle,
                    ...(inSquad ? variantPickActiveStyle : {}),
                    ...(disabled ? variantPickDisabledStyle : {}),
                  }}
                  onClick={() => {
                    if (inSquad) void removeSquadMember(row.familyId, row.slotIndex)
                    else void addSquadMember(row.familyId, row.slotIndex)
                  }}
                  disabled={disabled}
                  aria-pressed={inSquad}
                  title={`${row.displayName}${inSquad ? '（在隊伍中）' : disabled ? '（隊伍已滿）' : ''}`}
                >
                  <VariantSprite row={row} size={40} />
                  <span style={variantPickNameStyle}>{row.displayName}</span>
                  {inSquad && <span style={inSquadBadgeStyle}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fdf2e8 0%, #f5e6d3 100%)',
  border: '2px solid #d4a04d',
  borderRadius: '8px',
  padding: '0.85rem 1rem',
  marginBottom: '1rem',
  boxShadow: '0 2px 6px rgba(212, 160, 77, 0.15)',
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  marginBottom: '0.5rem',
}

const titleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#5a3f29',
}

const countStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#8c6d4a',
  fontWeight: 600,
}

const editToggleStyle: React.CSSProperties = {
  marginLeft: 'auto',
  padding: '0.3rem 0.7rem',
  borderRadius: '6px',
  border: '1px solid #c4a878',
  background: 'transparent',
  color: '#8c6d4a',
  fontSize: '0.82rem',
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
}

const placeholderStyle: React.CSSProperties = {
  margin: '0.25rem 0 0.6rem',
  fontSize: '0.88rem',
  lineHeight: 1.55,
  color: '#5a3f29',
}

const partyRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
  marginBottom: '0.6rem',
}

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.5rem',
}

const expeditionButtonStyle: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  borderRadius: '6px',
  border: '1px solid #b8893a',
  background: '#d4a04d',
  color: '#fff',
  fontSize: '0.98rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
}

const expeditionButtonDisabledStyle: React.CSSProperties = {
  ...expeditionButtonStyle,
  background: '#cdbfa6',
  border: '1px solid #b8a98c',
  cursor: 'not-allowed',
  boxShadow: 'none',
}

const expeditionCountBadgeStyle: React.CSSProperties = {
  padding: '0.1rem 0.45rem',
  background: 'rgba(255,255,255,0.25)',
  borderRadius: '999px',
  fontSize: '0.78em',
  fontWeight: 600,
}

const emptyHintStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  color: '#8c6d4a',
}

const editorStyle: React.CSSProperties = {
  marginTop: '0.7rem',
  paddingTop: '0.6rem',
  borderTop: '1px dashed #d4b88a',
}

const editorHintStyle: React.CSSProperties = {
  margin: '0 0 0.5rem',
  fontSize: '0.82rem',
  color: '#8c6d4a',
}

const editorGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: '0.45rem',
}

const variantPickStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.35rem 0.5rem',
  borderRadius: '6px',
  border: '1px solid #d4c4a0',
  background: '#fdf8ee',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  position: 'relative',
}

const variantPickActiveStyle: React.CSSProperties = {
  border: '2px solid #4d8c4d',
  background: '#e8f5e8',
}

const variantPickDisabledStyle: React.CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
}

const variantPickNameStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#3a2a1a',
  lineHeight: 1.2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const inSquadBadgeStyle: React.CSSProperties = {
  marginLeft: 'auto',
  color: '#4d8c4d',
  fontWeight: 700,
}
