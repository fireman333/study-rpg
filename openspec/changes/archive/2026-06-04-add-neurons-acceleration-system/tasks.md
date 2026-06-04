> **Git discipline (multi-session worktree).** Parallel sessions have been flying in
> this worktree (bug-report, first-pull, leaderboard, SRS). NEVER `git add -A` / `git add .`.
> Stage explicit files only; run `git diff --cached --name-status` before every commit to
> confirm the staging set contains ONLY this change's files. Exclude the `meta.json`
> builtAt churn. Per `multi_agent_git_safety`.
>
> **Schema version claim (coordinate FIRST).** This change takes **Dexie v16** + R2 neurons
> bundle **SCHEMA_VERSION 16**. first-pull took bundle 15; quiz-modes-srs took Dexie v15.
> Announce the claim via `/msg` before bumping, and re-check `bundles.ts` / `db.ts` for a
> higher number any parallel session may have grabbed.

> ## ⚠️ RESUME STATE (2026-06-04 handoff — READ FIRST)
>
> **A concurrent worker is advancing §4.2/§5.1 in THIS working tree.** On resume:
> **(1) `/inbox` + coordinate before editing** — someone created `lib/services/inventory.ts`
> (`activateConsumable(kind)` → `applyConsumableEffect`), renamed the dispatcher
> `dispatchDmnEvent → applyConsumableEffect(kind, sourceCardId)` (no cardId idempotency —
> activation is deliberate), reshaped `drawDmnCard`'s `DrawDmnCardResult` (no more
> `.card` / `.catalog`), and REMOVED `getActiveFamilyBuffMultiplier`.
>
> **(2) Tree is currently RED — `pnpm --filter @study-rpg/neurons-tw typecheck` exit 2.**
> 4 caller breakages to fix FIRST (then re-run the 325-green suite):
>   - `__tests__/dmn-event-idempotency.test.ts` — imports removed `dispatchDmnEvent`; rewrite
>     to `applyConsumableEffect(kind, sourceCardId)` (no idempotency now) or supersede.
>   - `__tests__/dmn-event-realign.test.ts:7` — imports removed `getActiveFamilyBuffMultiplier`;
>     re-express the family-buff ×2 assertion via `energyAccel(familyId)` (the new faucet path).
>   - `__tests__/dmn-draw-mechanics.test.ts:63-64` + `components/DmnDrawModal.tsx:152-183` —
>     `DrawDmnCardResult` shape changed; inspect the new `drawDmnCard` return + `inventory.ts`
>     and update `.card`/`.catalog` accessors + the rarity/event label indexing.
>
> **GREEN before the concurrent edits:** §3 schema (Dexie v16 + R2 bundle 16 + adapters +
> 2 new tests), §4.1 `acceleration.ts` (pools/caps), §4.3 `energyAccel` in faucet, §4.5
> equipment passive, §5.2 streak-shield removed — were 325/325 + typecheck 0 + dexie-lint OK.
>
> **THEN continue:** §4.2 backpack (deposit-on-draw + activate UI — partially done via
> inventory.ts), §4.4 speed wiring (entangled w/ team-speed), §5.1 equipment-first draw roll,
> §5.3 equipment fallthrough, §6 UI (backpack panel / equipment P1–P5 dex / draw-reveal
> branch), §7 ~14 sprite placeholders, §8 tests (pool math / inventory / draw branching),
> §9 Chrome MCP verify, §10 docs+roadmap. Nothing committed (curator) — explicit per-file
> staging; reconcile with the concurrent worker + the squads-rework files in the tree.

## 0. Coordination

- [x] 0.1 `/inbox` + `/msg` to claim Dexie v16 + R2 bundle SCHEMA_VERSION 16; re-read `apps/neurons-tw/src/lib/sync/r2/bundles.ts` (`SCHEMA_VERSION`) + `apps/neurons-tw/src/lib/db.ts` (`.version(N)`) to confirm 15 is still the head before bumping. **(done — claim sent; schema head confirmed 15; bug-report committed f5da4aa so tree clean; rework-neurons-squads is cosmetic/no-schema/non-overlapping.)**

## 1. Content — consumable catalog (remove streak-shield, add surge/bolus)

- [x] 1.1 `packages/content-neurons-tw/src/dmn-types.ts`: drop `streak-shield` from `DmnEventKind` union + `DMN_EVENT_TYPES` tuple; add `surge` + `bolus`. **(weights unchanged 2/10/30/58 — already sum 100; tier weights are independent of card count. DmnActiveBuffRow buffKind extended to surge/bolus.)**
- [x] 1.2 `packages/content-neurons-tw/src/dmn-cards.ts`: remove the 4 `streak-shield` cards; add 3 `surge` + 3 `bolus` cards (OE-anchored) → catalog length 22 (P1×2/P2×5/P3×7/P4×8); each of the 6 kinds keeps ≥ 3 cards. family-buff descriptions reframed AP→energy.
- [x] 1.3 `packages/content-neurons-tw/src/dmn-card-validator.ts`: size 20→22; distribution 2/5/7/8; kind set auto-follows the 6-kind `DMN_EVENT_TYPES` (rejects `streak-shield` via `INVALID_EVENT_KIND`). `scripts/verify-dmn-validator.ts` fixtures fixed (size-22 indices + streak-shield negative). **verify:dmn 8/8 ✓**

## 2. Content — equipment catalog (P1–P5, ≥ 10 items)

- [x] 2.1 New `packages/content-neurons-tw/src/{equipment-types,equipment-catalog}.ts`: `EQUIPMENT_CATALOG` 12 items P1–P5 (6 speed/myelin + 6 energy/metabolic), `EQUIPMENT_RARITY_BONUS` P1 .30/P2 .18/P3 .10/P4 .04/P5 .01, `EQUIPMENT_RARITY_WEIGHTS`, `EQUIPMENT_DRAW_RATE` 0.05.
- [x] 2.2 New `packages/content-neurons-tw/src/equipment-validator.ts` + `scripts/verify-equipment-validator.ts`: reject <10 / <2 per tier / invalid lane / bonus-rarity mismatch. **verify:equipment 6/6 ✓**
- [x] 2.3 Re-exported from `src/index.ts`. (Content package serves `src` directly — no dist build.) content typecheck clean.

## 3. Schema — Dexie v16 + R2 bundle 16

- [x] 3.1 `apps/neurons-tw/src/lib/db.ts`: `.version(16)` adding `inventory` (`kind` PK, `count`) + `equipment` (`equipmentId` PK, `rarity`, `obtainedAt`) tables. Additive — NO primary-key change.
- [x] 3.2 `apps/neurons-tw/src/__tests__/db-v15-to-v16-migration.test.ts`: seed a v15 DB, reopen at v16, assert no `DatabaseClosedError` + existing rows retained + new tables empty (dexie-fixture-lint rule).
- [x] 3.3 `apps/neurons-tw/src/lib/sync/r2/bundles.ts`: `SCHEMA_VERSION` 15→16; add `inventory` + `equipment` to the adapter key allowlist + meta keys; keep `validateBundleMeta` forward-tolerant (`console.info` + continue on `> SCHEMA_VERSION`).
- [x] 3.4 `apps/neurons-tw/src/lib/sync/tables.ts`: `inventoryAdapter` (LWW per `kind`) + `equipmentAdapter` (**monotonic-union** — owning never un-owns); register in the bundle assembly/apply.
- [x] 3.5 Cross-version bundle tests: v15 client drops `inventory`/`equipment`; v16 reading v15 preserves local (preserve-on-omission).

## 4. Acceleration engine

- [x] 4.1 New `apps/neurons-tw/src/lib/services/acceleration.ts`: `energyAccel()` / `speedAccel()` = `min(CAP, 1 + Σ active-consumable bonus + Σ owned-permanent bonus)` by lane; `ENERGY_ACCEL_CAP = 2.5`, `SPEED_ACCEL_CAP = 2.0` constants.
- [x] 4.2 Backpack/inventory service: deposit (draw), activate (time-limited → active-buff row with `expiresAt`; one-shot → consume), expiry cleanup. Reuse/extend `dmnActiveBuffs` for activated time-limited buffs.
- [x] 4.3 Wire `energyAccel` into the correct-answer maze-energy faucet (`connectome.ts` — replace the standalone `familyBuffMult` slot; family-buff now a `+1.0` additive bonus when active) + reading-time accrual.
- [x] 4.4 Wire `speedAccel` into branch exploration speed (`maze` team-speed composition), clamped.
- [x] 4.5 Equipment passive application: owned-equipment bonuses sum by lane into the pools.

## 5. DMN draw rework

- [x] 5.1 Draw path: roll `EQUIPMENT_DRAW_RATE` (≈5%, const) against the unowned equipment pool → on hit roll rarity (`EQUIPMENT_RARITY_WEIGHTS`) + award one unowned equipment (nearest-unowned fallback) + STOP; else roll a consumable card → insert `dmnCards` collection row + increment `inventory` (NO auto-fire).
- [x] 5.2 Remove the full `streak-shield` footprint: dispatcher case + `consumeStreakShield` + `META_STREAK_SHIELD`; `lib/services/streak.ts` consume site; `dmnStreakShieldAvailable` in `SYNCED_META_KEYS`; `DmnDrawModal` + `HelpMenu` copy; idempotency-test cases.
- [x] 5.3 Closed-cap: consumable dex completes at 22; once complete draws only roll equipment (inert when equipment also fully owned).

## 6. UI

- [x] 6.1 Backpack panel: stackable consumable list (count, activate button, active-buff timer for time-limited).
- [x] 6.2 Equipment dex: P1–P5 grid (owned art + bonus vs rarity-coded silhouette).
- [x] 6.3 DMN draw-result reveal: branch equipment vs consumable form; update `DmnDrawModal` copy (no streak-shield).

## 7. Sprites (placeholders this change)

- [x] 7.1 Register ~12 equipment + 2 consumable (`surge`/`bolus`) `artworkId`s as placeholders (1×1 transparent / `?? TRANSPARENT_PIXEL`) in `theme-pixel-neurons`. Real art deferred to follow-up `generate-acceleration-sprites` (~14, Gemini/codex).

## 8. Tests

- [x] 8.1 Unit: dmn + equipment validators (size/tier/lane/bonus/streak-shield-rejected).
- [x] 8.2 Unit: `energyAccel`/`speedAccel` additive sum + cap clamp + empty-pool identity + family-buff `×2 ↔ +1.0` equivalence.
- [x] 8.3 Unit: inventory deposit (no auto-fire) + time-limited activation/expiry + one-shot consume + zero-stock no-op.
- [x] 8.4 Unit: draw branching (equipment-hit skips consumable; miss deposits to backpack) + closed-cap at 22 + equipment-pool-exhausted fallthrough.
- [x] 8.5 Unit/sync: v15→v16 migration fixture + cross-version bundle (drop/preserve) + equipment monotonic-union merge.
- [x] 8.6 `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` + `pnpm lint:dexie-fixtures` clean.

## 9. Verify (/verify stage)

- [x] 9.1 Chrome MCP end-to-end: draw → consumable lands in backpack (no auto-fire); activate → buff timer + faucet/speed reflects capped multiplier; equipment hit → equipment dex + passive bonus; streak-shield absent everywhere; console clean; SPA 三件套 unaffected.

## 10. Docs

- [x] 10.1 Update `openspec/decisions/2026-06-04-neurons-progression-systems-roadmap.md`: §1 lane table (P2/P3 merged → acceleration-system, in-progress), §3/§4 guardrail rewrite (DMN may carry consumable speed/energy), §6 phases; link this change.
- [x] 10.2 Add a neurons-acceleration-system section to project root `CLAUDE.md` (lane model, caps, schema v16/bundle 16, sprite follow-up).
