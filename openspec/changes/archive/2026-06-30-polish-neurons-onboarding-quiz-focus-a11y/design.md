## Context

The neurons-tw guided tour (`neurons-onboarding` capability) is a pure step machine (`onboarding-tour.ts`) + React host (`OnboardingHost.tsx`) + layout-agnostic spotlight engine (`SpotlightOverlay.tsx`). Steps advance by observing existing gameplay events; spotlights resolve `data-tutorial` anchors at runtime and degrade to a centered card on all-miss. The 6/30 homepage redesign moved squad editing to `/collection` and replaced full-page maze detail-mode with a per-card 「🔍 聚焦」 camera chip. A Codex adversarial review + a live Chrome MCP smoke confirmed the tour's `quiz` step points at a card with no answers while telling the player to choose one, the tour never teaches the now-central 聚焦 chip, and the first-wrong-answer spotlight flashes a centered card before re-framing the ⚔️ button.

Hard constraints (inherited, unchanged): device-local `meta` flags only — no Dexie bump, no `SYNCED_META_KEYS` change, no R2 bundle change; the tour observes events only and never mutates maze / quiz / gacha core logic; skippable + replayable.

## Goals / Non-Goals

**Goals:**
- The 答題 step's spotlight + copy are correct whether or not the quiz modal is open.
- A new player is taught the 🔍 聚焦 camera model (the redesign's primary maze navigation).
- The first-wrong-answer expedition spotlight frames the ⚔️ button on first paint (no centered flash).
- Keyboard / screen-reader users can act on and dismiss the instruction card (dialog semantics + Esc).
- Remove the orphaned `expeditionRevealed` meta key and a small render-churn source.

**Non-Goals:**
- No change to maze / quiz / gacha / energy / settle logic.
- No new persisted onboarding flags, no Dexie/R2/sync changes.
- Not teaching squad editing in the tour (squad lives in `/collection`; out of tour scope, unchanged).
- Not converting the 答題 step into two separate steps (chosen approach is one step with a state-aware anchor list + copy).

## Decisions

### D1 — Quiz step: state-aware anchor list, not a second step
Add `data-tutorial="quiz-start"` to the 「🆕 新題」 button ([FamilyPicker.tsx:305](apps/neurons-tw/src/components/FamilyPicker.tsx:305)). The `quiz` step's anchors become `['[data-tutorial="quiz-answer"]', '[data-tutorial="quiz-start"]', '[id^="family-card-"]']`: the modal-open answer grid wins when present; otherwise the spotlight frames the 🆕 新題 entry (not the whole card). Copy is reworded to read correctly in both states, e.g. lead 「第二步：答一題試試」, body 「點科目卡的 🆕 新題 開一題，選一個答案就會餵能量。」.
- **Why over a 2-step split**: keeps `TOUR_ORDER` shorter and avoids reworking the `extract` terminal-wait wording / step-counter; the spotlight already re-measures on a cadence, so the answer grid is picked up automatically once the modal opens. Alternatives considered: (a) dynamic per-state copy (more faithful but needs the static step def to carry two copy variants — deferred as optional polish); (b) two steps (rejected per user choice + extra step-count churn).

### D2 — New `focus` step after `maze`, before `dashboard`
`TOUR_ORDER` becomes `['welcome','reading','quiz','maze','focus','dashboard','extract']`. The `focus` step anchors `['[data-tutorial="maze-focus"]']` (added to the 聚焦 button at [FamilyPicker.tsx:282](apps/neurons-tw/src/components/FamilyPicker.tsx:282)), `nextLabel='下一步'`, `advanceOn=[]` (manual advance only — there is no clean "focused" gameplay event to observe, and `variantSlotUnlocked` still terminates from any step). Copy teaches the camera-only model: 「點科目卡的 🔍 聚焦，腦圖鏡頭會飛到那一科 — 科目卡不會消失、隨時能繼續答題。」
- **Why a manual step**: 聚焦 is a navigation affordance with no settle/energy side-effect to key on; an event-gated step would strand the player. Graceful-degrade still applies (anchor missing → centered card).

### D3 — Expedition spotlight: render only once the anchor resolves
The race is that `emitAnswerWrong` (inside `recordIncorrectAnswer`, [connectome.ts:445](apps/neurons-tw/src/lib/services/connectome.ts:445)) fires before `recordQuestionResult` writes `everWrong` ([QuizModal.tsx:369](apps/neurons-tw/src/components/QuizModal.tsx:369)), so the ⚔️ button ([ConnectomeStatCard.tsx](apps/neurons-tw/src/components/ConnectomeStatCard.tsx)) is not yet mounted when `OnboardingHost` flips `setSpotlight(true)`. Fix in `OnboardingHost`: when a first wrong answer arrives and the spotlight is unseen, poll for `[data-tutorial="expedition"]` (short bounded rAF/interval, a few hundred ms cap) and only `setSpotlight(true)` once it resolves; if it never resolves within the cap, fall back to showing the (centered) spotlight so the teach is never lost. This keeps the spotlight's own graceful-degrade as the backstop while removing the visible flash in the common case.
- **Why not move the emit after `recordQuestionResult`**: that touches the quiz/connectome answer flow (a core path other features depend on); keeping the fix inside the onboarding host honors the "observe only" constraint.

### D4 — Dialog semantics on the instruction card
`SpotlightOverlay` (and the welcome/extract cards) get `role="dialog"`, move initial focus to the primary control (開始引導 / 下一步 / 知道了) on mount, and bind Esc → the step's skip handler. Keep `pointer-events:none` on the dim/hole layer (non-blocking play is a product principle) — so this is NOT a focus-trap; it is reachable-focus + Esc-to-skip. `aria-live` is retained.
- **Why not a full focus trap**: trapping focus would break the "page stays interactive / frictionless" guarantee; the goal is only that keyboard users can reach the controls and dismiss.

### D5 — Orphan key cleanup + const hoist
Add `neurons:onboarding:expeditionRevealed` deletion: include it in the account-reset clear set AND a best-effort one-time startup delete (it is never read by current code). Hoist `ExpeditionSpotlight`'s anchors array to a module-level constant so the overlay's `[anchors]` effect does not re-run on every parent render.

## Risks / Trade-offs

- [D3 bounded poll could still miss on a very slow device] → the existing graceful-degrade (centered card) is the backstop; the teach content is identical either way, only the framing differs.
- [Adding a step changes the step counter "X/N" and any test asserting the count] → update `onboarding.test.ts` (TOUR_ORDER length + happy-path walk) and the spec's "at most seven" wording in the same change.
- [D4 initial-focus could feel abrupt if it scrolls] → focus without `preventScroll:false`; the overlay already scrolls the anchor into view, so focus the card's button with `{preventScroll:true}`.
- [Stale-key delete on startup adds one `meta.delete`] → best-effort, wrapped, never blocks boot; mirrors existing onboarding flag try/catch.

## Migration Plan

No data migration. Device-local only. Deploy via the standard neurons CF Pages pipeline. Rollback = revert the change (no persisted-state shape change to undo; the deleted orphan key simply stays deleted, which is harmless since nothing reads it).
