## Why

`wire-recruitment-gacha` shipped 2026-05-15 — players can now roll for doctors, and each doctor card persists with `assignedRoom: string | null`. But that field is **always `null`**: there is no room data model, no assignment UI, no tick loop. The closed game loop's step 4 (`assigned doctors → rooms → throughput → revenue + reputation`) is broken. Doctors are inert — gacha feels like collecting stickers with no follow-on gameplay.

This change wires the tycoon-idle core: a room data model, 3 starting outpatient rooms (診所 tier baseline), drag/click assignment, a tick loop that accumulates revenue + reputation per assigned room, and HomePage counters surfacing the result. **It locks the mechanics but defers numeric tuning** — tier scaling and reputation formula constants are reserved for downstream changes per the master `hospital-management-mode` spec.

## What Changes

- **Room data model** in `packages/content-medexam2-tw/src/rooms.ts`:
  - `Room` interface: `id`, `type: 'outpatient' | 'surgery' | 'ward'`, `baseRate: number` (patients/min), `roomFacility: number` (multiplier ≥ 1.0), `assignedDoctorId: string | null`, `slot: number` (1-indexed display order)
  - `INITIAL_ROOMS` constant: 3 outpatient rooms, `baseRate = 10`, `roomFacility = 1.0` (診所 tier defaults; clinic-level-up will scale via tier-specific generators)
  - `computeThroughput(room, doctor)`: `baseRate × powerMultiplier × roomFacility`; returns `0` if `doctor` is null

- **IndexedDB schema bump** in `apps/medexam2-hospital-tw/src/lib/db.ts`:
  - New `rooms` table (keyPath `id`) seeded with `INITIAL_ROOMS` on fresh save
  - New `gameCounters` table (singleton row): `{ id: 'singleton', revenue: number, reputation: number, lastTickAt: number }`
  - Dexie version bump (additive, no migration of existing data needed since hospital app is new)

- **Tick loop** in `apps/medexam2-hospital-tw/src/lib/tick.ts`:
  - `runTick()` reads all rooms + assigned doctors, computes total throughput, multiplies by elapsed seconds since `lastTickAt` (capped at 5 minutes to avoid offline farming), writes accumulated revenue + reputation back atomically
  - `useTickLoop()` React hook fires `runTick()` on mount, on focus, and every 5 seconds while tab is visible (clears on `visibilitychange` → hidden, restarts on visible)

- **Assignment UI** in `apps/medexam2-hospital-tw/src/pages/Hospital.tsx`:
  - New `/hospital` route (sister to existing `/roster`)
  - Grid of 3 rooms, each shows assigned doctor sprite OR empty slot CTA `「指派醫師」`
  - Click empty slot → modal lists unassigned doctors (filtered from `/roster` data); click doctor → atomic transaction sets `room.assignedDoctorId` + `doctor.assignedRoom`
  - Click assigned slot → option to swap or unassign; unassign sets both fields to `null`

- **HomePage counters**:
  - `apps/medexam2-hospital-tw/src/pages/Home.tsx` adds a banner showing current `revenue` + `reputation` from `gameCounters`
  - Counters reactive via Dexie `liveQuery` (re-render on tick write)

- **Nav link** in `apps/medexam2-hospital-tw/src/App.tsx`:
  - Adds `/hospital` to nav alongside existing `/`, `/roster`, `/quiz`

**Out of scope**（明確留給後續 changes）：

- ❌ Hospital tier upgrade (`診所 → 區域醫院 → 醫學中心`) trigger logic + slot count scaling → `wire-clinic-level-up`
- ❌ Reputation formula tuning (current implementation uses raw `throughput × elapsed_sec`; finalized formula may add diminishing returns, room-type weighting, etc.) → `wire-hospital-reputation`
- ❌ Surgery / ward room behavior differences (this change only ships outpatient; surgery + ward types declared in `Room.type` enum but not seeded) → `wire-clinic-level-up` introduces them at higher tiers
- ❌ Doctor cooldown / fatigue / shift mechanics → not in M_2nd
- ❌ Patient queue visualization (animated patient sprites moving through rooms) → polish layer, not core loop
- ❌ Revenue spending (upgrading roomFacility, hiring extra tickets, etc.) → `wire-hospital-spend` (future)

## Capabilities

### New Capabilities

- `hospital-tycoon-engine`: Room data model, persistence schema, doctor assignment transactions, tick-based throughput accumulation, and game counter (revenue + reputation) storage. Locks the mechanics contract that `wire-clinic-level-up` and `wire-hospital-reputation` will extend.

### Modified Capabilities

無 — `hospital-management-mode` master spec already declares the throughput formula (`baseRate × powerMultiplier × roomFacility`) and that unassigned rooms produce zero. This change fulfills that contract rather than modifying it. `recruitment-gacha`'s `Doctor.assignedRoom` field is already declared as `string | null` reserved for this change; populating it does not require spec modification.

## Impact

- **新檔**:
  - `packages/content-medexam2-tw/src/rooms.ts` (Room interface + INITIAL_ROOMS + computeThroughput helper)
  - `apps/medexam2-hospital-tw/src/lib/tick.ts` (runTick + useTickLoop)
  - `apps/medexam2-hospital-tw/src/pages/Hospital.tsx` (assignment UI page)
  - `apps/medexam2-hospital-tw/src/components/RoomCard.tsx` (single room cell with sprite slot)
  - `apps/medexam2-hospital-tw/src/components/AssignDoctorModal.tsx` (picker modal)
  - `openspec/specs/hospital-tycoon-engine/spec.md` (new capability spec)

- **改 file**:
  - `apps/medexam2-hospital-tw/src/lib/db.ts` (Dexie version bump + 2 new tables)
  - `apps/medexam2-hospital-tw/src/pages/Home.tsx` (revenue/reputation banner)
  - `apps/medexam2-hospital-tw/src/App.tsx` (add /hospital nav link)
  - `apps/medexam2-hospital-tw/src/styles.css` (room grid + counter banner CSS)
  - `packages/content-medexam2-tw/src/index.ts` (export rooms module)

- **Bundle size**: ~3 KB new TS code in content pack + ~5 KB new app code. Negligible vs current 5.74 MB raw bundle.

- **Performance**:
  - Tick loop runs every 5s while tab visible; each tick is 1 read (all rooms + counters) + 1 write (counters) — Dexie handles this without UI jank
  - Offline cap of 5 min prevents accumulation exploitation when player closes tab and reopens days later

- **No breaking**: 一階 app, core engine, all content packs unaffected. Hospital app's existing routes (`/`, `/roster`, `/quiz`) untouched.

- **Telemetry**: tick loop logs `console.debug('[tick]', { elapsedSec, totalThroughput, deltaRevenue, deltaReputation })` for dogfood debugging. Removed once formula is finalized in `wire-hospital-reputation`.
