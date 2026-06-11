# Tasks — rebuild-neurons-onboarding-as-guided-tour

## 1. Pure tour engine (testable, node-safe)

- [x] 1.1 Create `src/lib/services/onboarding-tour.ts`: `TOUR_ORDER` + `TOUR_STEPS`（id / anchors[] / 繁中 lead+body / nextLabel / advanceOn events）+ pure `advanceTourStep(current, event)` transition — `connectome.variantSlotUnlocked` from ANY active step jumps to terminal `done`.
- [x] 1.2 Add `resolveTourAnchor(anchors, query?)` + default `domAnchorQuery`: `document.querySelector` → `getBoundingClientRect`, returns `null` on missing element / zero-size rect / thrown error / no `document`（node test env）. First matching selector wins; all-miss → `null`（centered-card fallback signal）.

## 2. Spotlight engine (layout-agnostic, non-blocking)

- [x] 2.1 Create `src/components/onboarding/SpotlightOverlay.tsx`: rAF-throttled anchor measurement re-run on `resize` + capture-phase `scroll` + a light interval（catches anchors mounting/unmounting, e.g. QuizModal opening）; renders a fixed pointer-events-none hole（huge box-shadow dim + gold border）over the anchor box and positions the instruction card above/below with viewport clamping.
- [x] 2.2 Graceful degrade: when no anchor resolves, render the SAME card centered with no hole — never a spotlight over nothing, never a crash. Dim/hole layers are `pointer-events: none` throughout so the highlighted element stays clickable（non-blocking）.
- [x] 2.3 Respect `prefers-reduced-motion`（no pulse animation on the hole; static fallbacks）via `useRespectsReducedMotion`.

## 3. Guided tour steps + welcome card

- [x] 3.1 Create `src/components/onboarding/GuidedTour.tsx`: welcome card（置中、≤3 行白話核心循環、開始引導／跳過、click-through backdrop）→ spotlight steps 閱讀 → 答題 → 腦圖 → 儀表板 → 終點待機條 → 🎉 慶祝（reuse CelebrationHalo / ParticleBurst, reduced-motion aware）.
- [x] 3.2 Subscribe ONLY to existing gameplay events while active: `onAnswerCorrect`（quiz step auto-advance）、`onReadingTimerStateChange` + `getReadingTimerState().status === 'reading'`（reading step auto-advance）、`connectome.variantSlotUnlocked`（terminal from any step）. No walker / energy / gacha modification.
- [x] 3.3 Every step has 跳過引導; spotlight steps additionally offer 下一步 manual advance（player is never trapped behind a gameplay gate except the terminal extraction wait）.
- [x] 3.4 Add `data-tutorial="quiz-answer"` to the QuizModal answer-options container（single additive edit; nothing else in QuizModal）.

## 4. Host rebuild + expedition spotlight upgrade

- [x] 4.1 Rebuild `OnboardingHost.tsx` internals: phases loading/tour/idle; first-run gating via `maybeAutoCompleteForExistingPlayer` + `getGuidedComplete`（unchanged）; complete/skip both set `guidedComplete`; HelpMenu replay（`onReplayGuided`）re-runs the tour from the welcome card（keyed remount）. Mount point in OverviewPage untouched.
- [x] 4.2 Expedition benefit spotlight now renders through SpotlightOverlay targeting `[data-tutorial="expedition"]`（fallback: centered card）; keep one-shot `expeditionSpotlightSeen` gate + deferral while the tour is active（pending ref）.

## 5. State + HelpMenu

- [x] 5.1 `src/lib/services/onboarding.ts`: NO new keys — update doc comments to describe the tour; `ONBOARDING_KEYS` / reset-clear / `maybeAutoCompleteForExistingPlayer` semantics unchanged（verified `resetConnectomeForDebug` still clears all keys）.
- [x] 5.2 HelpMenu 新手引導 section copy aligned to the tour（歡迎卡＋逐步聚光）; 「重看新手引導」 replay entry kept.

## 6. Tests + verify

- [x] 6.1 Extend `src/__tests__/onboarding.test.ts`: tour step progression（happy path、event-gated steps、terminal jump from any step、unknown events no-op）、anchor resolution graceful degrade（missing / zero-size / throwing query / selector priority）、replay bus、existing-player auto-complete、device-local persistence + reset clear（kept）.
- [x] 6.2 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` green; confirm diff has no Dexie `.version()` bump, no `SYNCED_META_KEYS` addition, no `styles.css` / OverviewPage / FamilyPicker edits.
- [x] 6.3 Orchestrator unified end-to-end check ✓ (Chrome MCP, desktop): welcome → reading 自動往下捲、腦圖步驟往上捲、聚光燈正確 frame `data-tutorial` anchors. 過程抓到並修掉「step 進入不 scroll anchor into view」bug（multi-pass instant scrollIntoView）. Mobile positioning: 因 viewport 無法模擬 → Fable 5 code-audit 抓修 2 個手機 bug（hidden-DockHeader 誤命中、card 底部裁切）+ 596 unit tests（含 placement sweep）. 真機 dogfood + prod build 待 owner.
