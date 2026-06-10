## Why

The neurons-tw homepage (`/`) currently scatters the daily-loop signals across three disconnected surfaces — a standalone connectome status strip, a separate ⚔️ 錯題出征 button in the CTA toolbar, and a free-floating DMN-draw progress ring below the maze — so a player cannot see the core causal chain (出征 → 修復連線 → DMN 抽卡) at a glance. The 🎲 隨機跨 family 答題 entry is also effectively unused (players reach for per-family practice, not a random cross-family roll), adding toolbar clutter without value.

## What Changes

- **Remove the 🎲 隨機跨 family 答題 CTA** from the homepage toolbar and clean up its now-dead code (random quiz handler, random pool branch, random count badge, its style). The per-family quiz-mode chips (🆕 新題 / 🔄 錯題) become the sole answering entry from the homepage.
- **Relocate `<YearFilterBar/>`** from the CTA toolbar to the top of the FamilyPicker ("選 family 直接練習") section. The year filter is global meta (`quiz.yearFilter`) read by the per-family quiz pool, so the filter remains meaningful for family-card practice after 🎲 removal; this is a render-location move, not a state refactor.
- **Merge three surfaces into one themed light stat card** placed as the homepage's **top dashboard, above the maze centerpiece**: (a) the ⚔️ 錯題出征 button, (b) the connectome status strip, and (c) the DMN-draw progress indicator. The card uses a **horizontal three-stage + arrow** layout that reads the causal chain 今日出征狀態 → 修復連線數據 → DMN 抽卡 left-to-right, with the ⚔️ 錯題出征 button promoted to a full-width top primary CTA. The resulting top-to-bottom homepage order is **儀表板 (stat card) → 迷宮 (maze) → 神經元遠征隊 (study squad) → 收藏 chips → 各科 family grid**.
- **Convert the DMN-draw progress ring to a horizontal progress bar** to fit the card's horizontal layout, preserving its cap-aware terminal state (今日抽卡已達上限).
- **Default-show 4–5 core signals** in the card (今日出征 ✓/✗・🔥 連續 N 天・穩定連線數・DMN 今日抽/上限) with an expandable 「詳細」 disclosure revealing the remaining signals (最強 pair・本週 X/7・⚡ 今日連線額外能量).
- Preserve the existing one-way reveal of the ⚔️ 出征 CTA for never-wrong new players (no dead disabled button), showing guidance text in the primary-CTA slot instead; render an honest empty state (zeroed data + 「答錯題開始修復連線」 guidance) for a fresh account.
- The total-collection status chips (🧬 變體・💎 DMN・📖 累積閱讀) stay in place below the card — they are a separate "total collection" semantic, not part of the daily causal chain.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-homepage`: Three requirements change spec-level behavior — (1) the "compose as a CTA toolbar…" requirement drops the persistent 🎲 entry, moves the year filter into the family grid, and introduces the merged stat card (with the DMN indicator folded in) as the **top dashboard above the maze** (top-to-bottom: stat card → maze → study squad → chips → family grid); (2) the "cap-aware 'next DMN draw' progress **ring**" requirement becomes a horizontal **bar**; (3) the "preserve manual reading-timer start and the non-collapsed quiz CTA" requirement drops the 🎲 toolbar clause so per-family quiz-mode chips are the sole homepage answering entry.

## Impact

- **Code (presentation only)**: `apps/neurons-tw/src/routes/OverviewPage.tsx` (remove 🎲 + dead code, remove standalone status strip + standalone DMN ring, add merged stat card, move YearFilterBar), `apps/neurons-tw/src/components/FamilyPicker.tsx` (host YearFilterBar at top), `apps/neurons-tw/src/components/DmnDrawProgressRing.tsx` (ring → bar form / variant). Likely a new small `components/ConnectomeStatCard.tsx` (or inline) for the merged card.
- **No schema / sync impact**: zero Dexie version bump, zero R2 bundle change, zero sync Worker / SYNCED_META_KEYS change. `lint:dexie-fixtures` is a no-op for this change.
- **No backend, no deps, no breaking API**: engine (`@study-rpg/core`) untouched; all changed values are already engine-computed and only re-presented.
- **Tests**: existing Vitest suite must stay green; any test asserting the 🎲 entry or the standalone DMN ring/status strip presence needs updating to the new composition.
