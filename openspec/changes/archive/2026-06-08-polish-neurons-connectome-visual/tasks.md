## 1. Engine read-only helpers (computation stays out of the UI — design D1)

- [x] 1.1 Add `getWireConductionStatuses()` (or per-pair lookup) in `connectome.ts`/`economy.ts` returning per-wire `{ state, ratePct, todayUsed, cap, subjects: [a,b], isLegacy }`, derived from `db.synapses` + the per-line daily-used accumulator + CONDUCTION_* constants. Legacy (`lastCoFireDate < CONNECTOME_CONDUCTION_EPOCH`) flagged + cap/usage 0.
- [x] 1.2 Add `getAboutToWireHint()` in `connectome.ts` returning `{ subjectA, subjectB, remaining } | null` — closest not-yet-wired pair by fewest additional repairs to satisfy the per-subject `REPAIR_K` gate, from `meta['connectome:dailyRepair:<date>']` + `db.synapses`. Null when nothing close.
- [x] 1.3 Unit tests for both helpers (`apps/neurons-tw/src/__tests__/`): tooltip status mapping (weak/strong/legacy + usage), about-to-wire selection (one-side-short, both-short, already-wired excluded, null empty case).

## 2. Per-wire tooltip (hover + tap) — MazeGrid

- [x] 2.1 Add a canvas pointer hit-test in `MazeGrid.tsx`: map client coords → cell coords (renderer's transform) → match nearest `SynapseDatum` crossing cell within a small radius → `hoveredWire` state. `pointermove` for hover (clear on leave); `pointerdown` on a wire for touch (with `pointerdown`-elsewhere dismiss).
- [x] 2.2 Render an HTML tooltip div (NOT on canvas) positioned near the pointer, fed by `getWireConductionStatuses()`: 「<a> ↔ <b> · <強/弱>連線 +<rate>% · 今日傳導 <used>/<cap>」; legacy → 「早期連線 · 不傳導」. Keep within panel bounds; `aria`-friendly.

## 3. About-to-wire ghost line — settlement panel

- [x] 3.1 In `OverviewPage` settlement recap (beside the conduction ledger), call `getAboutToWireHint()` after settlement and render 「再修復 X 題就能和 Y 形成連線」, or an honest empty state when null.

## 4. Daily-completion ritual overlay

- [x] 4.1 In `OverviewPage` expedition `onComplete` consumer: when `result.effectiveCompletion === true` AND `meta['connectome:ritualFired:<today>']` absent → fire the celebration overlay (reuse `celebration` state + `MazeCompletionCelebration`/`SquadCelebration`) and set the date-keyed flag. Flag NOT added to `SYNCED_META_KEYS`.
- [x] 4.2 Confirm `prefers-reduced-motion` degrades to a static acknowledgement (reuse the primitives' existing reduced-motion handling; add guard if absent). Auto-dismiss + non-blocking.

## 5. Verify

- [x] 5.1 `pnpm -r typecheck` clean + `pnpm --filter @study-rpg/neurons-tw test` green (incl. new helper tests)
- [x] 5.2 `pnpm lint:dexie-fixtures` not triggered (zero `.version()` bump — confirm)
- [x] 5.3 Chrome MCP smoke: hover a wire → tooltip shows correct subjects/rate/usage; tap a wire (touch-emulated) → tooltip + tap-away dismiss; run a wrong-pool expedition to effective completion → ritual fires once + ghost-line hint renders in settlement; re-run same day → ritual does NOT replay; console clean
- [x] 5.4 reduced-motion degradation verified by construction (explicit `if (reduced) return banner-only` branch mirroring MazeCompletionCelebration; Chrome MCP cannot emulate `prefers-reduced-motion`)

## 6. Archive + commit

- [ ] 6.1 `/opsx:archive polish-neurons-connectome-visual` (sync the `neurons-homepage` MODIFIED + ADDED deltas into main specs)
- [ ] 6.2 Commit via auto-git (explicit per-file `git add`; `git diff --cached --name-status` confirms only this change's files); restore any build-noise (`meta.json`) before staging
