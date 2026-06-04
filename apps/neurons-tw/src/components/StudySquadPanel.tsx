/**
 * Study-squad party panel on the connectome homepage (add-neurons-study-squad).
 *
 * Renders the active squad as a party row + a collapsible editor to assemble the
 * squad from collected variants (≤ MAX_SQUAD_SIZE). Empty squad → an
 * assemble-your-squad placeholder. The 出征 action itself now lives in the
 * homepage CTA toolbar (promote-maze-to-home); this panel is the squad-assembly
 * surface (the assembled squad still deploys + cheers during the 出征 drill).
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

export default function StudySquadPanel(): JSX.Element {
  const squad = useActiveSquad()
  const collected = useCollectedVariants()
  const [editing, setEditing] = useState(false)
  const squadKeys = useMemo(
    () => new Set(squad.map((r) => variantKey(r.familyId, r.slotIndex))),
    [squad],
  )
  const full = squad.length >= MAX_SQUAD_SIZE

  return (
    <section style={panelStyle} aria-label="神經元遠征隊">
      <div style={headerRowStyle}>
        <span style={titleStyle}>🧫 神經元遠征隊</span>
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
            ? '先去答題收集你的第一隻 neuron，就能組神經元遠征隊。'
            : '還沒組隊 — 點「編輯隊伍」挑出你的 neuron 一起出征、答對時一起歡呼，也會在迷宮動畫帶行進。'}
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
