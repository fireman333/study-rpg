## Context

The hospital app `apps/medexam2-hospital-tw/` ships with a Dexie schema (`db/schema.ts`) that has gone through 4 versions. The v4 migration was added in `wire-hospital-quiz-ui` to add `mastery` + `questionHistory` tables and a new JS-only `hasUsedStarterPull: boolean` field on the existing `gameCounters` singleton row.

The migration logic lives in two places that **must agree**:

1. **Dexie `.upgrade()` callback** (schema.ts lines 131–141): only backfills 14 mastery rows. Does NOT touch `gameCounters`.
2. **`ensureSeed()` runtime patcher** (schema.ts lines 197–222): on every app boot, reads `gameCounters` and patches missing fields (`tier`, `hasUsedStarterPull`). This is where the bug lives.

Current `ensureSeed` logic (line 218):
```ts
if (c.hasUsedStarterPull === undefined) patches.hasUsedStarterPull = true
```

This unconditionally treats "field is missing" as "already used starter pull" — correct for v3 saves that already have doctors (the original design intent), but catastrophic for v3 saves with empty doctors table (the dogfood owner's case).

The `StarterPullCard` component reads `gameCounters.hasUsedStarterPull` (via Dexie liveQuery) and gates render on `false`. There is no other UI affordance to recruit doctors before reaching the affinity threshold (66 for 內科, 50 for general subjects). So a save with `doctors: 0` + `hasUsedStarterPull: true` is **softlocked**.

## Goals / Non-Goals

**Goals:**

- Restore playability for v3→v4 migrated saves that have `doctors: 0`, including the already-buggy state (`hasUsedStarterPull: true` set by a prior boot).
- Preserve the original design intent: v3 saves with ≥1 doctor do NOT re-receive starter pull.
- Self-heal on next page load — no manual DevTools intervention, no Reset button UI.
- Zero schema bump (stay on v4).

**Non-Goals:**

- Do NOT add a generic "Reset starter pull" button to the app (would let users replay forever, breaks single-use intent).
- Do NOT add telemetry for the recovery branch (out of scope; can be added in a future change if dogfood reveals more victims).
- Do NOT modify the `recruitment-gacha` capability or pity logic.
- Do NOT touch the Dexie `.upgrade()` callback — runtime `ensureSeed` is the canonical patcher and the bug lives there.

## Decisions

### D1: Detect bug victim by `doctorCount === 0`, not by `hasUsedStarterPull` value

**Choice**: Branch the existing-save migration logic on `doctorCount === 0` regardless of `hasUsedStarterPull` state.

**Rationale**:
- `hasUsedStarterPull` alone is ambiguous: `undefined` = fresh v3 migration, `true` = either "v3 had doctors and migration ran" OR "buggy migration already ran for v3 empty save".
- `doctorCount` is unambiguous: zero doctors after migration means the player has no path forward.
- Pairing them gives clean two-way decision: `doctorCount === 0` → recover (seed + flag=false); `doctorCount > 0` → preserve.

**Alternatives considered**:
- *Add a `migrationVersion: 1 | 2` field to `gameCounters`* — overkill, requires schema bump, hard to roll back.
- *Walk through Dexie `.upgrade()` callback to fix at upgrade time only* — doesn't help users whose buggy migration already ran (their boot history is already past `.upgrade()`).
- *Add a manual "Reset starter pull" debug button* — leaks the bug into UX, every user sees it; we want self-healing.

### D2: Recovery is a one-shot side effect, not idempotent re-application

**Choice**: When recovery fires, set `hasUsedStarterPull = false` AND seed 2 P5 starters in the same transaction. After this single boot, the user either:
- Opens the StarterPullCard modal → completes pull → `hasUsedStarterPull` becomes `true` permanently (spec Req 2 path), OR
- Ignores the card → `hasUsedStarterPull` stays `false` until they do pull, but the 2 P5 starters are already in `doctors`. Next boot does NOT re-trigger recovery because `doctorCount > 0`.

**Rationale**:
- Once 2 P5 starters exist, `doctorCount === 0` is no longer true, so the recovery branch becomes unreachable on subsequent boots — self-terminating.
- This matches the spec's "Once true, never reset in normal play" invariant — recovery is an explicit one-time codepath, not normal play.

### D3: Update the spec's "never resets" clause to acknowledge the recovery exception

**Choice**: MODIFY Req 3's "Once true, never reset" scenario to explicitly allow `ensureSeed`'s recovery branch to set `hasUsedStarterPull` from `true` back to `false`, then forbid all other codepaths from doing so.

**Rationale**:
- Keep the invariant honest. Hidden exceptions are exactly the kind of trap that caused this bug in the first place.
- Audit trail for future Claude / contributors: "Why does this codepath set the flag to false? — because spec Req 3 explicitly allows it as bug-recovery."

### D4: Same migration-recovery applies whether `hasUsedStarterPull` is `undefined` or already `true`

**Choice**: The branch condition is `doctorCount === 0`, evaluated separately from the `hasUsedStarterPull === undefined` check. The two checks act as independent inputs to a small decision matrix:

| `doctorCount` | `hasUsedStarterPull` | Action |
|---|---|---|
| `0` | `undefined` (v3, not yet patched) | Seed 2 starters + set flag to `false` |
| `0` | `true` (v3 already patched by buggy logic) | Seed 2 starters + set flag back to `false` |
| `0` | `false` (impossible state) | Same as above (defensive) |
| `> 0` | `undefined` (v3 with existing doctors) | Set flag to `true` (preserve original intent) |
| `> 0` | `true` (normal post-starter-pull or recruited save) | No-op |
| `> 0` | `false` (fresh save before pull) | No-op |

**Rationale**: Matrix is exhaustive and the action column is consistent: empty doctors always recovers, non-empty doctors preserves the existing flag (or sets to `true` if undefined).

## Risks / Trade-offs

- **[Risk] Fresh v4 save with `doctorCount === 0` could theoretically hit recovery** → Mitigation: the `!counters` branch creates `gameCounters` AND seeds 2 starter doctors in the same transaction, so any save with `counters !== null` is guaranteed to have either been through fresh-save seeding (≥2 doctors) or be a migrated save. The "fresh v4 with counters but no doctors" state is unreachable through normal play.

- **[Risk] User clears `doctors` table via DevTools to abuse re-seeding** → Mitigation: not a real attack surface (single-player offline game, no economy to exploit). If they delete doctors, getting 2 P5 starters back is the lowest-tier outcome; they could just re-roll endlessly via DevTools anyway. Acceptable.

- **[Trade-off] No telemetry on how many users hit recovery** → Accepted. We're dogfooding solo; if more victims show up later, we can add `recoveredAt` timestamp to `gameCounters` in a follow-up change.

- **[Risk] If a future v5 migration adds another conditional patch, the matrix in D4 grows in dimensions** → Mitigation: document the matrix here (D4 table) as the canonical state diagram; future migrations extend the table.

## Migration Plan

1. **Deploy the patched build** — push to track-m2, merge to main, GitHub Pages auto-deploys.
2. **Affected users open the app** — `ensureSeed` runs on boot, detects `doctorCount === 0`, executes the recovery branch in a single Dexie transaction (atomic — no half-state risk).
3. **Self-heal observable in UI** — within one page load, `StarterPullCard` re-renders (Dexie liveQuery reactive) and the 內科 + 外科 P5 medics appear in `/roster`.
4. **No rollback needed** — the recovery branch is idempotent in the sense that after firing once, the precondition (`doctorCount === 0`) becomes false. Even if the user closes the tab before pulling, next boot sees `doctorCount = 2` and skips recovery.
5. **Verification**: Chrome MCP smoke on prod after deploy — open hospital tab → confirm `StarterPullCard` visible → confirm `doctors.toArray()` returns 2 P5 starters → confirm `hasUsedStarterPull === false`.

**Rollback strategy**: if the recovery branch misfires for any reason (e.g., another bug surfaces), revert this commit. The recovery branch is purely additive — users who already had `doctors > 0` are untouched, so revert returns them to the pre-fix state losslessly. Users who already recovered via this build keep their 2 starters (no destructive cleanup on revert).

## Open Questions

(None — design is fully constrained by existing spec + observed bug state.)
