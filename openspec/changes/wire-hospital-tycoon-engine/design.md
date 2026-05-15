## Context

`wire-recruitment-gacha` (archived 2026-05-15) delivered the doctor obtainment side of the M_2nd game loop. Each `Doctor` is persisted with `assignedRoom: string | null` — a field deliberately reserved for this change. Currently every doctor sits in `/roster` with `assignedRoom = null` and nothing else; the loop's step 4 (`assigned doctors → rooms → throughput → revenue/reputation`) does not exist.

The master `hospital-management-mode` capability spec already locked the formula `throughput = baseRate × powerMultiplier × roomFacility` (L56-62) and the rule that unassigned rooms contribute zero (L64-69). It deferred numeric tuning + tier scaling to downstream changes, naming this one (`wire-hospital-tycoon-engine`) as the place to wire mechanics. This change fulfills that contract.

Constraints carried over from the master spec + `project.md`:
- 100% client-side; IndexedDB via Dexie is the only persistence
- Tick loop SHALL NOT drain battery when tab is hidden (`project.md` reading-timer rule: `visibilitychange` aware)
- Counter accumulation SHALL NOT silently break on tab suspend / clock skew
- No real-money loop, no external grind — pure behavior triggers
- Vibe-coding friendly: no new heavy dependency; reuse Dexie 4 + React state

## Goals / Non-Goals

**Goals:**
- Lock the room data model (Room interface + INITIAL_ROOMS seed) so `wire-clinic-level-up` has a concrete contract to extend
- Make doctors do something (assign → throughput → counter) within ≤ 1 tick after assignment
- Surface revenue + reputation on HomePage so dogfood feedback is visible immediately
- Atomic assignment transactions (room ↔ doctor bidirectional fields never drift)
- Tick loop that is correct when tab is hidden (no double-counting, no skipped time within the offline cap)

**Non-Goals:**
- Tier upgrade triggers (`診所 → 區域醫院 → 醫學中心`) — `wire-clinic-level-up`
- Room slot count scaling per tier — `wire-clinic-level-up`
- Surgery / ward room type behaviors (only outpatient at 診所 tier) — `wire-clinic-level-up`
- Reputation formula tuning (diminishing returns, room-type weights, time-of-day modifiers) — `wire-hospital-reputation`
- Revenue spending UI (upgrading roomFacility, buying tickets) — future
- Patient queue visualization (animated sprites moving through rooms) — polish layer
- Doctor cooldown / fatigue / shift mechanics — out of M_2nd scope
- Multi-doctor-per-room (each room hosts exactly one doctor in MVP)

## Decisions

### Decision 1 — Room interface lives in `@study-rpg/content-medexam2-tw`, NOT in `@study-rpg/core`

**Alternatives considered**:
- (A) `packages/core/src/types.ts` — engine-level Room type
- (B) `packages/content-medexam2-tw/src/rooms.ts` — content-pack-level (chosen)
- (C) `apps/medexam2-hospital-tw/src/lib/rooms.ts` — app-level

**Choice**: (B) content pack.

**Rationale**: Rooms are a hospital metaphor — `theme-pixel-medical` (一階) has no rooms, and any future fork (TOEFL / law exam) won't either. Putting `Room` in core forces unrelated content packs to deal with a concept they don't use, violating the engine-is-content-agnostic rule from `project.md`. App-level (C) scatters game logic outside the testable layer. Content pack is the natural home — `content-medexam2-tw` already owns subject thresholds, recruitment weights, and rarity multipliers (hospital-specific content); rooms join the family.

### Decision 2 — Initial rooms seeded as `INITIAL_ROOMS` const, not algorithmic

**Alternatives considered**:
- (A) Hardcoded const `INITIAL_ROOMS = [{...}, {...}, {...}]`
- (B) Algorithmic generator `seedRooms(tier: 診所 | 區域 | 中心)` parameterized by tier

**Choice**: (A) const.

**Rationale**: This change only ships 診所 tier. Building a generator with tier parameter now would require `wire-clinic-level-up` to dictate the contract before it's written — premature abstraction. When `wire-clinic-level-up` lands, it will refactor `INITIAL_ROOMS` into a tier-keyed table or generator; until then, const is simpler and the diff is mechanical. Aligns with `coding_principles.md` rule 2 (simplicity first) + rule 3 (surgical changes).

### Decision 3 — Tick loop runs every 5s while tab visible, capped at 5 min offline catch-up

**Alternatives considered**:
- (A) Tick every 1s — laggy UI risk
- (B) Tick every 5s while visible (chosen)
- (C) Tick every 15s — feels unresponsive for dogfood
- (D) No periodic tick, only on `visibilitychange` → compute elapsed — but then HomePage counter would freeze during a long session

**Choice**: (B) 5s with visibility awareness + offline cap.

**Rationale**: 5s is the sweet spot — frequent enough that dogfood sees the number tick up, infrequent enough that Dexie writes don't churn IndexedDB. Offline cap of 5 min (`MAX_OFFLINE_TICK_SEC = 300`) prevents the player from accumulating days of throughput by closing the tab and reopening later. Cap value is conservative for dogfood; can be tuned in `wire-hospital-reputation`.

Mechanics: `useTickLoop()` hook starts `setInterval(runTick, 5000)` on mount, listens to `visibilitychange`. When hidden, clear interval. When visible, immediately run `runTick()` (catches up missed time, capped) then restart interval. `runTick` reads `gameCounters.lastTickAt`, computes `elapsedSec = min((now - lastTickAt) / 1000, MAX_OFFLINE_TICK_SEC)`, applies throughput, writes `lastTickAt = now`. All in one Dexie transaction.

### Decision 4 — Bidirectional assignment (`Room.assignedDoctorId` + `Doctor.assignedRoom`) with Dexie transaction enforcement

**Alternatives considered**:
- (A) Bidirectional with transaction enforcement (chosen)
- (B) Unidirectional: only `Doctor.assignedRoom`, derive room state by querying all doctors
- (C) Unidirectional: only `Room.assignedDoctorId`, derive doctor state by querying all rooms

**Choice**: (A) bidirectional.

**Rationale**: `Doctor.assignedRoom` is already declared in `recruitment-gacha` schema — removing it would be a breaking spec change to a freshly archived capability. Adding `Room.assignedDoctorId` is the inverse pointer; both sides need to stay in sync.

Dexie transaction wraps assignment: `db.transaction('rw', db.rooms, db.doctors, async () => { ... })`. Both writes succeed or both abort. Test harness includes a transaction failure case to confirm atomicity.

Cost: 2 writes per assignment instead of 1. Benefit: O(1) lookup from either direction (modal lists "unassigned doctors" = `where assignedRoom is null`; room renders "who's here" = `lookup by assignedDoctorId`).

### Decision 5 — Counters as singleton row in `gameCounters` table, not localStorage

**Alternatives considered**:
- (A) Singleton row `gameCounters[id='singleton']` in Dexie (chosen)
- (B) `localStorage.gameCounters` JSON-serialized
- (C) Separate keys: `localStorage.revenue`, `localStorage.reputation`, `localStorage.lastTickAt`

**Choice**: (A) Dexie singleton.

**Rationale**: Dexie `liveQuery` already powers reactive subscriptions for the `/roster` page. Reusing it for counters means HomePage banner re-renders automatically on every tick write — zero polling, zero pub-sub plumbing. `localStorage` has no native reactivity (would need `storage` event hack which doesn't fire same-tab) + serialization overhead.

Singleton pattern: `gameCounters` table with `id: string` primary key; only one row at `id = 'singleton'`. Helper: `getCounters()` returns the row or seeds it on first call.

### Decision 6 — Tick loop is a React hook, not a Web Worker / Service Worker

**Alternatives considered**:
- (A) React `useEffect` + `setInterval` (chosen)
- (B) Web Worker pinging main thread every 5s
- (C) Service Worker with periodic background sync

**Choice**: (A) React hook.

**Rationale**: Workers add complexity without benefit at this scale — 5s tick + 3 Dexie writes is not CPU-bound. Service Worker periodic sync has spotty browser support (Chrome only, requires HTTPS + install). Main-thread interval is enough; visibilitychange ensures we don't waste CPU when hidden. If future requirement demands background ticking while tab closed → revisit with Service Worker.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Player closes tab for days → reopens → expects flood of accumulation | Offline cap (5 min). Display message if `elapsedSec` hit cap so player knows they hit the limit |
| Tick fires during Dexie write of another transaction → race | All counter writes wrapped in transaction; tick reads + writes atomic |
| Clock skew (player changes system clock backward) → negative `elapsedSec` | Guard: `elapsedSec = max(0, min(rawDelta, MAX_OFFLINE_TICK_SEC))`. Reset `lastTickAt = now` even on skip so we don't accumulate negative |
| Bidirectional assignment drift if user opens DevTools and edits one side | Acceptable — DevTools editing is dogfood-only "cheat". Add a sanity check on app boot: scan rooms + doctors, log warning if mismatch detected, leave alone |
| Tick rate too aggressive for low-end devices → battery / CPU drain | 5s + visibilitychange + cap; if dogfood reports issues, can drop to 10s without behavior change |
| Room count growth (future tiers up to ~12 rooms) → linear scan per tick | Acceptable up to ~50 rooms; if M_2nd ever ships dozens of rooms, switch to indexed query |
| `INITIAL_ROOMS` const drift between content pack and IndexedDB seed | Single source of truth: content pack exports const, app imports + upserts on boot. If const changes, upsert handles delta |

## Migration Plan

- Fresh saves: `runMigrations()` on app boot calls `seedInitialRooms()` if `rooms` table is empty; same for `gameCounters` singleton
- Existing dogfood saves (if any from M_2nd development): same upsert logic — `rooms` table empty → seed; counters singleton missing → create with zeros + current timestamp
- No data migration needed — schema is additive
- Rollback: if this change ships and a critical bug emerges, revert the Dexie version bump + delete the new tables manually via DevTools. Doctors remain intact; only mechanics layer affected

## Open Questions

- **Q1**: Should `runTick` log to console in production or only dev mode?
  - Tentative: gate behind `import.meta.env.DEV`; remove entirely when `wire-hospital-reputation` finalizes formula

- **Q2**: Display revenue as integer or with locale-formatted thousands separator?
  - Tentative: `revenue.toLocaleString('zh-TW')` for readability (3,294 not 3294). Same for reputation

- **Q3**: When player has 0 doctors assigned, does the HomePage banner still display counters?
  - Tentative: yes, show `revenue: 0, reputation: 0` + hint text `「指派醫師到診間開始累積聲望」`

These will be resolved during `/opsx:apply` based on Chrome MCP dogfood feedback.
