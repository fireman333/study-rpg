/**
 * FamilyFilterChips — 科目 + 稀有度 narrowing for the /collection dex page.
 *
 * Two stacked filter bars styled like the 收藏 tab's「依科目篩選」bar (a labelled
 * card with a wrapping chip row), both using the INCLUSION model that 收藏 / 題庫
 * use: an empty selection means 全部 shown; selecting one or more chips narrows the
 * view to just those. Each chip carries its own accent color — subject chips use the
 * per-subject `Subject.color`, rarity chips use the tier accent — so an included chip
 * fills with its color and an excluded chip is a dashed outline of it.
 *
 * Controlled: the parent owns both selection sets. Chips NARROW the view; they are
 * not a hard gate — default-empty preserves the full-dex completionist gestalt while
 * letting the player focus a family or a rarity tier. The bars carry NO visible count
 * (a count reads as a collection denominator — the dex hides catalog totals — and
 * crowds the bar on narrow viewports; improve-neurons-dex-filter-chips-rwd).
 *
 * Capability spec: openspec/specs/neurons-variant-collection-view/spec.md
 */

import { EmojiIcon } from './EmojiIcon'

export interface FamilyChipOption {
  id: string
  label: string
  /** Per-subject accent color (Subject.color) — drives the included/excluded chip fill. */
  color: string
}

export interface TierChipOption {
  id: string
  label: string
  /** Rarity accent color (RARITY_COLOR[tier]). */
  color: string
}

// Accent for the「全部」select-all chip (matches 收藏 / the homepage YearFilterBar gold).
const ALL_CHIP_COLOR = '#d4a04d'

export function FamilyFilterChips({
  families,
  selectedFamilies,
  onToggleFamily,
  onClearFamilies,
  tiers,
  selectedTiers,
  onToggleTier,
  onClearTiers,
}: {
  families: FamilyChipOption[]
  /** Empty set = 全部 (all families shown); otherwise only the selected families. */
  selectedFamilies: ReadonlySet<string>
  onToggleFamily: (familyId: string) => void
  onClearFamilies: () => void
  tiers: TierChipOption[]
  /** Empty set = 全部 (all rarities shown); otherwise only the selected rarities. */
  selectedTiers: ReadonlySet<string>
  onToggleTier: (tierId: string) => void
  onClearTiers: () => void
}): JSX.Element {
  const allFamilies = selectedFamilies.size === 0
  const allTiers = selectedTiers.size === 0

  return (
    <>
      {/* 科目 — inclusion model, click a subject to narrow (mirrors 收藏 tab). */}
      <section style={filterBarStyle} aria-label="科目篩選">
        <div style={filterHeaderStyle}>
          <span style={filterLabelStyle}><EmojiIcon char="🧬" size={14} /> 依科目篩選</span>
        </div>
        <div style={chipRowStyle} role="group" aria-label="神經元科目多選">
          <button
            type="button"
            onClick={onClearFamilies}
            style={allFamilies ? chipIncludedStyle(ALL_CHIP_COLOR) : chipExcludedStyle(ALL_CHIP_COLOR)}
            aria-pressed={allFamilies}
            title="顯示全部科目"
          >
            全部
          </button>
          {families.map((family) => {
            const on = selectedFamilies.has(family.id)
            return (
              <button
                key={family.id}
                type="button"
                onClick={() => onToggleFamily(family.id)}
                style={on ? chipIncludedStyle(family.color) : chipExcludedStyle(family.color)}
                aria-pressed={on}
                title={on ? `取消只看 ${family.label}` : `只看 ${family.label}`}
              >
                {family.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* 稀有度 — inclusion model, P0→P5, tier-colored chips. */}
      <section style={filterBarStyle} aria-label="稀有度篩選">
        <div style={filterHeaderStyle}>
          <span style={filterLabelStyle}><EmojiIcon char="✨" size={14} /> 依稀有度篩選</span>
        </div>
        <div style={chipRowStyle} role="group" aria-label="神經元稀有度多選">
          <button
            type="button"
            onClick={onClearTiers}
            style={allTiers ? chipIncludedStyle(ALL_CHIP_COLOR) : chipExcludedStyle(ALL_CHIP_COLOR)}
            aria-pressed={allTiers}
            title="顯示全部稀有度"
          >
            全部
          </button>
          {tiers.map((tier) => {
            const on = selectedTiers.has(tier.id)
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => onToggleTier(tier.id)}
                style={on ? chipIncludedStyle(tier.color) : chipExcludedStyle(tier.color)}
                aria-pressed={on}
                title={on ? `取消只看 ${tier.label}` : `只看 ${tier.label}`}
              >
                {tier.label}
              </button>
            )
          })}
        </div>
      </section>
    </>
  )
}

// ─── Styles (match the 收藏 tab filter bar: cream/brown pixel card + colored chips) ─

const filterBarStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  padding: '0.7rem 0.85rem',
  marginTop: '0.6rem',
  borderRadius: '4px',
}

const filterHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.5rem',
}

const filterLabelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#3a2a1a',
  fontWeight: 700,
}

// Chips flow freely into as many rows as they need (no max-row cap, no horizontal overflow).
const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
}

function chipIncludedStyle(color: string): React.CSSProperties {
  return {
    padding: '0.25rem 0.6rem',
    background: color,
    color: '#fff',
    border: `1px solid ${color}`,
    borderRadius: '999px',
    fontSize: '0.78rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  }
}

function chipExcludedStyle(color: string): React.CSSProperties {
  return {
    padding: '0.25rem 0.6rem',
    background: 'transparent',
    color: '#8c6d4a',
    border: `1px dashed ${color}`,
    borderRadius: '999px',
    fontSize: '0.78rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    opacity: 0.55,
  }
}
