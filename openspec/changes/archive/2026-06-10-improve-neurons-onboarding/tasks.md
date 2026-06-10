## 1. Onboarding state helper (pure meta keys, no schema bump)

- [x] 1.1 Add an onboarding-state helper module (mirror the `HOMEPAGE_ONBOARDING_DISMISSED_KEY` pattern in `lib/db`) exposing read/write for `neurons:onboarding:guidedComplete` and `neurons:onboarding:expeditionSpotlightSeen` — device-local `meta` keys, NOT added to `SYNCED_META_KEYS`, NO Dexie `.version()` bump. (The expedition entry's one-way reveal needs no flag — see 1.2.)
- [x] 1.2 Derive `hasEverAnsweredWrong` from any `questionHistory` row having `everWrong === true`. Implemented as a `useMemo` over the live `questionHistory` in OverviewPage — `everWrong` is monotonic, so the derivation is itself the persistent one-way reveal signal + the pre-change backstop (no separate `expeditionRevealed` flag).
- [x] 1.3 Migration-friendly default: on init, if the save already has any maze settles / answered-question history, default `guidedComplete='1'` so existing players don't see the guided overlay (they can still replay from HelpMenu). (`maybeAutoCompleteForExistingPlayer`, gated on `questionHistory.count() > 0`.)

## 2. Interactive guided overlay (non-blocking coachmark, observes existing events)

- [x] 2.1 Create the guided overlay component: a non-blocking spotlight layer (does NOT intercept input / simulate clicks) with at most four steps — ① 提示答第一題或開始閱讀 → ② 答對後聚光 walker 前進 → ③ 抽出第一隻神經元慶祝＋結束. (`OnboardingHost` → `GuidedStrip`; three states answer/progress/done.)
- [x] 2.2 Wire step advancement to the existing event surface only: subscribe to `emitAnswerCorrect` (`lib/maze/answer-feedback`) and `connectome.variantSlotUnlocked` (connectome `events` bus). Terminal step fires on `connectome.variantSlotUnlocked` so either answering OR reading reaches it. Do NOT modify walker/energy/gacha/settle code.
- [x] 2.3 First-surface copy is plain language (「答題讓腦圖長大」「走到腦區就抽出一隻神經元」); no growth cone / 白質束 / wire / 突觸 as load-bearing terms.
- [x] 2.4 Skip control on every step → sets `guidedComplete`, removes overlay immediately. Completion celebration reuses motion-library primitives (`CelebrationHalo` / `ParticleBurst`); both skip and complete set `guidedComplete`.
- [x] 2.5 Respect `prefers-reduced-motion` (static celebration via `useRespectsReducedMotion`) and design mobile-first (fixed bottom strip, safe-area-inset aware, narrow-viewport sized — not a large text card).

## 3. Just-in-time expedition-unlock spotlight + one-way reveal

- [x] 3.1 In `OverviewPage.tsx`, gate the ⚔️ 錯題出征 CTA visibility on `hasEverAnsweredWrong` (one-way): hidden for never-wrong new players; revealed (persistent) once true. Removed the always-visible-disabled「無錯題」path for never-wrong players; kept the disabled「無錯題」state for revealed players who currently have zero wrong questions.
- [x] 3.2 The CTA reveals on the first wrong answer via the monotonic `everWrong` derivation in OverviewPage (no separate flag); `OnboardingHost`'s `onAnswerWrong` handler only drives the benefit spotlight.
- [x] 3.3 Create the benefit spotlight: one-shot (gated on `expeditionSpotlightSeen`) plain-language teach — 答錯不是壞事 → 進錯題出征 → 重新答對＝修復腦圖連線＋抽 DMN 命運卡. Reachable without hovering the button tooltip.

## 4. Two-moment sequencing (no overlay collision)

- [x] 4.1 Suppress the benefit spotlight while the guided overlay is active (`phase === 'guided'`). If the player answers wrong during the guided overlay, still reveal the CTA but defer the benefit spotlight (`pendingSpotlightRef`).
- [x] 4.2 After the guided overlay completes/skips (`phase === 'idle'`), render the deferred benefit spotlight once (still gated via `expeditionSpotlightSeen`).

## 5. HelpMenu integration

- [x] 5.1 Add a "重看新手引導" entry to `HelpMenu.tsx` that re-arms the guided overlay (`requestReplayGuided` → `OnboardingHost` re-runs; the panel auto-closes via its own `onReplayGuided` subscription).
- [x] 5.2 Relocate the deeper neuroscience terms (生長錐/growth cone、白質束、突觸/synapse、Hebbian/赫布理論) into a new 🧭 新手引導 HelpMenu section glossary (progressive disclosure).

## 6. Retire static card + reset path

- [x] 6.1 Retired the static four-step `HomepageOnboarding.tsx` card (deleted; no remaining importers) and replaced its mount with `<OnboardingHost />`, so no two onboarding surfaces coexist.
- [x] 6.2 Updated the account-reset path (`resetConnectomeForDebug`) to clear `ONBOARDING_KEYS` (guidedComplete / expeditionSpotlightSeen) and still clear legacy `homepageOnboardingDismissed`.

## 7. Verify (dogfood acceptance — no telemetry)

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` green (527 tests, incl. new `onboarding.test.ts` covering the state helper + existing-player auto-complete backstop + reset clear). Confirmed no Dexie `.version()` bump and no `SYNCED_META_KEYS` addition in the diff.
- [x] 7.2 Chrome MCP dogfood (real browser, live dev server). Verified live: fresh save → guided strip with correct copy; expedition button HIDDEN for never-wrong new player (no dead button); skip removes strip; F5 persistence (guidedComplete persisted, strip stays gone); HelpMenu「重看新手引導」replays strip + auto-closes panel; first wrong reveals the expedition button; D5 sequencing (spotlight deferred while guided active); deferred benefit spotlight fires after skip with correct copy; spotlight dismiss + one-shot (no reappear). Console clean of onboarding errors. NOT visually triggered: the guided terminal「抽出第一隻神經元」celebration — its `connectome.variantSlotUnlocked` listener was confirmed attached, but a pull couldn't be forced in-harness (synthetic `addEnergy` doesn't drive `useMaze` reconcile; forced pulls failed on uninitialized `familyAccrual`, a test artifact). Wiring is a one-line listener on a pre-existing event reusing the proven `MazeCompletionCelebration` primitives. (Viewport note: `resize_window` didn't constrain the 2560px render viewport; mobile-first layout is CSS-driven — centered max-width card + safe-area insets — so checks were DOM-based.)
- [ ] 7.3 Recruit 1–2 classmates to play a fresh save on mobile and note where they get stuck (owner acceptance signal per grill).
