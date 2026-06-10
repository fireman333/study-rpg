## Why

Owner feedback after the `redesign-neurons-homepage-cta` ship: on iPhone the merged daily-loop stat card's horizontal three-stage + arrow layout collapses badly — at 375px it wraps into ~4 visual rows with the `→` arrows orphaned on their own lines, mis-aligned with the stages (measured: stages at top 294/359, arrows stranded at 311/382). The page doesn't horizontally overflow, but the in-card layout degrades into a messy pile. Separately, the owner wants the three total-collection chips (🧬 變體 / 💎 DMN X/20 / 📖 累積閱讀) folded INTO the same card (they were deliberately left outside in the original grill, now reversed), re-themed to the card's cream palette instead of the standalone dark "signal" strip.

## What Changes

- **Responsive causal-chain layout**: the card's three stages (今日出征狀態 → 修復連線數據 → DMN) stack **vertically on narrow screens** (< 520px) with the connector arrows rotating from `→` to `↓`, and lay out **horizontally** at ≥ 520px — driven by CSS media queries (no JS resize listener), so the arrows never orphan.
- **Fold the collection chips into the card**: 🧬 變體 / 💎 DMN X/20 / 📖 累積閱讀 move from the standalone dark status strip into the merged card as a bottom row, re-styled in the card's cream/brown theme, wrapping cleanly on narrow widths. The standalone `進度狀態` strip is removed.

No change to data, schema, sync, or the values shown — presentation only.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-homepage`: the "compose as a CTA toolbar…" requirement is updated so the total-collection progress chips (🧬 / 💎 / 📖) live **inside** the merged stat card (not as a separate strip), and the card's causal-chain body is **responsive** (vertical stack + ↓ arrows on narrow, horizontal + → on wide) so it never degrades into orphaned-arrow wrap on mobile.

## Impact

- **Code (presentation only)**: `apps/neurons-tw/src/components/ConnectomeStatCard.tsx` (responsive stage classes + fold-in chips + new props), `apps/neurons-tw/src/routes/OverviewPage.tsx` (remove the standalone `進度狀態` strip + its styles, pass the chip values as props), `apps/neurons-tw/src/styles.css` (media-query rules for the stage row + arrows).
- **No schema / sync impact**: zero Dexie / R2 / Worker change; `lint:dexie-fixtures` no-op.
