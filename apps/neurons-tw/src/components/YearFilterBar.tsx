/**
 * YearFilterBar — homepage exam-year filter for the quiz pool.
 *
 * Mirrors 二階 YearFilterBar behaviorally (select-all chip + per-year chips,
 * null/[] = all), but inline-styled to match the neurons pixel aesthetic
 * (neurons has no shared `.filter-bar` CSS). 9 years (106–114) fit one row,
 * so no pager. Single source of truth = `quiz.yearFilter` meta.
 *
 * Spec: openspec/specs/neurons-quiz-year-filter/spec.md
 */

import { ALL_YEARS, effectiveYearSet, setYearFilter, useYearFilter } from '../lib/services/year-filter'

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
      <span style={labelStyle}>📅 年份</span>
      <div style={chipRowStyle} role="group" aria-label="民國年多選">
        <button
          type="button"
          style={allSelected ? chipActiveStyle : chipStyle}
          aria-pressed={allSelected}
          onClick={selectAll}
        >
          全部
        </button>
        {ALL_YEARS.map((year) => {
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
      <span style={countStyle}>
        {effective.size} / {ALL_YEARS.length} 年
      </span>
    </section>
  )
}

// ─── Styles (match OverviewPage cream/brown pixel aesthetic) ─────────────────

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
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

const countStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#8c6d4a',
  whiteSpace: 'nowrap',
}
