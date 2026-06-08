## Context

The connectome conduction mechanic + its **settlement ledger** shipped in #1; this change adds the three deferred legibility/juice visuals. All the data they need already exists in `connectome.ts` / `economy.ts`:

- `creditConnectomeFromExpedition()` returns `ExpeditionConnectomeResult { effectiveCompletion, todayRepairs, newlyWired, conductionFlows, streak }` — consumed by `OverviewPage` at expedition settlement. `effectiveCompletion` is exactly the daily-ritual trigger.
- Per-subject today-repair counts live in `meta['connectome:dailyRepair:<date>']` (JSON map); the wiring gate is `REPAIR_K=2` per subject + `DAILY_PAIR_CAP=3`/day.
- `synapticConduction()` (economy.ts) already computes per-wire flows with `wireUsed` (today's used) vs `conductionWireCap(state)` (weak `CONDUCTION_WIRE_CAP_WEAK` / strong `_STRONG`), at rate `CONDUCTION_RATE_WEAK`/`_STRONG`. Legacy wires (`lastCoFireDate < CONNECTOME_CONDUCTION_EPOCH`) do not conduct.

`MazeGrid.tsx` baked-canvas-renders the synapse overlay: live `db.synapses` rows → spark glyphs at `synapseCell(a,b)` crossing cells.

## Goals / Non-Goals

**Goals:**
- Per-wire tooltip (hover + tap) on the synapse overlay showing the wire's state / rate / today's conduction usage.
- About-to-wire ghost line in the expedition settlement panel: 「再修復 X 題就能和 Y 形成連線」.
- Once-per-day completion ritual overlay on the first effective-completion of the day.

**Non-Goals:**
- No new gameplay/economy: the UI presents existing state, never grants or computes conduction/wiring.
- No schema/sync/Worker change. No change to the existing settlement ledger or the maze topology.
- No tooltip on the connectome tree (`/connectome`) — this is the homepage maze overlay only.

## Decisions

**D1: Computation stays in the engine; UI presents only (read-only helpers).**
Per the spec constraint "the UI SHALL NOT itself grant or compute conduction energy," add read-only helpers rather than computing in components:
- `getWireConductionStatuses(): Promise<Map<pairKey, { state, ratePct, todayUsed, cap, subjects: [a,b], isLegacy }>>` (or per-pair lookup) in `connectome.ts`/`economy.ts`, derived from `db.synapses` + the per-line daily-used accumulator + the CONDUCTION_* constants. Feeds the tooltip.
- `getAboutToWireHint(): Promise<{ subjectA: string; subjectB: string; remaining: number } | null>` in `connectome.ts`, derived from `meta['connectome:dailyRepair:<date>']` + `db.synapses` + `REPAIR_K`: among subject pairs not already wired (or not yet strong), pick the candidate needing the fewest additional repairs to satisfy the per-subject `REPAIR_K` gate (one side ≥K, other at k<K → `remaining = K - k`; both short → sum). Returns null when nothing is close. Feeds the ghost line. *Alternative considered:* thread a per-subject map onto `ExpeditionConnectomeResult` and compute in the component — rejected (puts wiring logic in the UI, violates D1).

**D2: Tooltip = canvas pointer hit-test, hover + tap.**
`MazeGrid` adds a pointer handler over the canvas: map client coords → cell coords (same transform the renderer uses) → match against the rendered `SynapseDatum` crossing cells (small radius tolerance) → set `hoveredWire` state → render an HTML tooltip div positioned near the pointer (NOT drawn on canvas, so text stays crisp). Desktop: `pointermove` hover (clear on leave). Mobile/touch: `pointerdown` on a wire shows it; `pointerdown` elsewhere dismisses. Content: 「藥理 ↔ 解剖 · 強連線 +12% · 今日傳導 12/15」 (legacy wires show 「早期連線 · 不傳導」). *Alternative considered:* per-wire DOM hit-targets — rejected (the overlay is baked to canvas; DOM nodes per wire would fight the bake).

**D3: Ghost line lives in the settlement panel (not a picker).**
`split-neurons-expedition-exam-modes` removed the 錯題出征 subject picker, so the ghost line moves to the post-expedition settlement recap in `OverviewPage`, beside the existing conduction ledger. After settlement, call `getAboutToWireHint()`; render 「再修復 X 題就能和 Y 形成連線」 or an honest empty line when null.

**D4: Ritual = once/day on first effective-completion, date-keyed ephemeral flag.**
In the `OverviewPage` expedition `onComplete` consumer, when `result.effectiveCompletion === true` AND `meta['connectome:ritualFired:<today>']` is absent → fire the celebration overlay (reuse the existing `celebration` state + `MazeCompletionCelebration`/`SquadCelebration` primitives) and set the flag. The flag is date-keyed and **NOT** in `SYNCED_META_KEYS` (mirrors the date-keyed daily accumulators) — a second device the same day may re-show it once; acceptable for a cosmetic overlay. Respects `prefers-reduced-motion` (the primitives already gate their animation on it).

## Risks / Trade-offs

- [Canvas hit-test imprecision on dense/overlapping wires] → Use a small cell-radius tolerance and pick the nearest crossing; if ambiguous, show the topmost (same z-order as render). Acceptable for a non-critical tooltip.
- [Ghost-line hint is a heuristic, not the exact wiring outcome (gate + DAILY_PAIR_CAP also apply)] → Frame it as a nudge; compute against the per-subject `REPAIR_K` threshold only. Worst case it slightly over-promises on a cap-saturated day — low harm.
- [Ritual flag not synced → re-show once on a second same-day device] → Intentional (cosmetic, zero-schema discipline); documented in the spec scenario.
- [prefers-reduced-motion] → Reuse primitives that already honor it; verify in Chrome MCP with the media feature emulated.

## Migration Plan

Pure additive UI. No data migration, no rollback concern beyond reverting the commit. Deploy = merge→main→CF Pages (same as prior connectome changes).
