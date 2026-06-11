## Why

The homepage shows **two DMN surfaces at once**, and they confuse players (owner-reported on iPhone dogfood):

1. **`DmnDrawButton`** in the top-nav header (`App.tsx`, next to `AuthGate`) — the **spend action**: `DMN · N` (N = `drawsAvailable`), click → opens `DmnDrawModal`. Visible on every route.
2. **`DmnDrawProgressRing`** (bar form) inside the homepage `ConnectomeStatCard` (the 答錯題出征 daily-loop card) — the **earn display**: a read-only progress bar `💎 DMN 抽卡 X/CAP` + caption「出征清錯題換 DMN 抽卡 · 可抽 N」.

Both render **「可抽 N」**, so the available-draw count is duplicated, and the earn-progress and the spend-action are split to opposite ends of the page — players read it as "two different DMN things." It also crowds the mobile top bar (which already needs to fit the 5 nav tabs + sync/login).

## What Changes

Consolidate the DMN draw entry-point into **one surface** on the homepage, co-located with where draws are earned (the 出征 → 修復連線 → DMN causal chain):

- **Remove `<DmnDrawButton />` from the top-nav header** (`App.tsx`). The top bar then holds only the 5 route tabs + sync/login (also de-crowds the mobile top bar).
- **The homepage card's DMN stage becomes the single DMN surface.** The `DmnDrawProgressRing` bar stays as the earn-progress display, and the DMN stage gains the **draw action** in place:
  - **可抽 ≥ 1** (and not both-pools-exhausted) → a prominent **「▶ 抽 N 張 DMN」** action button appears under the bar, opening `DmnDrawModal` (the existing modal, unchanged).
  - **可抽 0** → bar only, with the existing earn caption「出征清錯題換 DMN 抽卡」 (no action button).
  - **both pools exhausted** → the existing terminal **「DMN 圖鑑完整」** state, shown in place.
- **DMN draw becomes homepage-only.** You earn draws via expedition on the homepage anyway; the 圖鑑 → DMN page (`/dmn`) stays the **collection / pokédex** view (unchanged). This is a cleaner earn-and-spend-here / view-there separation.

This is a **pure presentation / relocation** of an existing action + entry-point. No engine reward logic, no `DmnDrawModal` change, no Dexie schema, no R2 `SCHEMA_VERSION`, no `SYNCED_META_KEYS` change. The draw still goes through the existing `useDmnStatus` (`drawsAvailable` / `bothPoolsExhausted`) entitlement semantics and the existing `drawDmnCard()` engine path; the `tighten-neurons-dmn-entitlement-semantics` no-op-when-exhausted guard is preserved (the relocated button keeps `canDraw = drawsAvailable >= 1 && !bothPoolsExhausted`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-dmn-fate-cards`: the **DMN draw entry-point** moves from a top-nav button to the homepage daily-loop card's DMN stage (the UI-surface requirement's `DmnDrawButton — top-nav or floating button` bullet → an action hosted in the `ConnectomeStatCard` DMN stage, per `neurons-homepage`). The modal-open scenario's trigger is updated from「on `/connectome`, click `DmnDrawButton`」 to「on the homepage, trigger the card's DMN draw action」; the modal's independence-from-connectome-SVG guarantee is unchanged. The location-agnostic `dmnDrawsAvailable === 0` disabled state + both-pools-exhausted disabled state (in the draw-flow requirement) are unchanged and preserved in the new location.
- `neurons-responsive-layout`: the homepage top-nav composition drops `DmnDrawButton` (`route links + DmnDrawButton + AuthGate` → `route links + AuthGate`); the no-horizontal-overflow / mobile-scroll-tabs behavior is otherwise unchanged (and slightly eased by one fewer item).

**Not modified (text stays true):** `neurons-homepage` — its "compose" requirement says the card body *presents the DMN-draw progress indicator*; that remains true. Hosting the draw **action** in the same DMN stage is an addition that does not contradict the requirement (it never claimed the stage is action-free), and the entry-point relocation is owned by `neurons-dmn-fate-cards`. So no `neurons-homepage` delta is needed.

## Impact

- **Code (presentation only)**:
  - `apps/neurons-tw/src/App.tsx` — remove the `<DmnDrawButton />` from the header span + its import.
  - `apps/neurons-tw/src/components/ConnectomeStatCard.tsx` and/or `DmnDrawProgressRing.tsx` — host the draw action in the DMN stage (open `DmnDrawModal` on click when `canDraw`; render the disabled / 圖鑑完整 states in place). Reuse `useDmnStatus` + `DmnDrawModal`.
  - `apps/neurons-tw/src/components/DmnDrawButton.tsx` — its draw-trigger logic is absorbed into the card's DMN stage; the standalone component is removed (or reduced to the shared button presentation if cleaner).
- **No engine / data / sync change**: no Dexie store, no R2 `SCHEMA_VERSION`, no `SYNCED_META_KEYS`, no Worker edit; `lint:dexie-fixtures` no-op. `drawDmnCard()` / `useDmnStatus` / `DmnDrawModal` unchanged.
- **Behaviour delta (intended)**: DMN draw is no longer reachable from non-homepage routes (it was a global top-nav button); it is now reached from the homepage daily-loop card. The 圖鑑 → DMN collection page is unaffected.
- **Verification**: typecheck + neurons vitest green; Chrome non-regression (top bar no longer shows the DMN button; the card DMN stage opens the modal when 可抽 ≥ 1, shows the bar-only state at 可抽 0, and the 圖鑑完整 terminal when exhausted); owner iPhone check that the single DMN surface reads clearly + the top bar fits the 5 tabs.
