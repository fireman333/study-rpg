/**
 * YearFilterBar — homepage exam-year filter for the quiz pool.
 *
 * Mirrors 二階 YearFilterBar behaviorally (select-all chip + per-year chips,
 * null/[] = all), but inline-styled to match the neurons pixel aesthetic
 * (neurons has no shared `.filter-bar` CSS). 12 years (104–115) shown newest-first
 * as flat tags that wrap (no count, no pager). Single source of truth =
 * `quiz.yearFilter` meta.
 *
 * Spec: openspec/specs/neurons-quiz-year-filter/spec.md
 */

import { ALL_YEARS, effectiveYearSet, setYearFilter, useYearFilter } from '../lib/services/year-filter'
import { EmojiIcon } from './EmojiIcon'

export function YearFilterBar(): JSX.Element {
  const persisted = useYearFilter()
  const effective = effectiveYearSet(persisted)
  const allSelected = effective.size === ALL_YEARS.length

  function toggleYear(year: number): void {
    const next = new Set(effective)
    if (next.has(year)) next.delete(year)
    else next.add(year)
    void setYearFilter([...next])
  }

  function selectAll(): void {
    void setYearFilter([...ALL_YEARS])
  }

  return (
    <section style={barStyle} aria-label="年份篩選">
      <span style={labelStyle}><EmojiIcon char="📅" size={13} decorative /> 年份</span>
      <div style={chipRowStyle} role="group" aria-label="民國年多選">
        <button
          type="button"
          style={allSelected ? chipActiveStyle : chipStyle}
          aria-pressed={allSelected}
          onClick={selectAll}
        >
          全部
        </button>
        {/* Newest year first (owner) — display order only; ALL_YEARS / the filter set
            stay ascending. */}
        {[...ALL_YEARS].reverse().map((year) => {
          const on = effective.has(year)
          return (
            <button
              key={year}
              type="button"
              style={on ? chipActiveStyle : chipStyle}
              aria-pressed={on}
              onClick={() => toggleYear(year)}
            >
              {year}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ─── Styles (match OverviewPage cream/brown pixel aesthetic) ─────────────────

// Lightweight, flat layout (owner: the bordered cream box + dashed gold pills read
// too heavy now that 12 years wrap to 3 rows). No box — the bar sits directly on the
// FamilyPicker card; chips are flat tinted tags (selected = solid gold).
const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  gap: '0.4rem',
  margin: '0.4rem 0 0.2rem',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#6b5535',
  // Top-align so the row label + count don't float at the vertical center of a
  // multi-row wrapped chip block on narrow (iPhone) widths.
  alignSelf: 'flex-start',
  paddingTop: '0.18rem',
}

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.3rem',
  flex: 1,
}

const chipStyle: React.CSSProperties = {
  padding: '0.13rem 0.5rem',
  background: 'rgba(140,109,74,0.12)',
  color: '#7a6038',
  border: 'none',
  borderRadius: '5px',
  fontSize: '0.74rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const chipActiveStyle: React.CSSProperties = {
  ...chipStyle,
  background: '#d4a04d',
  color: '#fff',
}
