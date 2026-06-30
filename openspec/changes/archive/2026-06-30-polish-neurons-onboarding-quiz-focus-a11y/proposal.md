## Why

The 6/30 homepage redesign (`redesign-neurons-homepage-squad-and-maze-focus`) made the per-card 「🔍 聚焦」 chip the primary maze-navigation affordance, but the guided onboarding tour predates it and never teaches it. A Codex adversarial review + a live Chrome MCP smoke of the tour on the redesigned homepage confirmed two genuine new-player defects: (1) the 答題 (quiz) step says 「選一個答案吧！」 while its spotlight frames a 科目卡 that shows only 🆕/🔄/🔍/📖 chips — there is no answer to choose until the player opens the quiz modal, which the tour never instructs; (2) the first-wrong-answer expedition spotlight briefly flashes a centered card before re-framing the ⚔️ button because of an event-ordering race. We fix these now while the redesign is fresh, plus a small batch of adjacent polish.

## What Changes

- **(P2) Fix the quiz step's misleading pointer**: add a `data-tutorial="quiz-start"` anchor to the 「🆕 新題」 button; the quiz step frames that button when the modal is closed and the 「選項格 (`quiz-answer`)」 once the modal opens; reword the copy so it is correct in both states (「點科目卡的 🆕 新題 開一題」 → 「選一個答案」).
- **(P2) Teach the 🔍 聚焦 chip**: add a `data-tutorial="maze-focus"` anchor to the per-card 聚焦 button and insert one short tour step (after 腦圖, before 儀表板) explaining that 聚焦 only moves the maze camera and never hides the 科目卡.
- **(P2) Remove the expedition-spotlight flash**: defer the first-wrong-answer benefit spotlight until the `[data-tutorial="expedition"]` anchor actually resolves (or until after the `everWrong` write completes), so it frames the ⚔️ button on first paint instead of degrading to a centered card and snapping.
- **(P3) Accessibility**: give the spotlight/welcome instruction card dialog semantics (`role="dialog"`, initial focus to the primary control, Esc → skip) instead of relying on `aria-live` alone.
- **(P3) Clean up a stale meta key**: best-effort one-time startup delete of the orphaned `neurons:onboarding:expeditionRevealed` flag (a leftover from `improve-neurons-onboarding`; the current code derives the reveal from `questionHistory.everWrong` and never reads this key, and it is not in `ONBOARDING_KEYS` so account-reset does not clear it).
- **(P3) Reduce render churn**: hoist the `ExpeditionSpotlight` anchors array to a module constant so the overlay's anchor effect does not re-run on every render.
- **(P3) Tests**: extend `onboarding.test.ts` for the new `focus` step (TOUR_ORDER / transition) and the quiz step's three-tier anchor fallback.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-onboarding`: the guided-tour step sequence gains a `focus` step (so the count is no longer "at most seven"); the 答題 step's scenario changes to frame the 🆕 新題 entry before answers exist; a new requirement/scenario covers teaching the 🔍 聚焦 camera-only model; the expedition-unlock spotlight requirement gains a "wait for the anchor before rendering (no centered flash)" guarantee; the device-local-state requirement gains cleanup of the orphaned `expeditionRevealed` key on account reset / startup.

## Impact

- **Code**: `apps/neurons-tw/src/lib/services/onboarding-tour.ts` (new `focus` step + TOUR_ORDER + quiz anchors/copy), `apps/neurons-tw/src/components/FamilyPicker.tsx` (add `data-tutorial="quiz-start"` + `data-tutorial="maze-focus"`), `apps/neurons-tw/src/components/OnboardingHost.tsx` (defer spotlight until anchor resolves + hoist anchors const + startup key cleanup), `apps/neurons-tw/src/components/onboarding/SpotlightOverlay.tsx` (dialog semantics + Esc), `apps/neurons-tw/src/lib/services/onboarding.ts` (orphan-key cleanup), `apps/neurons-tw/src/__tests__/onboarding.test.ts`.
- **Spec**: `openspec/specs/neurons-onboarding/spec.md` (delta — see Modified Capabilities).
- **No schema / sync impact** (hard constraint, unchanged): device-local `meta` flags only — no Dexie schema bump, no `SYNCED_META_KEYS` addition, no R2 bundle change, no maze/quiz/gacha core-logic change (the tour only observes existing events).
- **No new dependencies.** Tour remains skippable + replayable from HelpMenu.
