## Why

The neurons maze (the homepage centerpiece) has desktop wheel-zoom + drag-pan and auto-zooms to the answered family on a correct answer, but on **mobile there is no touch zoom/pan**, there is **no way to manually focus a chosen subject** (focus only fires automatically on a correct answer), and the **reading loop has no subject agency** (one global timer splits energy evenly across all collected families, so the player can't decide what to grow). This change closes those three UX gaps so the maze is explorable on a phone, steerable by the player, and the reading loop becomes a deliberate per-subject investment.

## What Changes

- **Mobile touch zoom/pan**: the maze gains two-finger pinch-zoom + one-finger drag-pan + double-tap-to-recenter, scoped so the gesture does not hijack page scroll. (Desktop wheel+drag is unchanged.)
- **Manual subject focus via the FamilyPicker**: tapping a family card flies the camera to that family's cluster and **stays there** (sticky) until the next interaction. A **「全覽 / recenter」** control returns to the default whole-map framing. The existing answer-driven auto-focus still briefly (4.5s) returns to the answered family, but it does **not** interrupt an active manual focus.
- **Reading becomes per-subject** **BREAKING (gameplay)**: the single global 「📖 開始閱讀」 toggle is **removed** from the CTA toolbar; each of the 11 family cards in the FamilyPicker gains its own 「📖 閱讀」 entry. Reading a subject accrues **all** of the per-minute energy to **that subject's** pool (replacing the even-split-across-active-families faucet) and focuses the camera to that subject. One subject at a time (switching ends the prior session). The anti-cheat reading timer (visibilitychange pause + 90s idle pause + ≤ +1/min) and the global `meta['totalStudyMinutes']` counter (achievements / leaderboard / character card) are unchanged.
- **Quiz-time energy feedback (QuizModal)**: after a correct answer, a lightweight non-interactive **`EnergyFeedbackStrip`** appears above the 詳解 (mobile ~64px / desktop ~120px) showing the answered family + a live `+N energy` accrual toward the next maze node. When that accrual **crosses the threshold to settle the next node**, the strip **escalates** to a brief mini-maze that plays the walker advancing one node. Display-only (no pinch/pan), rAF runs only during the ~2s animation then stops, DPR-capped, reduced-motion → instant cue. The homepage maze still does its existing 4.5s auto-zoom on modal close.
- **Continuous zoom**, clamped between whole-map and single-cluster framing, **not persisted** across sessions (every return to the homepage resets to the default framing).

## Capabilities

### New Capabilities
<!-- none — all surfaces extend existing capabilities -->

### Modified Capabilities
- `neurons-brain-maze`: (1) the activity-contextual camera gains mobile touch input, sticky manual focus, and a recenter control, and the **reading** framing changes from whole-map to focusing the chosen subject; (2) the growth-signal economy's **reading** faucet changes from even-split-across-active-families to all-to-the-chosen-subject; (3) a new requirement for the quiz-time `EnergyFeedbackStrip` + settle-threshold escalation animation.
- `neurons-homepage`: the global reading toggle is removed from the CTA toolbar; the FamilyPicker becomes the per-subject reading + camera-focus hub (each family card starts that subject's reading and focuses the camera).

## Impact

- **Code (presentation + one economy faucet, no schema/sync)**:
  - `apps/neurons-tw/src/components/maze/MazeGrid.tsx` — mobile touch handlers; sticky manual focus; recenter control; reading-subject framing.
  - `apps/neurons-tw/src/lib/maze/maze-focus.ts` — extend the focus bus (manual sticky mode + recenter signal).
  - `apps/neurons-tw/src/lib/maze/economy.ts` — replace `accrueReadingEnergyActiveFamilies` (split) with per-subject accrual; remove the orphaned split helper.
  - `apps/neurons-tw/src/lib/services/reading-timer.ts` + `lib/hooks/useReadingTimer.ts` — the reading session carries a `familyId`; per-minute energy accrues to that family (`totalStudyMinutes` unchanged).
  - `apps/neurons-tw/src/components/FamilyPicker.tsx` — per-family 📖 reading entry + camera-focus on card tap.
  - `apps/neurons-tw/src/routes/OverviewPage.tsx` — remove the global reading toggle from the CTA toolbar; wire per-subject reading + focus down to the FamilyPicker.
  - `apps/neurons-tw/src/components/QuizModal.tsx` — `EnergyFeedbackStrip` + settle-threshold escalation.
- **No schema / sync change** — target zero Dexie bump, zero R2 `SCHEMA_VERSION` bump, zero new synced meta key. Per-subject reading runs on the existing per-family `maze:<familyId>:earned` pools; zoom is not persisted. (Confirmed in design; surfaced if any persistence sneaks in.)
- **Out of scope (separate changes)**: energy/pacing number rebalance (`rebalance-neurons-*`), pixel font (`polish-neurons-pixel-font`). Not planned but tolerated: art regen (only if zoom surfaces a visual defect), 二回目 second-lap bespoke camera (camera must merely not break on path2 nodes).
