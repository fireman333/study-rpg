## Why

The connectome rework (#1 `rework-neurons-connectome-expedition-driven`) shipped the synaptic-conduction mechanic + its settlement ledger, but three wire-legibility / juice visuals were deferred out at the time — the `neurons-homepage` spec literally carries a deferral note pointing here ("Deferred to follow-up `polish-neurons-connectome-visual`: per-wire hover tooltip + about-to-wire ghost line"). Without them, players can see *that* conduction happened (the ledger) but have no at-a-glance way to inspect an individual wire's benefit, no nudge toward the next wire they're about to form, and no daily payoff moment. This change closes that gap. It is the last item on the owner-locked connectome roadmap.

## What Changes

- **Per-wire tooltip (hover + tap)** on the maze synapse overlay (`MazeGrid.tsx`): hovering (desktop) or tapping (mobile) a wire's spark shows source/target/rate/today's cap — e.g. 「讀藥理 / 修藥理錯題 → 解剖 +12%，今日 12/15」. Canvas pointer hit-test against the synapse crossing cells; tap-away dismisses on mobile.
- **About-to-wire ghost line in the expedition settlement panel** (`OverviewPage` settlement region): after an expedition settles, surface the closest about-to-wire pair — 「再修復 X 題就能和 Y 形成連線」 — derived from per-subject today-repair counts vs the wiring gate. (Moved here from the original "錯題出征 subject picker" home, which `split-neurons-expedition-exam-modes` removed.) Honest empty state when nothing is close.
- **Daily-completion ritual overlay**: a once-per-day celebratory overlay that fires the first time today's effective-completion gate trips (the same gate that flips 今日出征 → 完成 and increments the daily streak). Reuses the existing celebration primitives (`MazeCompletionCelebration` / `SquadCelebration` + the `OverviewPage` celebration-state pattern); respects `prefers-reduced-motion`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-homepage`: MODIFY the existing "The UI SHALL make the wiring benefit (synaptic conduction) legible" requirement to un-defer and add the per-wire tooltip + the settlement-panel about-to-wire ghost line (removing its "Deferred to follow-up…" note). ADD a new requirement for the daily-completion ritual overlay (once/day, gated on the effective-completion gate, reduced-motion aware). The settlement conduction ledger requirement text is preserved.

## Impact

- **Code**: `apps/neurons-tw/src/components/maze/MazeGrid.tsx` (tooltip hit-test + render), `apps/neurons-tw/src/routes/OverviewPage.tsx` (ghost-line in settlement panel + ritual overlay wiring), reuse of existing `MazeCompletionCelebration` / `SquadCelebration` components. Read-only consumption of `connectome.ts` state (`getConnectomeStatus` / `SettlementResult` / per-subject daily repair counts).
- **Zero schema**: NO Dexie `.version()` bump. The once-per-day ritual flag is a date-keyed ephemeral `meta` key (`connectome:ritualFired:<date>`), **not** added to `SYNCED_META_KEYS` (mirrors the existing date-keyed daily accumulators). NO R2/sync change, NO Worker/D1 change. `pnpm lint:dexie-fixtures` not triggered.
- **Presentation-only**: the UI presents existing connectome state; it does NOT grant or compute conduction / wiring.
