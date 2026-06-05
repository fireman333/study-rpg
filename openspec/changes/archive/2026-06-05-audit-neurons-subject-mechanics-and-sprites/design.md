## Context

The neurons maze went through two redesigns: `redesign-neurons-maze-rotjs-grid` (four-NT-branch brain map → single unified square grid covering all 11 subject families) then `promote-maze-to-home` (the grid IS the homepage `/`; node settle = the only pull path; per-family `maze:<familyId>:earned/:settles` synced meta is the single fuel + cost). The energy/gacha/acceleration code was rewritten per-family during those changes, but no dedicated pass has **confirmed** the three mechanics are mutually coherent under the 11-pool model, and stale four-region descriptions linger in spec prose and code comments.

This change is **audit + coherence-fix + verify**, scoped by `/grill quick` (`~/.claude/scratch/grilled-audit-neurons-subject-mechanics-2026-06-05.md`). It does **not** rebalance any gameplay numbers — that is deferred to a separate future change, fed by a "suspect numbers" list produced here.

Constraints: worktree `track-neurons`; zero-schema (no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump — stays 16); neuroscience facts via `/oe` per project rule; the acceptance bar (owner) is "code/spec coherent + no residual 4-branch in the code-logic layer + spec text aligned" — no dogfood手玩 required.

## Goals / Non-Goals

**Goals:**
- Confirm energy (`economy.ts`), gacha (settle → `pullVariant`), acceleration (`acceleration.ts`), and the mastery fold-in all run through ONE per-family path with no NT-branch indirection — captured as a P1–P5-tagged audit write-up.
- Clean residual NT-branch references in the **code-logic layer** (comments/docstrings that misdescribe the per-family model).
- Align spec text: rewrite the stale `neurons-brain-maze` Purpose; fix the one stale "NT branch" scenario line in `neuron-family-mastery`.
- Verify the 11 families are visually distinguishable on the grid; regen individual sprites only on a real defect.
- Hand off a "suspect numbers" list + the first-pull-visibility finding to a `openspec/decisions/` note for the future rebalance change.

**Non-Goals:**
- ❌ Any pacing/cap/energy **number rebalancing** → separate future `rebalance-neurons-*` change.
- ❌ Removing schema-layer NT-branch artifacts (synced meta keys / R2 bundle) → flag only; removal needs a Dexie/R2 upgrade fixture.
- ❌ Full sprite regen → only individual broken sprites.
- ❌ Changing first-pull's by-design 4-NT-branch onboarding or `neurons-character-card`'s by-design NT-branch grouping.

## Decisions

### D1 — Residual vs intentional classification (audit rubric)

A reference matrix the audit applies; "intentional" items are confirmed and left untouched.

| Item | Verdict | Why |
|---|---|---|
| `economy.ts` per-family pools (`maze:<familyId>:earned/:settles`) | ✅ clean (confirmed) | Direct read: keys use CJK `familyId`; `accrueMazeEnergy(familyId)` → family's own pool; reading splits across active families; settle → `pullVariant(familyId)`. No NT-branch indirection. |
| `first-pull.ts` 4-NT-branch ritual + `maze:<branch>:starterFamily` keys | ✅ intentional | Own `neurons-first-pull` spec; deliberate「四大家族各誕生一隻」onboarding gift; keys are first-pull's, not retired maze keys. |
| `neurons-character-card` NT-branch-grouped cards | ✅ intentional | Owner-declared by-design (teaching anchor); `neurons-mode` L491 makes it the explicit exception. |
| `circuit-locations.ts` mesolimbic/nigrostriatal etc. | ✅ intentional | Real neuroanatomy pathway names for maze crossing-point naming, not a 4-branch grouping. |
| NT-named items/cosmetics (`items.ts`, `cosmetics.ts`) | ✅ intentional | Flavor content (GABA-B receptor, dopamine vesicle), not mechanics. |
| `neuron-variant-gacha` L390 "retired four-branch keys MAY remain… rollback safety" | ✅ intentional | Deliberate reader-tolerance note for rollback. |
| `first-pull.ts` docstring `maze:<branch>:settles/earned`; `r2/bundles.ts:68` comment | 🧹 residual (clean) | Code-logic-layer stale comments that misdescribe the now per-family economy. No behavior. |
| `neurons-brain-maze` Purpose (L5) four-region prose | 🧹 residual (fix prose) | Contradicts its own Requirements (L9/40/240 correctly describe the 11-family grid). Non-normative. |
| `neuron-family-mastery` L179 "藥理學's NT branch" | 🧹 residual (spec delta) | Inside a normative scenario; should be "family energy pool". ×1.30 semantics unchanged. |
| Genuinely-retired per-branch synced/bundle keys (if any beyond first-pull's) | 🚩 flag only | Schema-layer → removal needs upgrade fixture → out of scope. |

### D2 — Two-tier residual handling

Code-logic-layer residuals (comments, docstrings, dead local helpers with no schema/persistence footprint) → **cleaned in this change**. Anything that touches `SYNCED_META_KEYS`, R2 bundle keys, or Dexie schema → **flagged only** (a finding), never edited here, because removal would require a v(N-1)→v(N) upgrade fixture (`pnpm lint:dexie-fixtures`) and a `SCHEMA_VERSION` bump — a different risk class the owner kept out.

### D3 — `neurons-brain-maze` Purpose = direct edit, not a delta

The Purpose paragraph is non-normative prose. Per the spec-workflow rule, a markdown/prose fix that changes no SHALL/MUST may be edited directly on the main `openspec/specs/neurons-brain-maze/spec.md`. Its Requirements are already correct, so there is **no requirement delta** for this capability — it is therefore NOT in the proposal's Modified Capabilities (only `neuron-family-mastery` is). Done during apply, validated by `openspec validate`.

### D4 — Audit deliverable is a finding-set, not auto-fixes

The audit produces (a) a P1–P5 findings list and (b) a **suspect numbers** list for the future rebalance change. These are written to design.md (archived with the change) AND copied to a `openspec/decisions/<date>-neurons-mechanics-rebalance-input.md` note so the next session can pick them up without re-deriving. No number is changed here.

### D5 — Sprites: verify-only, regen on real defect only

Confirm via the maze render (Chrome MCP) that all 11 families are distinguishable (the tileset already does per-family axon tinting per `neurons-brain-maze` Req "redundant channels — color, line style, node shape"). Only if a specific family is visually ambiguous / encodes a retired NT-branch visual do we regen that one sprite (Gemini per `image_gen_routing.md`).

## Preliminary audit findings (built up during propose; finalized in apply)

- **Energy** — ✅ `economy.ts` confirmed per-family (11 pools), no NT-branch indirection; reading splits across active families; settle consumes `cost(N)` and triggers one `pullVariant(familyId)`.
- **First-pull** — ✅ resolves the grill's open question: 4-NT-branch grouping is **by-design** (own spec); its `maze:<branch>:starterFamily` keys are legitimate, not residual maze keys. Its docstring's `maze:<branch>:settles/earned` reference is stale → clean.
- **Spec grep** — only `neuron-family-mastery` L179 is a requirement-level stale; `neurons-brain-maze` Purpose is non-normative stale; `neuron-variant-gacha`/`neurons-acceleration-system`/`neurons-mode` requirements are correct/intentional.
- **Still to confirm in apply** — `acceleration.ts` (`energyAccel(familyId)` per-family compose + `family-buff` `dmnActiveBuffs` family-scoping maps to real family ids + speed/energy equipment lanes); `variant-gacha.ts` `pullVariant` purely per-family (二週目 least-collected per-family); `mastery-tier.ts` `masteryEnergyMultiplier` fold-in; full grep of `lib/maze/*` + `lib/services/*` comments.

### Suspect numbers list (input for the future rebalance change)

Faucet/cost constants live in `content-neurons-tw` (single source of truth). Flagged because the maze went from 4 pools → 11 pools, so each pool fills ≈ 2.75× slower for the same play if reading-split is the dominant faucet:

| Constant | Current | Why possibly imbalanced under 11 pools |
|---|---|---|
| `PACING_BASE` | 14 | First settle cost; with 11 pools each filling slower, first-pull-per-family pacing may feel too slow. |
| `PACING_K` | 0.10 | Ramp slope into 二週目; interacts with pool count. |
| `CORRECT_ANSWER_ENERGY` | 3 | Per-correct, goes to the answered family only — concentrated, probably fine; confirm vs reading. |
| `READING_MINUTE_ENERGY` | 3 | Split across active families → per-family yield shrinks as the player collects more families. |
| `energyAccel` cap | 2.5 | Runaway guard; revisit only if rebalance changes the base. |
| `speedAccel` cap | 2.0 | Same. |

→ These are **recorded, not changed**. The rebalance change should validate against dogfood telemetry.

## Risks / Trade-offs

- **[Over-cleaning an intentional NT-branch reference]** → D1 matrix + the owner's explicit "intentional survivors" list gate every edit; when in doubt, flag instead of clean.
- **[Scope creep into rebalancing]** → hard Non-Goal; suspect numbers are recorded only.
- **[Missing a residual in a less-obvious file]** → apply does a full grep of `lib/maze/*` + `lib/services/*` + a re-grep of all neurons specs, not just the five named ones.
- **[Sprite regen pulls in image-gen flakiness]** → only triggered on a confirmed defect; default path is verify-only.

## Migration Plan

Zero-schema, comment/prose/scenario-wording edits + a decisions note. Deploy = merge → main (CF Pages auto-deploy). Rollback = revert the single commit (no data/schema implications). The first-pull-visibility finding is deferred to owner decision; the suspect-numbers list feeds a later change.

## Open Questions

- **First-pull 四大家族 onboarding visibility** — `FirstPull.tsx` surfaces「四大家族各誕生一隻」to the player while the rest of the game presents no 四大家族 taxonomy. Is keeping this onboarding framing acceptable, or should the copy be neutralized to per-family? **Surfaced as a finding for owner decision; not changed in this audit.**
