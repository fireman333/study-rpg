## Why

Per-subject first-pull (`add-neurons-first-pull-path-rep`) grants a guaranteed-P5 "path representative" the first time the player answers a family — but it is minted **silently** ([`first-pull.ts:85`](apps/neurons-tw/src/lib/services/first-pull.ts) `silent: true`), so the player never sees a gacha reveal; the neuron just quietly appears on the maze walker head. The owner's mental model (and the motivational intent) is that the first encounter with a subject's neuron should have a gacha reveal moment.

Silent mint was a deliberate choice to avoid popping a modal **during** the quiz (first-pull fires on the first answer, correct or incorrect, mid-QuizModal) — a full-screen reveal there would interrupt answering. The resolution (grill 2026-06-07, Facet 1): keep the mint silent during the answer, but play **one deferred reveal when the player returns to the maze/home** (i.e. on closing the quiz), reusing the existing `VariantUnlockModal`.

## What Changes

- First-pull continues to mint silently at answer time (no mid-quiz modal, no inline achievement-toast flood, answer flow unaffected) — but the minted P5 is now **captured into a deferred first-pull reveal queue** instead of vanishing.
- When the player closes the quiz (QuizModal unmounts → back on the maze/home), the queue is drained and each first-pull P5 is revealed via the existing `VariantUnlockModal` by re-emitting the `variantGachaEvents` `'variantRolled'` event it already listens to. No change to the modal itself.
- The grant is awaited inside `recordCorrectAnswer`/`recordIncorrectAnswer` (which QuizModal awaits before showing the answer result), so by quiz-close the reveal is reliably enqueued — no race.
- Achievement behavior is unchanged (the first-pull achievement still persists via the existing boot backfill; this change adds only the variant reveal, not an achievement toast).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neuron-path-representative`: MODIFY the first-pull requirement so the P5 is minted without an **inline** reveal during the answer, but a **single deferred reveal** is shown when the player next returns to the maze/home (on quiz close). The one-time/idempotent grant, representative-setting, and cross-device union semantics are unchanged.

## Impact

- **Code**:
  - `apps/neurons-tw/src/lib/services/first-pull.ts` — `grantFirstPullIfNeeded` captures the minted variant + enqueues a deferred reveal payload (still mints silently).
  - New `apps/neurons-tw/src/lib/services/first-pull-reveal.ts` — tiny in-memory queue (`enqueueFirstPullReveal` / `flushFirstPullReveals`); flush re-emits `'variantRolled'` on `variantGachaEvents`.
  - `apps/neurons-tw/src/components/QuizModal.tsx` — unmount-cleanup effect calls `flushFirstPullReveals()` (universal across all close paths).
- **No schema / sync change**: in-memory queue only; no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no meta key, no Worker change. `VariantUnlockModal` reused unchanged.
- **Scope**: `apps/neurons-tw` only.
- **Edge**: the queue is in-memory; if the player reloads before closing the quiz, the reveal is skipped (the variant is already collected + representative set — only the cosmetic fanfare is lost). Acceptable for a presentational reveal.
- **Tests**: unit test the queue (enqueue → flush emits the right payloads, drains, empty-flush no-ops).
