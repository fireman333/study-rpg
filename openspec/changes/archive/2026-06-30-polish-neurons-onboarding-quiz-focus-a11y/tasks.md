## 1. Anchors (FamilyPicker)

- [x] 1.1 Add `data-tutorial="quiz-start"` to the 🆕 新題 button in [FamilyPicker.tsx:305](apps/neurons-tw/src/components/FamilyPicker.tsx:305) (the `onStartQuiz('fresh')` button)
- [x] 1.2 Add `data-tutorial="maze-focus"` to the 🔍 聚焦 button in [FamilyPicker.tsx:282](apps/neurons-tw/src/components/FamilyPicker.tsx:282) (the `onFocus &&` button block)

## 2. Tour step machine (onboarding-tour.ts)

- [x] 2.1 Update `quiz` step `anchors` to `['[data-tutorial="quiz-answer"]', '[data-tutorial="quiz-start"]', '[id^="family-card-"]']` and reword `body` so it reads correctly whether framing the 🆕 新題 entry or the answer grid (e.g. 「點科目卡的 🆕 新題 開一題，選一個答案就會餵能量。」)
- [x] 2.2 Add a new `focus` step def (lead 「聚焦你想探索的科」, body 「點科目卡的 🔍 聚焦，腦圖鏡頭會飛到那一科 — 科目卡不會消失、隨時能繼續答題。」, `anchors: ['[data-tutorial="maze-focus"]']`, `nextLabel: '下一步'`, `advanceOn: []`)
- [x] 2.3 Insert `focus` into `TOUR_ORDER` between `maze` and `dashboard`; extend the `TourStepId` union; confirm `advanceTourStep` linear-walk + `variantSlotUnlocked`-terminates-from-any-step still hold for the new step
- [x] 2.4 Confirm the step-counter rendering (`新手引導 X/N`) reflects the new length with no off-by-one

## 3. Expedition spotlight race (OnboardingHost.tsx)

- [x] 3.1 Hoist the `ExpeditionSpotlight` anchors array to a module-level constant (`EXPEDITION_ANCHORS`) so the overlay's `[anchors]` effect identity is stable
- [x] 3.2 On a first wrong answer (unseen), wait for `[data-tutorial="expedition"]` to resolve (short bounded rAF/interval, ~a few hundred ms cap) before `setSpotlight(true)`; on timeout, fall back to showing it (centered) so the teach is never lost. Keep the existing tour-active deferral path intact

## 4. Accessibility (SpotlightOverlay.tsx + GuidedTour cards)

- [x] 4.1 Add `role="dialog"` to the instruction card; move initial focus to the primary control on mount (`{ preventScroll: true }`), without trapping focus (dim/hole layer stays `pointer-events: none`)
- [x] 4.2 Bind Escape on the card to the step's skip handler (welcome / spotlight steps / extract strip / expedition spotlight); retain `aria-live`

## 5. Orphan key cleanup (onboarding.ts)

- [x] 5.1 Add `neurons:onboarding:expeditionRevealed` to the account-reset clear set and a best-effort one-time startup delete (wrapped in try/catch, never blocks boot); do NOT add it to `SYNCED_META_KEYS` and do NOT bump Dexie

## 6. Tests (onboarding.test.ts)

- [x] 6.1 Update the happy-path step-machine walk + `TOUR_ORDER` length assertions for the new `focus` step (welcome → reading → quiz → maze → focus → dashboard → extract → done)
- [x] 6.2 Add a `focus`-step transition test (manual `next` advances maze→focus→dashboard; `variantSlotUnlocked` from `focus` → done)
- [x] 6.3 Add a quiz-step anchor-fallback test asserting the three-tier order (`quiz-answer` → `quiz-start` → `family-card`)
- [x] 6.4 `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` green

## 7. Verify (Chrome MCP, dev)

- [x] 7.1 Replay the tour from HelpMenu「重看新手引導」; confirm the quiz step now frames the 🆕 新題 entry (modal closed) and the answer grid (modal open), and the new 🔍 聚焦 step frames the 聚焦 button with camera-only copy
- [x] 7.2 Confirm the expedition spotlight (fresh-ish state) frames the ⚔️ button on first paint with no centered flash; confirm Esc skips and keyboard focus reaches the card controls; console clean of onboarding errors
