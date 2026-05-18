## Context

二階 hospital mode (`apps/medexam2-hospital-tw`) shipped to dogfood substrate at HEAD `9156367` (doctor roster P5 completion). Three parallel Claude Code sessions exercised 30 scenarios on 2026-05-18 against isolated dev servers (ports 5180/5181/5182, origin-isolated IDB), surfacing:

- **Zero P1/P2 critical bugs** — the substrate is ship-quality.
- **4 P3/P4 code issues** (α-1 data integrity, α-2/α-3/γ-1 UX polish).
- **2 design calls** (D1 training strips female sprite, D2 24h grace lets P1 retire-then-upgrade exploit).

Raw findings live in `openspec/decisions/2026-05-18-parallel-dogfood-{alpha,beta,gamma,summary}.md`. The summary file's "Recommended action plan" suggested splitting into Tier 1 / Tier 2 / Tier 3 changes; user opted to consolidate all 6 into one bundle to minimize merge friction with three concurrent track-m2 branches.

The closest precedent — `openspec/changes/archive/2026-05-18-fix-toast-event-rep-floor/` — shows the established pattern for `actualRepDelta` fix + MODIFIED spec scenarios. Fix α-1 mirrors that change one branch over (auto-resolve instead of toast).

## Goals / Non-Goals

**Goals:**
- Close all 4 code bugs identified by parallel dogfood.
- Resolve both design calls per user's confirmed decisions (D1: preserve gender, D2: tighten requireP1 grace).
- Keep spec drift in lockstep — every behavioral change has a matching scenario in its capability spec.
- Land as a single change so the merge back to `track-m2` is one atomic step.
- Smoke each fix manually via Chrome MCP before archiving (no automated unit tests exist for these paths).

**Non-Goals:**
- Modifying `starter-pull.ts` gender behavior (β confirmed intentionally different from training).
- Backfilling legacy `eventLog` rows with corrected `reputationDelta` values (acceptable noise per toast-fix precedent).
- Removing the HomePage dev-panel `練習答對 (mock)` (separate pre-public-launch cleanup change).
- Hardening tutorial reset / navigate-away semi-active state (γ §C4/C5 — documented behavior).
- Exposing `lastPauseReason` via the StudySessionController public API surface (Fix γ-1 sidesteps by trimming banner copy instead).
- Merging branch back to `track-m2` or `main` (user owns merge).

## Decisions

### D1: Fix α-1 — minimal patch, no spec broadening

**Decision**: Apply the `actualRepDelta` pattern to the auto-resolve branch only. Add 1 ADDED scenario to `hospital-events` spec for the partial-floor case as belt-and-suspenders coverage.

**Why over alternative**: The existing spec scenario "Timeout defaults to penalty with actual-delta reporting" (hospital-events line 104-110) already mandates this behavior at `rep = 200`. The code drift is a missed propagation, not a new requirement. Adding a second scenario at a different starting reputation (e.g., rep=1500) catches regressions where someone might "fix" only the rep=0 floor without handling the partial case. Reuses the same pattern as the player-action / toast scenarios above.

**Alternatives considered**: (a) Treat as code-only with no spec delta — risks `/opsx:verify` complaining about declared `hospital-events MODIFIED` having no corresponding delta. (b) Refactor all 3 branches into a shared helper — out of scope creep; the 3 branches have slightly different upstream context (resolver return value, toast UI shape, eventLog only).

### D2: Fix α-2 — parenthetical clarifier over live-compute

**Decision**: Show `「接受懲處（−5,000 聲望（將至 0））」` when `counters.reputation < MALPRACTICE_PENALTY_REP`, keep `「接受懲處（−5,000 聲望）」` otherwise. Use the existing `counters` from `useLiveQuery`; no new state.

**Why over alternative**: The handoff offers two paths: (i) live-compute effective delta (`−min(rep, 5000)`), (ii) parenthetical 「將至 0」. Path (ii) preserves the original 5,000 figure (player learns the intent constant) AND surfaces the actual floor consequence. Less cognitive load than seeing 「−864 聲望」 with no anchor for "why 864". Outcome modal already displays the realized delta (line 375), so progressive disclosure is intact: button shows intent + warning, modal confirms realized.

**Alternatives considered**: (i) live-compute hides the 5,000 intent constant — defeats the purpose of warning the player about the size of the penalty in the worst case. (iii) disable the button entirely when rep is low — bad UX, the player would prefer to take the 0-floor "free" hit over paying revenue.

### D3: Fix γ-1 — trim banner, keep footer hint

**Decision**: Banner copy collapses from 「⏸️ 已暫停（離開分頁，回來會自動繼續）」 to 「⏸️ 已暫停」. The footer hint at line 144-146 already explains both auto-resume (visibility-return) and manual cases.

**Why over alternative**: The handoff offered two paths: (i) differentiate banner by `controller.lastPauseReason`, (ii) trim banner and trust footer hint. Path (ii) avoids leaking controller internals through a new `getLastPauseReason()` API — the StudySessionController interface stays clean for future content-pack reuse. The footer hint is always visible when paused (line 143's `state === 'paused'` guard); no information lost.

**Alternatives considered**: (i) `controller.lastPauseReason` would require exposing private state via the controller interface (`StudySessionController` is part of the content-pack public surface — once exposed, hard to remove). Future content packs writing their own controller would need to match. Not worth the API cost for a single banner sub-clause.

### D4: Fix D1 — suffix preservation, no gender field

**Decision**: In `services/training.ts:57`, check `doctor.spriteKey.endsWith('-female')` and conditionally suffix the new spriteKey. Do NOT introduce a `DoctorRow.gender` field.

**Why over alternative**: Gender is currently encoded implicitly in the spriteKey suffix (per existing β finding §2.4). Adding a `gender` field would require: schema bump, all consumers updated, migration for existing IDB rows. The suffix-encoding is good-enough since β confirmed all 70 female sprite keys exist in `theme-pixel-hospital` SPRITES_MAP.

**Alternatives considered**: (a) Add `DoctorRow.gender: 'male' | 'female'` — overkill for 1-LOC behavioral fix. (b) Re-roll gender on every training success (intentional rebirth) — user explicitly chose preserve. (c) Modify `starter-pull.ts` to use the same suffix logic — out of scope; starter is deterministic male per design.

### D5: Fix D2 — split grace by sub-requirement

**Decision**: In `tick.ts`, the `effectiveDoctors` array (live + retired-within-24h) continues to feed `countDistinctSubjectsAtRarity` for the diversification check. The new `requireP1` check uses `doctors` (live only) instead, calling `doctors.some(d => rarityIsAtLeast(d.rarity, 'P1'))`.

**Why over alternative**: The dogfood β finding noted that grace exists "so players aren't punished for retiring a P5 mid-build" — that intent applies to diversification (covers transitional reshuffling) but NOT to the P1 anchor (which signals "currently hold at least one top-tier doctor"). Splitting the grace per sub-requirement preserves the helpful behavior (diversification grace) while closing the cash-out exploit (retire only P1 → refund + still satisfy requireP1).

**Alternatives considered**: (a) Remove grace entirely — punishes legitimate mid-build P5/P4 reshuffling. (b) Make grace rarity-aware everywhere (P3+ only) — adds complexity, doesn't directly express the P1-anchor semantics. (c) Block retiring the only P1 via UI guard — workaround in the wrong layer; the gate-evaluation logic is where the truth lives.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Fix α-1 mirrors the player-action / toast branches, but the 3 branches drift subtly over time (e.g., resolver return shape differs). | Reference the toast-fix archive (`2026-05-18-fix-toast-event-rep-floor`) for the established pattern. Add ADDED scenario at partial-floor case (rep=1500) so future regressions get caught. |
| Fix α-2 's 「將至 0」 parenthetical inflates the button label width in some viewports. | Acceptable; the modal layout uses a flex column for footer buttons (EventModal.tsx:227), so width grows downward, not horizontally. Verified in Chrome MCP smoke. |
| Fix γ-1 trims a clause that some players relied on as the "tab switch is safe" assurance. | Footer hint (line 144-146) still says this explicitly for the visibility case. Hint length is unchanged. |
| Fix D1 implicitly depends on theme-pixel-hospital exporting all 70 female keys. If a future theme update removes some, training silently emits a broken spriteKey. | β explicitly verified all 70 exist (line 169 in beta findings). No automated test guards this — if SPRITES_MAP shape changes, type system already requires update; missing keys would surface as broken images, not silent failures. |
| Fix D2 changes the gate-evaluation semantics, which a player on a current 醫學中心 save with a recently-retired P1 might notice as "stuck". | Spec scenario will be explicit. No tier regression risk (existing monotonicity guarantee in clinic-level-up). The player can recruit a new P1 from the gacha. Worst case: a player gets stuck at 醫學中心 for the rest of their 24h grace window — acceptable since they triggered it by retiring their P1. |
| All 6 fixes ship in one change → if any one breaks at `/opsx:verify`, the whole bundle stalls. | Each fix is independently testable via Chrome MCP smoke. Implementation order: fix in dependency order, run `pnpm -r typecheck` after each, smoke each before archiving. If one breaks, hold archive but other 5 continue forward. |
| Three concurrent track-m2 branches (image extraction, bug-report, this one) may conflict on shared files (e.g., `tick.ts`, EventModal.tsx). | This change isolates to `apps/medexam2-hospital-tw/`; image-extraction touches build/types layer; bug-report touches Supabase. Conflict surface low. User owns merge order per dogfood summary. |
