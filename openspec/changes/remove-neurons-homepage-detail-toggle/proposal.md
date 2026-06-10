## Why

On the homepage merged daily-loop stat card (`ConnectomeStatCard.tsx`), the 「▾ 詳細」 disclosure reveals 本週 X/7 (always present) + 最強 pair (only when set) + ⚡今日連線額外能量 (only when > 0). For the common early-player case (no cross-subject links yet), the latter two are empty, so expanding the disclosure shows **only** 本週 X/7 — a single trivial line. The collapse costs a click to reveal one line and adds UI cruft with no payoff.

## What Changes

- Remove the 「▾ 詳細 / ▴ 收合」 toggle button and its `showDetail` state from the stat card.
- Promote 本週 X/7 to an **always-visible core signal** (out of the disclosure).
- Render 最強 pair and ⚡今日連線額外能量 **inline only when they have values** (same conditional logic, no longer gated behind a toggle; absent values take no space).
- **No signal is removed** — everything previously disclosed is now either always-shown (本週 X/7) or shown-inline-when-present (最強 pair / ⚡今日連線).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-homepage`: the stat-card composition requirement changes — the card SHALL show 本週 X/7 as a default-visible core signal and SHALL show 最強 pair / ⚡今日連線額外能量 inline when present, and SHALL NOT render a 「詳細」 disclosure toggle. (Replaces the prior "default-show core signals with an expandable 「詳細」 disclosure for the remaining signals (最強 pair・本週 X/7・⚡今日連線額外能量)".)

## Impact

- Code (presentation only): `apps/neurons-tw/src/components/ConnectomeStatCard.tsx` — remove the toggle button + `showDetail` `useState`; always render the detail row (本週 X/7 + conditional 最強/⚡); drop the now-unused `detailToggleStyle`.
- Zero schema / sync / economy / routes change; no Dexie / R2 / Worker edit; `lint:dexie-fixtures` no-op.
- Independent of and parallel to `redesign-neurons-maze-static-render` (different capability + file); can ship on its own.
