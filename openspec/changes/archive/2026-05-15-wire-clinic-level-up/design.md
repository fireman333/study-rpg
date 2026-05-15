## Context

`hospital-management-mode` master spec (2026-05-15 archived) explicitly deferred:
- "Hospital tier upgrade thresholds" (L40-48)
- "Specific room counts per tier and per-type behaviors" (L52-54)

to this change. `wire-hospital-tycoon-engine` (2026-05-15 archived) shipped the assignment + tick + counter infrastructure but seeded only 3 outpatient rooms at startup — no tier concept yet. `Doctor` records carry `assignedRoom: string | null` but the room set is static.

The challenge: locking concrete numbers (thresholds, room counts) **before** any dogfood data exists. Per `coding_principles.md` rule 2 (simplicity first), the right approach is: pick conservative defaults that make sense by rough estimation, ship them as named constants in one file, and tune in a follow-up after dogfood reveals what feels fast vs grindy.

Constraints carried over:
- IndexedDB schema bumps must be **additive** (existing dogfood saves must auto-migrate without data loss)
- Tier upgrades trigger from inside the existing `runTick` transaction — keep atomicity guarantees from `hospital-tycoon-engine`
- Reputation monotonic; tier is monotonic by extension (no downgrade logic)
- Vibe-coding friendly: no new dependency

## Goals / Non-Goals

**Goals:**
- Lock the 3-tier roster + thresholds in one auditable file (`clinic-tiers.ts`)
- Make tier upgrade a side effect of the same Dexie transaction that writes reputation — never a separate race-prone read-then-write
- Display tier in a way that creates pull (HomePage tier badge with progress fraction to next)
- Surgery + ward rooms become real game objects at appropriate tier (already declared in `Room.type` enum but never seeded)
- Idempotent upgrade: a corrupt save that lost the upgrade trigger can re-fire it just by ticking once

**Non-Goals:**
- Tuning reputation formula → `wire-hospital-reputation`
- Tier downgrade logic → not applicable (reputation is monotonic)
- Pixel-art hospital scenes per tier → polish layer
- Room facility upgrades within a tier → `wire-hospital-spend`
- Surgery / ward asymmetric throughput rules → `wire-hospital-reputation` will refine; this change uses baseRate parity for simplicity
- Achievement / popup celebration animations beyond simple banner → polish layer

## Decisions

### Decision 1 — `hospitalTier` lives on `GameCountersRow.singleton`, not a separate `hospital` table

**Alternatives**:
- (A) Add `tier` field to existing `gameCounters.singleton` row (chosen)
- (B) New `hospital` table with single row holding tier + future tier-related metadata
- (C) Persist tier in localStorage outside Dexie

**Choice**: (A).

**Rationale**: Tier is read together with reputation in every tick — putting it on the same row eliminates a join. Dexie schema bump v2→v3 is metadata-only (no new index on `tier`); existing rows get the new field via `ensureSeed` upgrading singleton if `tier` is undefined. Future tier-related fields (achievements, unlocked banners, etc.) can join the same row until it grows beyond ~10 fields, at which point we'd split into a `hospital` table.

### Decision 2 — Room ids deterministic per tier (`outpatient-1..N`, `surgery-1..N`, `ward-1..N`) + tier upgrade is additive-only

**Alternatives**:
- (A) Deterministic ids derived from `${type}-${index}`; tier upgrade inserts ONLY new ids, never touches existing rooms (chosen)
- (B) Tier upgrade `bulkPut(TIER_ROOMS[next])` which would overwrite existing rooms with `TIER_ROOMS` defaults
- (C) UUIDs assigned on creation, lookup-on-upgrade by `(type, slot)` tuple

**Choice**: (A) deterministic ids + additive-only insert.

**Rationale**: When a tier upgrade fires we need to **append** new rooms without disturbing existing room state (notably `assignedDoctorId`). A naive `bulkPut(TIER_ROOMS[next])` (option B) would overwrite existing rooms with the constants' default values — including resetting `assignedDoctorId` to `null`, wiping the player's assignments. The fix is to compute the set difference between existing room ids and `TIER_ROOMS[next]` ids and only `bulkAdd` the new ones. (C) is complexity for no benefit since deterministic ids serve the same purpose.

Implementation: inside the same transaction, `const existingIds = new Set((await db.rooms.toArray()).map((r) => r.id))` → `const newRooms = TIER_ROOMS[next].filter((r) => !existingIds.has(r.id))` → `if (newRooms.length > 0) await db.rooms.bulkAdd(newRooms)`.

Trade-off: ids are tightly coupled to the `TIER_ROOMS` table structure. If a future change reorganizes rooms (e.g., reducing outpatient count at 中心 tier), the diff is more complex. Acceptable — tier roster is locked by this change and only `wire-clinic-level-up-v2` would re-shuffle.

### Decision 3 — Tier upgrade is a side effect of `runTick`, NOT a separate background job

**Alternatives**:
- (A) Tier check inside same Dexie transaction as reputation write (chosen)
- (B) Separate `useEffect` that watches reputation via liveQuery
- (C) Triggered explicitly on every UI render that displays reputation

**Choice**: (A).

**Rationale**: Tier transitions must be atomic with the reputation increment that caused them. If we wrote `reputation += 50` to make it exactly 1,000 and then read it in a separate transaction to check threshold, a concurrent tick could write again before our check, leading to skipped upgrade events. Keeping it in the same transaction guarantees: the moment reputation reaches the threshold, the upgrade is also committed. Bonus: upgrade event surfaces to UI via the same `TickResult.upgradedTo?` path that `wasCapped` uses.

Cost: `runTick` transaction now reads `clinic-tiers` config and writes potentially new rooms. Transaction scope expands to include `db.rooms` for write (already includes `db.rooms` for read).

### Decision 4 — Initial thresholds 1,000 / 10,000 (conservative)

**Alternatives**:
- (A) 1,000 / 10,000 (chosen — conservative)
- (B) 100 / 1,000 (aggressive, faster reward)
- (C) 5,000 / 50,000 (slow burn)

**Choice**: (A).

**Rationale**: Reputation accumulates at `throughput × elapsedSec / 60`. With 1 P3 doctor (×2.0) in 1 outpatient (baseRate 10, facility 1.0):
- Throughput = 20 patients/min
- Reputation per minute = 20
- 1,000 reputation = ~50 minutes of active tab time
- 10,000 reputation = ~8.3 hours active tab time

With multiple doctors at higher rarities (P1 = ×5.0), 50 min → ~10 min for first tier; 8.3 hours → ~1.7 hours for second tier. That feels right for the「first reward fast, long-game tier still tangible」shape. Aggressive (100/1000) trivializes; slow burn (5k/50k) creates grindy feeling without dogfood data to justify the patience cost.

**These thresholds are tunable in a follow-up change after dogfood** — they're literals in one file (`clinic-tiers.ts`), edit + bump version.

### Decision 5 — Room mix per tier biased toward outpatient

**Alternatives**:
- (A) 診所 3o / 區域 4o+1s / 中心 4o+2s+1w (chosen)
- (B) Equal type counts at each tier (forces variety)
- (C) Higher-tier rooms entirely replace lower-tier rooms

**Choice**: (A) outpatient-heavy.

**Rationale**: Outpatient is the baseline / familiar room from the prior change. Adding surgery + ward at higher tiers introduces new types without removing what the player knows. Outpatient count grows from 3 → 4 → 4 (slight, not aggressive — net new rooms come from surgery + ward additions). This creates the「more variety + more capacity at higher tier」experience without overwhelming the assign UI with 10+ rooms.

Pure outpatient growth at all tiers would be boring. Equal mix forces the player to think about specialty assignment too early (before formula differentiation lands in `wire-hospital-reputation`). The middle path here is best.

### Decision 6 — Tier label format: 「醫院：診所 (聲望 234 / 1,000 → 區域醫院)」

**Alternatives**:
- (A) Inline string with progress ratio (chosen)
- (B) Progress bar visualization
- (C) Just tier name; details in a tooltip

**Choice**: (A).

**Rationale**: HomePage already has a counter banner (revenue / reputation). Adding a third box for tier with a separate progress bar duplicates the「reputation」surface. A single text line above the counter banner that names the tier + shows fraction-to-next compresses the info elegantly. Tooltip (C) hides the goal — defeats the purpose of pulling the player forward.

When tier = 醫學中心 (terminal), display becomes 「醫院：醫學中心 ⭐」 (no fraction).

### Decision 7 — Upgrade banner is a separate component, parallel to offline-cap notice

**Alternatives**:
- (A) New `.upgrade-notice` component with celebratory styling (chosen)
- (B) Reuse the toast stack from existing recruitment / error toasts
- (C) Modal that requires user dismissal

**Choice**: (A).

**Rationale**: Tier upgrade is a once-per-tier event, deserves more visual weight than transient toasts but less than modal interruption. Mirroring `.offline-cap-notice` (already a fixed-top centered banner) keeps the UI vocabulary consistent. Auto-dismiss after 8s (longer than offline-cap's 5s because it's a positive moment the player should savor).

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Tier threshold feels grindy in dogfood | Numbers are literals in `clinic-tiers.ts` — one-file edit + new change to re-lock |
| Player at terminal tier (醫學中心) sees nothing new | Out of scope — `wire-hospital-spend` will add room-level upgrades; `wire-recruitment-banner-2` could add rare doctors |
| Migration of existing dogfood saves without `tier` field | `ensureSeed` reads counter row, if `tier === undefined` writes `'診所'` (idempotent upgrade pattern) |
| Tier upgrade fires multiple times for same threshold (race) | Single Dexie transaction; reputation read + threshold check + tier write in one atomic op |
| Surgery / ward visually identical to outpatient (no sprite diff) | Acceptable for MVP — `ROOM_TYPE_LABELS` differentiates by text. Future polish: distinct icons / background colors per type |
| `TIER_ROOMS[diet]` and `INITIAL_ROOMS` drift if both exist | `INITIAL_ROOMS` is **removed** this change (was 診所-only); single source of truth = `TIER_ROOMS` |
| Tier upgrade banner spams if browser tab closed mid-upgrade | onUpgrade callback only fires when tick's transaction commits + UI mount is alive; closed tab + no commit = no banner. Re-open with reputation already past threshold runs catch-up tick which fires upgrade idempotently (deterministic ids) |
| Player exploits clock skew to fake a tier upgrade | Already mitigated by `MAX_OFFLINE_TICK_SEC = 300` cap from `wire-hospital-tycoon-engine` — even maximum tampering nets 5 minutes of advance |

## Migration Plan

1. Fresh saves (new IndexedDB): `ensureSeed` writes counters with `tier: '診所'`, seeds all `TIER_ROOMS['診所']` rooms (= current 3 outpatient). Net behavior identical to before.
2. Existing dogfood saves with v2 schema (counters has revenue/reputation/lastTickAt but no tier):
   - Dexie v3 migration is a no-op at table-level (no new columns indexed; tier is just a JS property)
   - `ensureSeed` reads singleton, if `tier === undefined` writes `tier: '診所'`
   - Existing rooms (outpatient-1/2/3) match `TIER_ROOMS['診所']` ids exactly — no duplicates, no orphans
   - If player's existing reputation is already > 1,000 or > 10,000: next tick fires the upgrade automatically (idempotent path); single banner per tier crossed
3. Rollback: if this change ships and we want to undo, drop the `tier` field from existing singleton via DevTools + delete any rooms with id outside `outpatient-1/2/3`. Counters intact; doctors intact.

## Open Questions

- **Q1**: When player goes 診所 → 區域 → 中心 in rapid succession (e.g., loading a save with 50k reputation), should the banner show all 3 transitions stacked, or just the final tier?
  - Tentative: just the final tier. Catch-up tick fires upgradedTo with the latest tier; intermediate transitions still mutate the DB but only the latest UI event surfaces. Acceptable for dogfood.

- **Q2**: Should the upgrade banner mention which specific new rooms were unlocked (`+1 手術房`)?
  - Tentative: yes, include in banner text — gives concrete reason to navigate to `/hospital`. Hardcoded per tier transition: `升級為 區域醫院！+1 門診 +1 手術房`.

- **Q3**: At terminal tier (醫學中心), should the HomePage tier badge include a「⭐ 全院最大」 visual?
  - Tentative: yes, ⭐ suffix per Decision 6. Polished feel for the small payoff.

These resolve during `/opsx:apply` based on Chrome MCP dogfood feedback.
