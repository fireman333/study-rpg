> **Git discipline (multi-session worktree).** This worktree also hosts the uncommitted
> `add-neurons-acceleration-system` change. NEVER `git add -A` / `git add .`. Stage explicit
> files only and run `git diff --cached --name-status` before every commit to confirm the set
> contains ONLY this change's files (MazeExpedition / QuizModal / OverviewPage / StudySquadPanel
> + squad labels / hide-preference helper / tests / openspec/changes/rework-neurons-squads/).
> Per `multi_agent_git_safety`. Cosmetic-only: NO Dexie / R2 `SCHEMA_VERSION` bump.

## 1. Unify squad source (active squad + fallback)

- [x] 1.1 In `MazeExpedition.tsx`, demote the current `useExpeditionSquad` (auto rarest-5) to a named fallback helper (e.g. `rarestFallbackSquad`) — keep its logic, do not delete.
- [x] 1.2 Drive the band's marchers from `useActiveSquad()`; when empty → `rarestFallbackSquad`; when collection empty → existing growth-cone marchers. Keep the clean-transparent-sprite rendering (no context-art decor).
- [x] 1.3 Confirm the band re-derives live when the active squad changes (liveQuery) and when collection changes while squad is empty.

## 2. Compact quiz band (QuizModal)

- [x] 2.1 Add a `compact` (or `variant: 'home' | 'quiz'`) prop to `MazeExpedition` that scales height, lowers opacity, and reduces particle density for the quiz context.
- [x] 2.2 Mount the compact band in `QuizModal.tsx` upper background: `position: absolute`, behind the stem/options, `pointer-events: none`, low opacity. Verify it does not obscure text or intercept option clicks.
- [x] 2.3 Gate the quiz band on the shared hide preference (§3) + `prefers-reduced-motion`.

## 3. Auto-trigger + persisted opt-out hide

- [x] 3.1 Homepage band: subscribe to `useReadingTimer` (`status === 'reading'` → animate, else static). Replace the manual「🚀 顯示遠征動畫」opt-in button in `OverviewPage.tsx` with the auto-trigger.
- [x] 3.2 Add a single persisted「關閉動畫」visibility preference (localStorage; reuse / mirror the existing band-visibility persistence). Default = shown. A homepage chip toggles it; the quiz band honors the same preference (no separate quiz control — keep the answer UI clean per design Open Question).
- [x] 3.3 `prefers-reduced-motion: reduce` freezes both bands to a static scene regardless of the preference (preserve existing behavior).
- [x] 3.4 Keep show/hide wording (顯示/隱藏), not start/stop (the journey is always running).

## 4. Rename → 神經元遠征隊

- [x] 4.1 Rename the player-facing squad labels to「神經元遠征隊」: `StudySquadPanel.tsx` header / 「編輯隊伍」 affordance / homepage party-row heading / the band title. Presentational only — do NOT touch the `activeSquad` meta key, `VariantKey` shape, or any mechanic identifier.
- [x] 4.2 Leave the 出征 (all-subject wrong-question drill) action name UNCHANGED — it is a separate concept.
- [x] 4.3 Grep for stray old labels (出戰隊伍 / 遠征動畫 band title) and align to the new name where player-facing.

## 5. Tests

- [x] 5.1 Unit: squad-source resolution — non-empty active squad → those members; empty squad + collected variants → rarest-5; empty collection → growth cones. (Pure helper if extracted; else a thin selector test.)
- [x] 5.2 Unit: hide-preference persistence (set → reload-equivalent read returns hidden).
- [~] 5.3 **My files: clean.** `tsc -p apps/neurons-tw` reports 0 errors in any of this change's 6 files; my `squad-band.test.ts` 5/5 green; `lint:dexie-fixtures` OK (no Dexie bump). **Full `pnpm -r typecheck` / full `pnpm test` are RED — but NOT from this change:** the parallel `add-neurons-acceleration-system` session has uncommitted edits to the shared `packages/content-neurons-tw/` (dmn-types `streak-shield`→`surge`/`bolus` + equipment-*), which break its own `dmn-event-dispatcher.ts` / `DmnDrawModal.tsx` / `dmn-event-idempotency.test.ts` mid-flight. Re-run the full suite green once that session commits. A commit of ONLY this change's 6 files yields a clean snapshot (my files + the committed content package typecheck clean).

## 6. Verify (/verify stage — Chrome MCP)

- [x] 6.1 Homepage: assemble a squad → band shows those members (not auto-rarest); start reading → band auto-plays; stop → static. Empty squad → rarest-5 fallback.
- [x] 6.2 QuizModal: open a quiz → compact translucent band plays in upper background; confirm it does NOT obscure the stem/options and does NOT intercept option clicks (click an option through/around it).
- [x] 6.3 Toggle「關閉動畫」→ band hidden on both homepage + quiz; persists across reload. `prefers-reduced-motion` (emulate) → static.
- [x] 6.4 Rename: labels read「神經元遠征隊」across panel / party row / band; 出征 action name unchanged. Console clean. SPA 三件套 (root / 直接 URL / F5) unaffected.
