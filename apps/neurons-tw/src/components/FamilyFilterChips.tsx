/**
 * FamilyFilterChips — family narrowing for the /collection dex page.
 *
 * Mirrors YearFilterBar (select-all chip + per-family chips, default = all
 * shown). Controlled: parent owns the `visible` set. Chips NARROW the view;
 * they are not a gate — default-all preserves the full-dex completionist
 * gestalt while remaining future-proof if variant count ever grows.
 *
 * Capability spec: openspec/specs/neurons-variant-collection-view/spec.md
 */

import { EmojiIcon } from './EmojiIcon'

export interface FamilyChipOption {
  id: string
  label: string
}

export function FamilyFilterChips({
  families,
  visible,
  onToggle,
  onSelectAll,
}: {
  families: FamilyChipOption[]
  visible: ReadonlySet<string>
  onToggle: (familyId: string) => void
  onSelectAll: () => void
}): JSX.Element {
  const allSelected = visible.size === families.length

  return (
    <section style={barStyle} aria-label="科別篩選">
      <span style={labelStyle}><EmojiIcon char="🧬" size={14} /> 科別</span>
      <div style={chipRowStyle} role="group" aria-label="神經元科別多選">
        <button
          type="button"
          style={allSelected ? chipActiveStyle : chipStyle}
          aria-pressed={allSelected}
          onClick={onSelectAll}
        >
          全部
        </button>
        {families.map((family) => {
          const on = visible.has(family.id)
          return (
            <button
              key={family.id}
              type="button"
              style={on ? chipActiveStyle : chipStyle}
              aria-pressed={on}
              onClick={() => onToggle(family.id)}
            >
              {family.label}
            </button>
          )
        })}
      </div>
      {/* No `X / N 科` visible-count — it read as a collection denominator (the dex hides totals)
          and crowded the bar on narrow viewports (improve-neurons-dex-filter-chips-rwd). */}
    </section>
  )
}

// ─── Styles (match OverviewPage cream/brown pixel aesthetic, like YearFilterBar) ─

// Chips flow freely into as many rows as they need (flexWrap on the bar + the chip row; no
// max-row cap, no horizontal overflow). Label top-aligns so it doesn't float at the vertical
// center of a multi-row chip block on narrow widths (mirrors YearFilterBar).
const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginTop: '0.6rem',
  padding: '0.5rem 0.7rem',
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#3a2a1a',
  paddingTop: '0.18rem',
  whiteSpace: 'nowrap',
}

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.35rem',
  flex: 1,
}

const chipStyle: React.CSSProperties = {
  padding: '0.2rem 0.55rem',
  background: 'transparent',
  color: '#8c6d4a',
  border: '1px dashed #b8893a',
  borderRadius: '999px',
  fontSize: '0.78rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  opacity: 0.7,
}

const chipActiveStyle: React.CSSProperties = {
  ...chipStyle,
  background: '#d4a04d',
  color: '#fff',
  border: '1px solid #b8893a',
  opacity: 1,
}
