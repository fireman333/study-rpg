> Pure presentation / relocation. No engine, Dexie, R2, or SYNCED_META change.
> Reuse `useDmnStatus` + `DmnDrawModal` + the existing `drawDmnCard()` path unchanged.

## 1. Host the DMN draw action in the homepage card's DMN stage

- [x] 1.1 In `apps/neurons-tw/src/components/ConnectomeStatCard.tsx`, in the `neurons-stat-stage--dmn` stage (under `<DmnDrawProgressRing />`), add a draw-action region driven by `useDmnStatus()` (`drawsAvailable`, `bothPoolsExhausted`; `canDraw = drawsAvailable >= 1 && !bothPoolsExhausted`): canDraw → purple「▶ 抽 N 張 DMN」(`dmnDrawCtaStyle` #5d4ec4, width 100% + box-sizing border-box); bothPoolsExhausted → in-place「DMN 圖鑑完整」line; else → no action control. — DONE.
- [x] 1.2 Host the modal locally: `const [dmnModalOpen, setDmnModalOpen] = useState(false)` + `{dmnModalOpen && <DmnDrawModal onClose={() => setDmnModalOpen(false)} />}` before `</section>`. `useDmnStatus` lives on the card (sibling of the memoized bar, not inside it). — DONE.
- [x] 1.3 Entitlement parity: `canDraw = drawsAvailable >= 1 && !bothPoolsExhausted` (preserves the `tighten-neurons-dmn-entitlement-semantics` no-op-when-exhausted guard); explanatory `title` tooltips kept. — DONE.

## 2. Remove the top-nav DMN button

- [x] 2.1 In `apps/neurons-tw/src/App.tsx`, removed `<DmnDrawButton />` from the header `marginLeft:auto` span (now `<AuthGate />` only) + deleted its import + dropped the now-redundant inner flex `gap`. — DONE.
- [x] 2.2 `grep` confirmed `App.tsx` was the only importer; deleted `apps/neurons-tw/src/components/DmnDrawButton.tsx`. (Inlined the button in the stage per design D4; no shared component extracted.) — DONE.

## 3. Verify

- [x] 3.1 `pnpm --filter @study-rpg/neurons-tw exec tsc --noEmit` clean + `pnpm --filter @study-rpg/neurons-tw test` 563/563 green. (`/simplify` — change is small/clean; no extraction needed.)
- [x] 3.2 Chrome non-regression (dev DB had 可抽 3): top bar = 5 tabs (腦圖/圖鑑/收藏/題庫/社群) + sync/login, **no DMN button** (`headerHasDmnBtn:false`); card DMN stage shows bar +「▶ 抽 3 張 DMN」; click → `DmnDrawModal` opens (`.modal-backdrop` present); forced `可抽 0` → bar-only, button gone (✓); no console errors; restored to 3. `/dmn` collection page untouched (zero code change).
- [x] 3.3 Zero schema/sync change confirmed: no Dexie store / R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS` edit; `pnpm lint:dexie-fixtures` → `[lint:dexie] OK` (no-op).
- [x] 3.4 Owner iPhone check: one clear DMN surface in the card (earn bar + 抽卡 action together); the top bar fits the 5 tabs + sync/login. — DONE (owner OK 2026-06-11). **Merge → main → CF Pages + prod-verify is DEFERRED** to the batched `track-neurons → main` merge (rides with the maze §1 WIP + homepage polish; not deploying a half-finished maze redesign yet).
