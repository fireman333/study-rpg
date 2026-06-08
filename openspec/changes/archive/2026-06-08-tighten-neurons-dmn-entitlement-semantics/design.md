## Context

The DMN fate-card entitlement model in neurons-tw has accumulated spec debt across three recent pivots: `add-neurons-expedition-rewards` (2026-06-04) moved the time-axis source from reading-minutes to expedition-completion; `realign-dmn-event-rewards-to-maze` (2026-06-04) reworked event payoffs; and `rework-neurons-connectome-expedition-driven` (2026-06-08) removed synapse events from the behavior axis. Each change patched its own spec but left two adjacent specs inconsistent:

- `neurons-mode` still says the reading-timer publishes ticks to a DMN time-axis subscriber. The implementation (per `realign-dmn-event-rewards-to-maze` apply notes in project CLAUDE.md) decoupled it, but the spec wording wasn't updated.
- The five daily-meta keys backing the entitlement model (`dmnDrawsAvailable`, `dmnTimeAxisDrawsConsumedToday`, `dmnBehaviorAxisDrawsConsumedToday`, `dmnTimeAxisMinutesAccrued`, `dmnDailyResetDate`) live in `SYNCED_META_KEYS` but their cross-device merge semantics were never normatively documented — the bundle adapter's defaults govern by accident, which for plain LWW would silently swallow entitlement on a cross-midnight or simultaneous-spend race.
- The closed-cap endgame state (`dmnCards.length === 22` AND every equipment owned) is described as「inert / fall through」without saying whether the draw button is disabled, whether `dmnDrawsAvailable` is decremented, or how `drawDmnCard()` should respond if invoked by a stale client.

The 2026-06-08 mechanics audit (Codex consult) flagged all three as P1 because each one can either swallow a player-earned draw or duplicate-grant beyond the per-day cap.

## Goals / Non-Goals

**Goals:**
- Make `neurons-mode` and `neurons-dmn-fate-cards` internally consistent on what feeds the DMN time-axis.
- Pin the cross-device merge strategy for every daily-meta key so a future contributor (or my future self) cannot accidentally LWW them.
- Define endgame draw behavior unambiguously: disabled UI button + engine refuses to decrement + no half-state where a draw is consumed for nothing.
- Stay propose-only: zero behavior change if implementation already matches the tightened spec; surgical edits only where it does not.

**Non-Goals:**
- New gameplay mechanics. No new DMN cards, no new equipment, no new event kinds.
- Dexie schema bump or R2 `SCHEMA_VERSION` bump. The fix is at the spec layer; existing storage shape is preserved.
- Op-log persistence for `dmnConsumesTotal` / `dmnGrantsTotal`. The spec permits but does not require it; the simpler `(grants, consumes)` MAX projection is acceptable with documented limitation.
- The remaining 4 mechanics-audit gaps (P2/P3 — fusion distinct-owned, connector backfill semantics, family-mastery R2 merge, leaderboard total_settles legacy keys). Each gets its own change.

## Decisions

**Decision 1 — Reading-timer side-effect is removed from `neurons-mode` rather than from `neurons-dmn-fate-cards`.** The mixed-trigger requirement in `neurons-dmn-fate-cards` already says (in a NOTE) that reading minutes don't grant draws. Rather than further weaken that NOTE, we promote it to a normative scenario (`Reading minute boundary does NOT grant a draw`) and remove the contradicting clause + scenario from `neurons-mode`. *Alternative considered:* keep both wordings and let the dmn-fate-cards spec「override」 — rejected, OpenSpec capabilities are peer specs, not hierarchical.

**Decision 2 — Merge semantics are tied to `dmnDailyResetDate` as the gate.** Per-axis consumed-today counters merge by MAX when dates match, but reset to 0 when an incoming bundle carries a strictly-greater date. This guarantees a same-day cap can only tighten, never reopen. *Alternative considered:* monotonic-MAX without the date gate — rejected, would let yesterday's `consumedToday = 2` permanently lock out today even after reset; the date is what gives the counter a natural reset point.

**Decision 3 — `dmnDrawsAvailable` is documented as `grants − consumes`, with op-log as an opt-in upgrade path.** The simpler implementation maintains `dmnGrantsTotal` + `dmnConsumesTotal` (both monotonic-MAX) and projects `dmnDrawsAvailable = grants − consumes` at read time. Two concurrent consumes can collapse into one (documented limitation), which in practice refunds a draw to the player rather than overdrafting. *Alternative considered:* require an `dmnConsumeLog` append-only event log from day one — rejected as scope creep; the projection covers the dominant single-device case correctly and the worst-case failure is player-favoring.

**Decision 4 — Endgame guard is dual: UI button disabled AND engine refuses.** UI disable is the primary defense; engine `pools_exhausted` no-op is a stale-client safety net (a v(N-1) client rendering the button enabled by accident still cannot eat the entitlement). *Alternative considered:* engine only, UI mirrors `dmnDrawsAvailable` only — rejected, leaves a worst-case where a user spends a hard-earned draw on「nothing」, which is the exact endgame dead-state the audit flagged.

**Decision 5 — Consumable-exhausted-but-equipment-still-unowned path re-rolls equipment.** When the 22nd consumable is collected but equipment remains, every subsequent draw guarantees an equipment grant (rather than the engine returning `consumable_pool_empty`). This keeps the entitlement → reward link unbroken and matches player expectation that「I earned a draw」 always produces a collectible.

## Risks / Trade-offs

- **[The MAX projection for `dmnDrawsAvailable` can collapse two concurrent consumes into one] →** Documented in spec as accepted limitation. The failure mode refunds a player-spent draw; it cannot overdraft. Op-log upgrade is a documented future option, not a now-required mitigation.
- **[Apply phase may discover the existing implementation already matches the tightened spec everywhere] →** That's the best case. Tasks audit the 4 narrow code surfaces; apply touches only what diverges. Zero-edit apply is a valid outcome.
- **[Apply phase may discover the implementation currently uses LWW on all 5 daily keys and a non-trivial rewrite is needed] →** That's the worst case but still surgical: the merge logic lives in `apps/neurons-tw/src/lib/sync/tables.ts` adapter for these keys. The spec is permissive about projection vs op-log, so apply can choose the lightest path.
- **[Defining `dmnDailyResetDate` merge as lexicographic MAX assumes well-formed YYYY-MM-DD strings] →** Implementation already produces these (per `realign-dmn-event-rewards-to-maze` apply); no malformed values exist in the wild. Defensive parsing not required.

## Migration Plan

No data migration. Existing saves keep their current `dmnDrawsAvailable` / per-axis counters / date string. The tightened semantics activate on next sync push / pull. No banner, no Dexie bump, no R2 bump.

If apply changes the merge adapter for the daily keys, the change is forward-compatible: a v(N-1) client pushing a stale snapshot to a v(N) merge adapter still produces the same result as before for the dominant non-race case; the race-edge improvements only manifest when both devices participate.

## Open Questions

- Should `dmnGrantsTotal` / `dmnConsumesTotal` be added to `SYNCED_META_KEYS` if apply adopts the MAX projection? **Resolution**: defer to apply — if existing `dmnDrawsAvailable` LWW is the actual implementation today, the projection upgrade is the apply-phase scope-of-work; if the projection is already in place, the keys are already synced and no change is needed.
- Does the engine `pools_exhausted` no-op need a telemetry / log channel? **Resolution**: low value, skip. The state is rare and the UI guard makes invocation unlikely.
