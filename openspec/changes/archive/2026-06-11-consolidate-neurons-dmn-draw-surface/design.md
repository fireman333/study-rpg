## Context

Two DMN surfaces coexist on the homepage and duplicate「可抽 N」:

- **`DmnDrawButton`** (`apps/neurons-tw/src/components/DmnDrawButton.tsx`, 63 lines) — rendered in `App.tsx` (~line 105) in the header `marginLeft:auto` span next to `<AuthGate />`. Self-contained: `useDmnStatus()` → `{ drawsAvailable, bothPoolsExhausted }`; `canDraw = drawsAvailable >= 1 && !bothPoolsExhausted`; label `DMN · N` / `DMN` / `DMN 圖鑑完整`; click → `setOpen(true)` → renders `<DmnDrawModal onClose=… />`. Purple `#5d4ec4` when active, grey when disabled.
- **`DmnDrawProgressRing`** (`apps/neurons-tw/src/components/DmnDrawProgressRing.tsx`, 142 lines) — propless, self-subscribing via Dexie `liveQuery(readDmnMeta)`; renders a bar `💎 DMN 抽卡 X/CAP` + caption「出征清錯題換 DMN 抽卡 · 可抽 N」 / terminal「今日出征抽卡已達上限」. It reads `dmnDrawsAvailable` too (the caption's 可抽 N). Mounted inside `ConnectomeStatCard` (`apps/neurons-tw/src/components/ConnectomeStatCard.tsx`) as the third stage of the causal chain (`neurons-stat-stage--dmn`, line ~102).

Both read the same entitlement (`dmnDrawsAvailable`). The earn-progress (bar) and the spend-action (button) being on opposite ends of the page is the confusion.

Owner-approved design: **merge into one** — the card's DMN stage is the single surface; the top-nav button is removed.

## Goals / Non-Goals

**Goals:**
- One DMN surface on the homepage: earn-progress + spend-action co-located in the 出征 → 修復連線 → DMN chain.
- Remove the duplicated「可抽 N」.
- De-crowd the top nav (one fewer item; eases the 5-tab mobile fit).

**Non-Goals:**
- No engine / entitlement / catalog / modal change. `drawDmnCard()`, `useDmnStatus`, `DmnDrawModal`, `readDmnMeta` untouched.
- No new DMN draw entry-point elsewhere (it becomes homepage-only by design).
- No Dexie / R2 / SYNCED_META change.
- The 圖鑑 → DMN collection page (`/dmn`) is unchanged.

## Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Where the relocated action lives | Inside the **card's DMN stage** (`neurons-stat-stage--dmn`), directly under the existing `DmnDrawProgressRing` bar. One stage = bar (earn) + action (spend). |
| D2 | Bar vs button responsibility | Keep `DmnDrawProgressRing` as the read-only earn bar. Add the draw **action** as a sibling in the same stage (driven by `useDmnStatus`), NOT inside the propless memoized bar (keep the bar's live-data subscription isolated). |
| D3 | Three render states (reuse `DmnDrawButton`'s exact semantics) | `可抽 ≥ 1 && !exhausted` → purple「▶ 抽 N 張 DMN」button opening `DmnDrawModal`; `可抽 0` → no button (bar + earn caption already explains how to earn); `bothPoolsExhausted` → a static「DMN 圖鑑完整」line in place (no button). |
| D4 | Fate of `DmnDrawButton.tsx` | Its trigger logic (`useDmnStatus` + modal open + state labels) moves into the card's DMN stage. Remove the standalone component + its `App.tsx` import/usage. (If the purple button visual is worth keeping DRY, a small presentational `<DmnDrawCta>` MAY be extracted — apply-time call; default is inline in the stage.) |
| D5 | Homepage-only draw (the behaviour delta) | Accept. Draws are earned via expedition on the homepage; the global top-nav reachability is dropped deliberately. 圖鑑 → DMN stays the view-only collection. |
| D6 | Top-nav arrows | Out of scope of this change (the「腦圖 →」→「腦圖」arrow removal is a separate trivial nav-label edit already applied); this change only removes the `DmnDrawButton` item from the header. |

## Implementation sketch

1. **Card DMN stage** (`ConnectomeStatCard.tsx`): in the `neurons-stat-stage--dmn` stage, below `<DmnDrawProgressRing />`, add a draw-action region driven by `useDmnStatus()`:
   - `canDraw` → `<button onClick={() => setDmnModalOpen(true)}>▶ 抽 {drawsAvailable} 張 DMN</button>` (purple, reusing `DmnDrawButton`'s `buttonStyle`).
   - `bothPoolsExhausted` → a muted「DMN 圖鑑完整」caption line.
   - else (`可抽 0`) → render nothing extra (the bar caption covers it).
   - Local `const [dmnModalOpen, setDmnModalOpen] = useState(false)` + `{dmnModalOpen && <DmnDrawModal onClose={() => setDmnModalOpen(false)} />}` (mirrors the old button's modal hosting).
2. **App.tsx**: delete `<DmnDrawButton />` from the header span + its import. The span becomes just `<AuthGate />` (drop the now-redundant flex gap if only one child remains, or keep for spacing — cosmetic).
3. **Remove `DmnDrawButton.tsx`** (D4) once `App.tsx` no longer imports it; grep for any other importer first (expected: only `App.tsx`).
4. Verify entitlement parity: the relocated action must reproduce `canDraw = drawsAvailable >= 1 && !bothPoolsExhausted` and the exhausted disable exactly (no regression of `tighten-neurons-dmn-entitlement-semantics`).

## Risks / Trade-offs

- **[Homepage-only draw]** A player sitting on 圖鑑 / 題庫 can no longer draw without returning to 腦圖. Mitigation: this is intended; the draw lives where it's earned, and it's one tab away. Surfaced as the behaviour delta in the proposal.
- **[Two components reading `dmnDrawsAvailable`]** The bar (via `readDmnMeta` liveQuery) and the action (via `useDmnStatus`) both read availability; they must agree. They already derive from the same meta; no new divergence introduced. Keep them in the same stage so they update together.
- **[Spec scenario drift]** `neurons-dmn-fate-cards`'s modal-open scenario is keyed「on `/connectome`, click `DmnDrawButton`」; updated to the homepage card action. The SVG-independence guarantee it actually tests is preserved.

## Migration Plan

Presentation-only; no data/rollback implications. Ship on `track-neurons`, batched merge → main → CF Pages like the other neurons changes. If the relocated action regresses, fall back to re-adding `<DmnDrawButton />` in `App.tsx` (the component + modal path are otherwise unchanged).

## Open Questions (resolve at apply-time)

- Whether to extract a shared `<DmnDrawCta>` presentational component (D4) or inline the button in the stage — pick whichever keeps `ConnectomeStatCard` readable.
- Exact placement of the「▶ 抽 N 張」button within the DMN stage (below the bar vs. replacing the caption when actionable) — owner visual check.
