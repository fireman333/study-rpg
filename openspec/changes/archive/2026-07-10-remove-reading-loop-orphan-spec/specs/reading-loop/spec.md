## REMOVED Requirements

### Requirement: Reading timer pauses when tab is hidden
**Reason**: 一階 app (`apps/medexam-tw`) was deleted on 2026-06-03 (`remove-medexam-tw-and-promote-neurons`); the `reading`/`readMs`/`visibilitychange` implementation this requirement governed no longer exists in `apps/` or `packages/`.
**Migration**: The live, current reading-timer規範 lives in `openspec/specs/neurons-mode/spec.md` (neurons reading-timer retains tab-visibility auto-pause with no auto-resume). No code migration — the 一階 code was already removed with `apps/medexam-tw`.

### Requirement: Reading timer pauses on idle
**Reason**: This requirement mandates a 90 000 ms (90 s) input-idle auto-pause keyed on `READING_IDLE_TIMEOUT_MS`. That behavior was deliberately removed from the neurons reading-timer in `remove-neurons-reading-timer-idle-pause` (archived 2026-06-11) because real reading produces no input events (it punished genuine readers while barely deterring AFK farming). This orphan requirement now directly contradicts the current product decision.
**Migration**: `openspec/specs/neurons-mode/spec.md` now normatively states there is **no** input-idle pause (pause-reason domain `'manual' | 'visibility' | null`). No 一階 code remains to migrate.

### Requirement: Per-tick reward cap is enforced
**Reason**: Governs the 一階 `READING_TICK_MS` (10 000 ms demo / 60 000 ms prod) reward-cap loop, whose code was deleted with `apps/medexam-tw`. `READING_TICK_MS` has zero references in surviving `apps/` and `packages/`.
**Migration**: neurons reward cadence is owned by `neurons-mode` (per-minute tick / anti-farm cap) independently of this spec. No code migration.

### Requirement: Pause reason is observable in UI
**Reason**: Describes 一階 UI hint text for `'visibility'` / `'idle'` pause reasons next to the 一階 reading button — UI that was removed with `apps/medexam-tw`.
**Migration**: neurons surfaces its own visibility pause hint per `neurons-mode`; the `'idle'` reason no longer exists anywhere. No code migration.

### Requirement: Timer state is not externally mutable
**Reason**: Anti-cheat guard over the 一階 `reading` boolean / `readMs` accumulator and forbidden `window.setReading` / `window.readMs` globals — all referencing identifiers that no longer exist in the repo.
**Migration**: neurons enforces equivalent timer-integrity invariants under `neurons-mode`. No code migration — the guarded 一階 surface was deleted with `apps/medexam-tw`.
