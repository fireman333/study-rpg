## 1. Mechanics coherence audit (read-only, capture findings)

- [x] 1.1 Energy — re-confirm `apps/neurons-tw/src/lib/maze/economy.ts`: 11 per-family pools (`maze:<familyId>:earned/:settles`), reading-split across active families, settle → `pullVariant(familyId)`, no NT-branch indirection. (Pre-confirmed in design — verify nothing else routes around it.)
- [x] 1.2 Gacha — read `apps/neurons-tw/src/lib/services/variant-gacha.ts` + the settle→pull path in `apps/neurons-tw/src/lib/maze/useMaze.ts`: confirm `pullVariant` is purely per-family, and 二週目 least-collected logic operates per-family (no NT-branch indirection).
- [x] 1.3 Acceleration — read `apps/neurons-tw/src/lib/services/acceleration.ts`: confirm `energyAccel(familyId)` composes per-family with the 11 pools; `family-buff` (`dmnActiveBuffs`) family-scoping maps to a real family id; speed/energy equipment lanes stay coherent.
- [x] 1.4 Mastery fold-in — confirm `masteryEnergyMultiplier(tier)` (`packages/core` `mastery-tier.ts`) folds into the per-family faucet exactly as `neuron-family-mastery` describes (both faucets, same tier, correct-answers only).
- [x] 1.5 Full residual grep — grep `apps/neurons-tw/src/lib/maze/*` + `apps/neurons-tw/src/lib/services/*` for `maze:(da|5ht|gaba|glu)` / NT-branch / four-region references; classify each against the design D1 matrix (clean vs intentional vs flag).
- [x] 1.6 Record findings — write the P1–P5 findings list into design.md "Preliminary audit findings" (promote to final) — coherent items confirmed + any new suspect items.

## 2. Code-logic-layer residual cleanup (no schema risk)

- [x] 2.1 Fix `apps/neurons-tw/src/lib/services/first-pull.ts` docstring: stale `maze:<branch>:settles / earned` → describe the current per-family economy (first-pull does NOT touch the per-family settle pools).
- [x] 2.2 `apps/neurons-tw/src/lib/sync/r2/bundles.ts:66-72` — RECLASSIFIED to flag (finding C3): it is a **historical v12 SCHEMA_VERSION changelog entry**, not a current-state comment; rewriting it risks falsifying bundle-version history (per the owner's "flag schema-adjacent, don't rewrite" rule). Left as-is; flagged in the decisions note.
- [x] 2.3 Fix any other stale NT-branch comments surfaced by 1.5 (comments/docstrings only — do NOT touch `SYNCED_META_KEYS`, R2 bundle keys, or Dexie schema; those are flag-only).

## 3. Spec hygiene

- [x] 3.1 Direct-edit `openspec/specs/neurons-brain-maze/spec.md` Purpose paragraph: four-region brain map / per-NT-branch energy / MazeBrainMap / 已連線 X 個腦區 / Designed per-branch → the 11-family unified square grid model (match the wording already in its own Requirements L9/40/240). Non-normative; change no SHALL/MUST.
- [x] 3.2 Confirm the `neuron-family-mastery` delta (`changes/.../specs/neuron-family-mastery/spec.md`, "NT branch" → "family energy pool") is correct; it merges into the main spec at archive — do NOT hand-edit the main `neuron-family-mastery` spec during apply.
- [x] 3.3 Re-grep ALL `openspec/specs/*` for residual player-facing 四大家族 / NT-branch wording inside Requirements/scenarios; confirm the only requirement-level fix is `neuron-family-mastery` (others — `neuron-variant-gacha` L390, `neurons-mode` L79-93, `neurons-character-card` grouping — are intentional, leave them).
- [x] 3.4 `openspec validate --all --strict` clean.

## 4. Sprite verify (regen only on real defect)

- [x] 4.1 Boot dev server + Chrome MCP (preflight `list_connected_browsers`) → render the maze homepage; confirm all 11 families are visually distinguishable via redundant channels (color + line style + node shape), with no NT-branch-encoded visual that should now read per-subject.
- [x] 4.2 If (and only if) a specific family is ambiguous or carries a retired NT-branch visual → regen that ONE sprite (Gemini per `image_gen_routing.md`); otherwise record "sprites verified, no regen needed".

## 5. Deliverable handoff

- [x] 5.1 Write `openspec/decisions/2026-06-05-neurons-mechanics-rebalance-input.md`: the suspect-numbers list (PACING_BASE / PACING_K / CORRECT_ANSWER_ENERGY / READING_MINUTE_ENERGY / energyAccel cap / speedAccel cap + reasoning) as input for the future `rebalance-neurons-*` change.
- [x] 5.2 In the same note, record the **first-pull 四大家族 onboarding visibility** finding for owner decision (keep as deliberate onboarding vs neutralize copy to per-family).

## 6. Verify

- [x] 6.1 `pnpm -r typecheck` clean.
- [x] 6.2 `pnpm --filter @study-rpg/neurons-tw test` green (no test changes expected — comment/prose/scenario-wording only).
- [x] 6.3 `pnpm lint:dexie-fixtures` clean (no-op — zero schema bump expected; confirms no accidental `.version()` change).
- [x] 6.4 `pnpm --filter @study-rpg/neurons-tw build` succeeds.
