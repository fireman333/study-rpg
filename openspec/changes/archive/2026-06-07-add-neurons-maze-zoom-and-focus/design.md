## Context

The neurons maze (`apps/neurons-tw/src/components/maze/MazeGrid.tsx`, 922 lines) is the homepage centerpiece. It already has a `Cam {cx, cy, zoom}` camera with smooth lerp, **desktop wheel-zoom + drag-pan**, and subscribes to `lib/maze/maze-focus.ts` — a pub/sub bus where a **correct answer** emits `familyId` and the camera zooms to that family's walker for ~4.5s (`focusRef.until`), with manual wheel/drag overriding auto-focus via `manualUntilRef`. The camera behavior is also already specified (`neurons-brain-maze` → "Maze camera SHALL be activity-contextual").

The economy (`lib/maze/economy.ts`) maintains 11 per-family energy pools in `meta` keys `maze:<familyId>:earned` / `:settles`. A correct answer in subject S accrues to S's pool (`connectome.ts recordCorrectAnswer` → `accrueMazeEnergy`). **Settle is automatic**: `useMaze.recompute()` (the single homepage subscription) runs `reconcileSettles` whenever `affordableSettles(earned) > settles`, consuming `cost(N)` + advancing the walker + firing one `pullVariant`. Reading currently splits energy across active families (`accrueReadingEnergyActiveFamilies`), driven by `reading-timer.ts` which each game-minute fires `(a) meta['totalStudyMinutes']++` (global; feeds achievements `study` + leaderboard `total_study_min` + character card) and `(b)` the energy faucet.

This change fills three gaps (mobile touch, manual focus, subject-agentic reading) plus a quiz-time feedback surface — all presentation + one economy faucet, no schema.

## Goals / Non-Goals

**Goals:**
- Maze is zoom/pan-explorable on a phone (pinch + drag + double-tap recenter) without hijacking page scroll.
- Player can manually focus any subject's cluster (sticky) and recenter, reusing the existing FamilyPicker.
- Reading is per-subject: 11 reading entries (one per family card), energy all to the chosen subject, camera focuses it; anti-cheat timer + global study-minutes preserved.
- Quiz answers give live maze-energy feedback (cheap strip) that escalates to a "walker advances one node" mini-animation exactly when a settle threshold is crossed.
- **Zero schema / sync footprint** (no Dexie bump, no R2 `SCHEMA_VERSION` bump, no new synced meta key).

**Non-Goals:**
- Energy/pacing number rebalance → `rebalance-neurons-*` (per-subject reading slows per-pool fill, but tuning is deferred; this change keeps `PACING_*` / `READING_MINUTE_ENERGY` constants as-is).
- Pixel font → `polish-neurons-pixel-font`.
- Bespoke 二回目 second-route camera logic (camera must merely not break on path2/nodeCells2 nodes).
- Persisting zoom/pan across sessions (explicitly not persisted → keeps footprint zero).
- Art regen (only if the zoom work surfaces an actual visual defect).

## Decisions

### D1 — Mobile touch: pinch-zoom + 1-finger pan + double-tap recenter, scoped against page scroll
Add `touchstart`/`touchmove`/`touchend` handlers to the maze canvas: two-finger → pinch zoom (anchor on the pinch midpoint), one-finger → pan (writes the same `targetRef`/`camRef` the wheel/drag path uses), double-tap → recenter. Gesture-vs-page-scroll is handled with `touch-action: none` on the canvas element + scoped `preventDefault` on the maze's own touch handlers only (the homepage panel already has `overscroll-behavior` containment per `neurons-homepage`). Touch interaction sets `manualUntilRef` the same way wheel/drag does (so auto-focus yields).
*Alternative rejected*: on-screen +/- buttons (owner picked native map gestures).

### D2 — Manual focus is sticky, via the FamilyPicker; a recenter control returns to whole-map
Extend `maze-focus.ts`: `emitMazeFocus(familyId, { manual?: boolean })`. Manual focus sets a **sticky** focus (no `until` expiry) that holds until the next user interaction (pan/zoom/another family/recenter). The existing answer-driven `emitMazeFocus(familyId)` stays time-boxed (4.5s) BUT is suppressed while a sticky manual focus is active. Add `emitMazeRecenter()` + a 「全覽」 button overlay on the maze that clears sticky focus and frames the whole map. Tapping a FamilyPicker card calls `emitMazeFocus(card.familyId, { manual: true })`.
*Alternative rejected*: a separate 11-button row (owner picked reuse-FamilyPicker).

### D3 — Reading is per-subject: faucet + camera + session all key on a familyId
- `economy.ts`: **remove** `accrueReadingEnergyActiveFamilies` (the split helper, now orphaned); reading accrues via the existing `accrueMazeEnergy(familyId, READING_MINUTE_ENERGY)`.
- `reading-timer.ts`: the session carries a `familyId`. `start(familyId)` stores it; each game-minute fires `(a) totalStudyMinutes++` (UNCHANGED — stays global, so achievements/leaderboard/character-card are untouched) and `(b) accrueMazeEnergy(currentFamilyId, READING_MINUTE_ENERGY)`. Switching family = `stop()` then `start(otherFamily)` (one subject at a time). All anti-cheat (visibilitychange pause, 90s idle pause, ≤ +1/min) is unchanged.
- `useReadingTimer.ts` exposes the current reading `familyId` + `start(familyId)`.
- Camera: starting a reading session emits a sticky focus to that family (the activity-contextual "reading" framing changes from whole-map to focus-the-reading-subject).
*Alternative rejected*: keep both a global reading toggle and per-subject entries (owner Q5 chose full per-subject).

### D4 — Quiz feedback: cheap DOM strip by default, canvas mini-maze only on a settle-crossing
- **`EnergyFeedbackStrip`** is **DOM/CSS, not canvas** (cheapest path; resolves the "single-family slice render" worry): the answered family's sprite + a CSS progress bar driven by `walkerFraction(state)` + a `+N energy` label. Appears after a correct answer, above the 詳解; mobile ~64px / desktop ~120px; `pointer-events: none`; reduced-motion → static end-state.
- **Escalation detection** (settle is automatic — verified): on a correct answer, compute `affordableSettles(earnedBefore)` vs `affordableSettles(earnedAfter)` for the family; if it increased, a node settle is now due → escalate. The escalation opens a **small focused canvas** that **replays** the walker advancing one node (purely visual; the real settle/pull is performed by the homepage `useMaze` reconcile in the background). rAF runs only during the ~2s animation then stops; render only the focused family's subgrid; DPR-capped; do NOT start the canvas during the Framer Motion modal enter/exit. The focused-canvas may reuse `MazeGrid` in a non-interactive single-family mode or a minimal bespoke draw — apply picks the lighter path.
- On modal close, the homepage maze still runs its existing 4.5s auto-zoom.
*Source*: Codex (gpt-5.5) consult 2026-06-07 — recommended the cheap post-answer strip over an always-on embedded live mini-maze for mobile legibility; owner's synthesis adds the settle-crossing escalation.

### D5 — Continuous zoom, clamped, not persisted
Pinch/wheel set a continuous `zoom` clamped between whole-map fit and single-cluster framing (`FOCUS_SPAN`-derived max). Returning to the homepage resets to the default framing (no persisted zoom) → no new meta key, footprint stays zero.

### D6 — Zero schema/sync (verified)
Per-subject reading runs on the existing per-family `maze:<familyId>:earned` pools — no new key, no rename (the synced `maze:<familyId>:*` keys are frozen). `totalStudyMinutes` stays a single global counter. Zoom is not persisted. No Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no `SYNCED_META_KEYS` change. If apply discovers any needed persistence (e.g. a "last reading subject" convenience), it MUST be surfaced rather than silently bumping schema (the change would then re-scope).

## Risks / Trade-offs

- **Touch gesture hijacks page scroll** → `touch-action: none` on the canvas + scoped `preventDefault` only inside the maze handlers; verify with the `chrome_mcp_rwd_probe.md` class-override probe (resize_window is unreliable) on 360/414/768.
- **Second canvas perf in the modal** → rAF only during the ~2s escalation, only the focused family's subgrid, DPR cap, never during the Framer Motion modal transition; most answers show only the DOM strip (no canvas).
- **Per-subject reading slows each pool's fill** (no more spread) → a balance shift, but rebalance is explicitly out of scope (`rebalance-neurons-*`); flag for dogfood telemetry. Keep `READING_MINUTE_ENERGY` unchanged here.
- **Reading-timer singleton carries a familyId** → switching subjects must cleanly `stop()`+`start()` without double-counting `totalStudyMinutes` or leaking the prior family's accrual; covered by a unit test on the session-switch path.
- **Sticky manual focus vs answer auto-focus contention** → explicit precedence (sticky manual > time-boxed auto); recenter clears sticky. Unit/interaction-tested.

## Migration Plan

Pure client presentation + one economy faucet; no data migration. Existing saves: per-family energy pools and `totalStudyMinutes` are read as-is; the removed global-reading split simply stops being called (no stored state depended on it). Rollback = revert the change; no schema to undo. Deploy rides the normal CF Pages pipeline on merge to main.

## Open Questions (apply-phase code-verification; NOT owner decisions — most resolved by pre-propose code reads)

1. ~~Settle trigger auto vs manual~~ → **RESOLVED**: automatic via `useMaze` reconcile on `affordableSettles > settles`; escalation detection is a before/after `affordableSettles` compare.
2. ~~Per-subject reading footprint~~ → **RESOLVED**: `reading-timer.ts` fires `totalStudyMinutes` (global, keep) + the energy faucet (change). achievements `study` reads `totalStudyMinutes` (global → unaffected); DMN is expedition-bound (decoupled from reading). Only `economy.ts` + `reading-timer.ts` change.
3. **EnergyFeedbackStrip render path** → **DECIDED** as DOM/CSS for the strip; the escalation mini-maze is a small focused canvas (reuse `MazeGrid` single-family non-interactive, or minimal bespoke) — apply confirms the lighter implementation when wiring it.
4. **Mobile maze baseline** — is the maze usable on a phone today? → verify-phase baseline-check with the class-override RWD probe before declaring the touch work done.
5. **Zero-schema confirmation** — if anything turns out to need persistence, surface it (re-scope) rather than silently bumping Dexie/R2/`SYNCED_META_KEYS`.
