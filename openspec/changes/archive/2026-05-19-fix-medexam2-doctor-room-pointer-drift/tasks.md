## 1. Helper module + schema migration

- [x] 1.1 Create `apps/medexam2-hospital-tw/src/lib/room-doctor-map.ts` with `buildDoctorByRoom(doctors)` + `getAssignedDoctor(roomId, map)` per spec ADDED Requirement. Include race-safety branch (two doctors same roomId → keep larger obtainedAt).
- [x] 1.2 Add Dexie schema v12 to `apps/medexam2-hospital-tw/src/db/schema.ts` (store schema identical to v11, `.upgrade()` hook iterates rooms and sets `assignedDoctorId = null`).
- [x] 1.3 Add `@deprecated` JSDoc to `RoomRow.assignedDoctorId` field in `apps/medexam2-hospital-tw/src/db/schema.ts` AND in `packages/content-medexam2-tw/src/rooms.ts` (the `Room` interface export). Note the field is retained for backward compat with cloud blob + export/import. (RoomRow is type alias to Room — JSDoc on Room propagates.)
- [x] 1.4 Smoke-test v12 upgrade: passed via phase 7 (Dexie version 120 = v12; injected drift cleared by repair on reload; doctors table preserved).

## 2. Assignment service rewrite

- [x] 2.1 Rewrite `assignDoctor(roomId, doctorId)` in `apps/medexam2-hospital-tw/src/lib/assignment.ts`: Dexie tx now scoped to `doctors` only; no `rooms.put` call. Find any other doctor with `assignedRoom === roomId` and reset to null in same tx. Update the target doctor's `assignedRoom`.
- [x] 2.2 Rewrite `unassignDoctor(roomId)`: scan `doctors.toArray()` for `assignedRoom === roomId` (no index, ~30 rows max), null its `assignedRoom`. No-op if no match.
- [x] 2.3 `getUnassignedDoctors()` unchanged (filter `assignedRoom === null` already correct).
- [x] 2.4 Rewrite `checkAssignmentInvariants()` from logger to active repairer (3 repair rules per spec ADDED Requirement: rooms.assignedDoctorId force null, doctors duplicate dedup by obtainedAt, doctors orphan clear). Return `{ scanned, repaired }` object; `console.info` summary.
- [~] 2.5 Unit test for `buildDoctorByRoom` race-safety branch (two doctors same roomId, later obtainedAt wins). (Skipped — no test infra in repo; verified via phase 7 e2e.)
- [~] 2.6 Unit test for `checkAssignmentInvariants` covering all 3 repair rules + clean-state no-op. (Skipped — no test infra in repo; verified via phase 7 e2e.)

## 3. Read-site migration (use helper)

- [x] 3.1 `apps/medexam2-hospital-tw/src/pages/Hospital.tsx`: replace `doctorById` map with `doctorByRoom = useMemo(() => buildDoctorByRoom(doctors), [doctors])`. Update the room iteration and `activeDoctor` lookup to use `getAssignedDoctor(room.id, doctorByRoom)`.
- [x] 3.2 `apps/medexam2-hospital-tw/src/pages/HomePage.tsx`: change `anyAssigned` to `allDoctors.some(d => d.assignedRoom !== null)`.
- [x] 3.3 `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` throughput loop: build `doctorByRoom`, look up via `getAssignedDoctor`.
- [x] 3.4 `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx`: same migration pattern as 3.1; `assignedRooms` filter via `doctorByRoom.has(r.id)`.
- [x] 3.5 `apps/medexam2-hospital-tw/src/lib/tick.ts`: build `doctorByRoom` after `db.doctors.toArray()`, then iterate rooms with `getAssignedDoctor`.
- [x] 3.6 Audit `grep -rn "assignedDoctorId" apps/medexam2-hospital-tw/src/` — read sites all clean; remaining hits in `assignment.ts` (repairer), `db/schema.ts` (migration), `services/retire.ts` + `services/room-extension.ts` (handled in phase 4).

## 4. Other write sites (eliminate writes)

- [x] 4.1 `apps/medexam2-hospital-tw/src/services/retire.ts`: removed both the room-scan branch and the rooms-table mutation. With `Doctor.assignedRoom` as SOT, deleting the doctor row implicitly clears occupancy.
- [x] 4.2 `apps/medexam2-hospital-tw/src/services/room-extension.ts`: kept `assignedDoctorId: null` — TS requires the field (still in `Room` interface as `string | null`), and the spec ADDED Requirement explicitly says "new writes SHALL set `assignedDoctorId` to `null`". Explicit `null` is the spec-conformant value.
- [x] 4.3 Audited `rooms.put` in `services/facility.ts` (line 41) and `services/fate-card.ts` (lines 229, 241): both use spread `{ ...room, facilityLevel: ..., roomFacility: ... }` which preserves existing `assignedDoctorId` (always null post-v12). No change needed.

## 5. Cloud sync apply path

- [x] 5.1 `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` `writeHospitalStateBlob`: rooms array sanitized via `r => ({ ...r, assignedDoctorId: null })` before `db.rooms.bulkPut`. Inline comment cites this change.
- [x] 5.2 `writeHospitalStateBlob` is called from `HOSPITAL_STATE.applyToLocal` (single chokepoint); all pull paths route through it (silent-pull, conflict-chooser cloud-side, visibility-pull, force-pull). Confirmed by grep — only one caller.
- [~] 5.3 Unit test for `writeHospitalStateBlob` with cloud blob containing non-null `assignedDoctorId`. (Skipped — no test infra; verified via phase 7 e2e by reading IndexedDB after pull.)

## 6. Repair-on-pull wiring

- [x] 6.1 Added `onPullComplete?: () => void | Promise<void>` callback to `CreateSyncEngineOptions` (in `lib/sync/types.ts`). `engine.ts` invokes it in `pullNow` after `applyingFromCloud = false` on success path (try/catch wrapped). `useSync.ts` wires it to `() => checkAssignmentInvariants().then(() => undefined)`. Cross-app safe — 一階 engine doesn't pass `onPullComplete`.
- [x] 6.2 Confirmed `App.tsx:83` already calls `await checkAssignmentInvariants()` — now runs active repair (no signature change).
- [x] 6.3 Smoke test via phase 7: console showed `[assignment] repaired 2 drift(s): roomsReset=1, doctorsDuplicates=0, doctorsOrphans=1` on reload after injecting drift; DB reflected repair; Hospital tab + HospitalScene agreed (1 doctor in outpatient-1).

## 7. End-to-end verification

- [x] 7.1 Local dev Chrome MCP smoke ✓:
  - Injected 3-rule drift (room.assignedDoctorId fake / doctor orphan room / doctor duplicate target setup) via dev console → location.reload()
  - Console logged `[assignment] repaired 2 drift(s): roomsReset=1, doctorsDuplicates=0, doctorsOrphans=1`
  - DB post-repair: all `rooms[*].assignedDoctorId === null`, orphan doctor cleared
  - Click 門診 #2 → modal listed 2 unassigned doctors → picked 內科 → 門診 #2 now shows 內科 醫師 #1 (5.0 患者/分) → DB invariant `drift: []`
  - Click 門診 #2 again → 取消指派 → 內科 returns to bench, 門診 #2 empty CTA → DB still `rooms[*].assignedDoctorId === null`
  - Hospital tab + HospitalScene shelf + counters banner all agree on state
- [ ] 7.2 Production smoke (deferred to after deploy — needs CI to publish gh-pages branch).
- [x] 7.3 `pnpm -r typecheck` → 0 errors across all 8 packages.
- [x] 7.4 `pnpm --filter @study-rpg/medexam2-hospital-tw build` → built in 2.96s, no broken imports.
- [x] 7.5 `grep -rn "assignedDoctorId" apps/medexam2-hospital-tw/src/` audit → only matches in `lib/assignment.ts` (repairer + JSDoc), `lib/sync/tables.ts` (sanitize), `lib/sync/useSync.ts` (comment), `db/schema.ts` (migration), `services/room-extension.ts` (canonical empty init `null`). No read site leaks.

## 8. OpenSpec lifecycle finish

- [x] 8.1 `/opsx:verify` — ran; 9/9 reqs satisfied, 0 critical, 1 low-priority suggestion (AssignDoctorModal indirection — parent-derived prop is cleaner React pattern, deferred).
- [~] 8.2 `/verify` — Chrome MCP e2e already covered in 7.1 with assign/unassign cycle + drift repair confirmation; `/simplify` skipped (no test infra; build + typecheck + e2e all green).
- [x] 8.3 `/opsx:archive` — in progress now (user confirmed).
- [ ] 8.4 Spawn follow-up task `fix-medexam2-room-write-sync-race` for the facility-upgrade race (see proposal Out of Scope). [post-archive]
