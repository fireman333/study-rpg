## Why

After the maze was flattened from a four-NT-branch brain map to a single 11-family unified grid (`redesign-neurons-maze-rotjs-grid` → `promote-maze-to-home`), nothing has verified end-to-end that the **抽卡 / 加速 / 能量** mechanics and sprites are coherent for the new per-subject (11-family) model. The `neurons-brain-maze` spec Purpose still describes the retired four-region design — directly contradicting its own (already-correct) Requirements — and scattered NT-branch references linger in code comments and one mastery scenario. This change confirms the mechanic foundation is coherent for 11 per-family pools, cleans residual NT-branch wording in the code-logic layer and non-normative spec prose, verifies sprites, and produces an audit write-up plus a "suspect numbers" list to feed a separate future rebalance change. **No gameplay-number rebalancing happens here.**

## What Changes

- **Mechanics coherence audit (write-up deliverable)** — confirm that energy (`economy.ts`, 11 per-family pools), gacha (settle → `pullVariant` per family), acceleration (`energyAccel(familyId)` per-family + `family-buff` family-scoping + speed/energy equipment lanes), and the mastery multiplier fold-in all flow through **one per-family path with no NT-branch indirection**. Tag findings P1–P5.
- **Code-logic-layer residual cleanup (no schema risk)** — fix stale NT-branch docstrings/comments that misdescribe the current per-family model (e.g. `first-pull.ts` docstring's `maze:<branch>:settles/earned`, `r2/bundles.ts:68` comment), plus any equivalents found in `lib/maze/*` / `lib/services/*`.
- **Non-normative spec-prose fix** — rewrite the stale `neurons-brain-maze` Purpose paragraph (four-region brain map / per-NT-branch energy / MazeBrainMap / 已連線 X 個腦區 → 11-family unified square grid) via direct edit; this changes **no** SHALL/MUST (the Requirements already say the right thing).
- **MODIFIED `neuron-family-mastery`** — correct the mastery-multiplier scenario's stale wording "藥理學's NT branch" → "藥理學's family energy pool"; the ×1.30 multiplier semantics are unchanged.
- **Sprite verify** — confirm the 11 families' 立繪 / maze tiles / per-family axon tints are visually distinguishable on the grid with no NT-branch-encoded visuals that should now read per-subject. **Regen individual sprites only if a real defect is found** (Gemini/codex); no full regen.
- **Deliverable handoff** — record a "suspect numbers" list (`PACING_BASE`, `PACING_K`, `CORRECT_ANSWER_ENERGY`, `READING_MINUTE_ENERGY`, `energyAccel` cap, `speedAccel` cap, settle-cost formula) with reasoning about possible imbalance now that there are 11 pools vs the old 4, AND surface the **first-pull 四大家族 onboarding visibility** as a finding — both written to a `openspec/decisions/` note as input for the future rebalance change. Neither is auto-fixed here.

## Capabilities

### New Capabilities

(none — this is an audit-and-fix change)

### Modified Capabilities

- `neuron-family-mastery`: correct the mastery-energy-multiplier scenario's stale "NT branch" wording to "family energy pool" so the spec text matches the per-family (11-pool) economy. The numeric behavior (mastery tier → ×1.0–×1.30 on the family's accrual base) is unchanged.

## Impact

- **Code (comments/docstrings only — zero behavior change)**: `apps/neurons-tw/src/lib/services/first-pull.ts` (docstring), `apps/neurons-tw/src/lib/sync/r2/bundles.ts` (comment), and any other stale NT-branch comments found under `apps/neurons-tw/src/lib/maze/` and `apps/neurons-tw/src/lib/services/`.
- **Spec (non-normative direct edit)**: `openspec/specs/neurons-brain-maze/spec.md` Purpose paragraph.
- **Spec (delta)**: `openspec/specs/neuron-family-mastery/spec.md` — one scenario's wording.
- **Deliverable docs**: an audit write-up (in this change folder) + a `openspec/decisions/<date>-neurons-mechanics-rebalance-input.md` note carrying the suspect-numbers list and the first-pull finding to the future rebalance change.
- **Zero schema / sync**: no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump (stays 16), no new deps, no `SYNCED_META_KEYS` change.
- **Flag-only (explicitly out of scope)**: schema-layer NT-branch artifacts — the `maze:<branch>:starterFamily` keys in `SYNCED_META_KEYS` are **legitimate** first-pull keys (not residual); any genuinely-retired per-branch synced/bundle keys are noted, not removed (removal would require a Dexie/R2 upgrade fixture → separate change).
- **Confirmed intentional (NOT touched)**: first-pull's 4-NT-branch onboarding (own `neurons-first-pull` spec); `neurons-character-card` NT-branch grouping (teaching anchor, owner-declared by-design); `circuit-locations` real neuroanatomy pathway names; NT-named flavor items/cosmetics; `neuron-variant-gacha` L390's reader-tolerant rollback note.
