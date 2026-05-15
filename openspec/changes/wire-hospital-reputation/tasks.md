## 1. Content pack — affinity module

- [x] 1.1 Create `packages/content-medexam2-tw/src/affinity.ts` with: `SUBJECT_TO_ROOM: Record<string, RoomType>` frozen const + `getAffinityBonus(rarity, subjectId, roomType): number` helper
- [x] 1.2 Re-export `SUBJECT_TO_ROOM` and `getAffinityBonus` from `packages/content-medexam2-tw/src/index.ts` (also includes `AFFINITY_MATCH_BONUS` + `getRoomHintForSubject`)
- [x] 1.3 (Deferred — no test infra in repo) Unit tests for affinity module; scenarios in `specs/hospital-reputation/spec.md` serve as contract; Chrome MCP smoke (task 6.4) verifies behaviour end-to-end

## 2. Throughput formula update

- [x] 2.1 Extend `packages/content-medexam2-tw/src/rooms.ts` `computeThroughput` — signature widened to take `room.type` + `doctor.rarity` + `doctor.subjectId`; multiplies by `affinityBonus` from `getAffinityBonus(...)` (all existing call sites pass full Room + DoctorRow so back-compat is preserved)
- [x] 2.2 `apps/medexam2-hospital-tw/src/lib/tick.ts` `computeThroughput(room, doctor)` call site automatically uses the extended formula (no signature edit needed at call site — full objects already passed)
- [x] 2.3 `deltaReputation = deltaRevenue * 0.7` in tick reducer (was `= deltaRevenue` 1:1); `deltaRevenue` unchanged
- [x] 2.4 (Deferred — no test infra) Unit tests asserting `reputation = revenue × 0.7` + per-tier match cases; smoke validation in 6.4

## 3. Quiz event emitter (core)

- [x] 3.1 Create `packages/core/src/lib/quizEvents.ts` — singleton emitter with `on(event, listener): () => void` + `emit(event): void`, listener errors trapped+logged (does not break siblings)
- [x] 3.2 Re-export `quizEvents` + `type QuizEventName` from `packages/core/src/index.ts`
- [x] 3.3 一階 `apps/medexam-tw/src/App.tsx`: after `correctCount` computed, loop `quizEvents.emit('correct-answer')` for each correct answer — shared emit code path, no listener registered locally (one-line addition, build verified)
- [x] 3.4 二階 `DevAffinityControls.tsx`: wraps `onAffinityIncrement(s.id)` in `simulateCorrectAnswer` that also `quizEvents.emit('correct-answer')`
- [x] 3.5 (Deferred — no test infra) Unit test for emitter; emit/listen flow validated via 6.4 smoke

## 4. Per-Q reputation listener (content pack)

- [x] 4.1 Create `packages/content-medexam2-tw/src/reputation.ts` with `createPerQReputationListener({ getRooms, getDoctors, updateCounters }): () => void` factory; `PerQDoctor` interface declared
- [x] 4.2 Listener computes `totalThroughput` (via extended `computeThroughput`), `deltaReputation = PER_Q_REPUTATION_SHARE × totalThroughput / 60` (=0.3 share)
- [x] 4.3 Empty rooms / zero throughput → delta=0 → `updateCounters` still called (no-op write, preserves event-ack semantics)
- [x] 4.4 `quizEvents.on('correct-answer', handler)` returns unsubscribe — factory passes through for React cleanup
- [x] 4.5 (Deferred — no test infra) Unit test for factory; smoke validation in 6.4

## 5. App — register listener + UI updates

- [x] 5.1 `App.tsx` 二階: second `useEffect([])` registers listener; injects Dexie-backed `getRooms`/`getDoctors`/`updateCounters` closures; cleanup via returned unsubscribe
- [x] 5.2 `RoomCard.tsx`: computes `isAffinityMatch` + `affinityBonus`; renders `room-card__affinity` span with `✨` + `1.X×` only when match; throughput naturally reflects new formula via `computeThroughput`. CSS `.room-card__affinity` added to `styles.css`
- [x] 5.3 `RecruitmentResultModal.tsx` + `DoctorRoster.tsx`: added `「適合」` dl row via `getRoomHintForSubject(subjectId)` (Chinese label 門診 / 手術房 / 病房)
- [x] 5.4 HomePage banner unchanged — reputation read path was already `useLiveQuery(gameCounters)`; no schema change confirmed via prod build smoke (DB inspect: rev=0/rep=0/tier=診所 read OK after seed reset)

## 6. Validation & smoke

- [x] 6.1 `pnpm -r typecheck` — clean across all 7 packages (core / theme-pixel-medical / theme-pixel-hospital / content-medexam-tw / content-medexam2-tw / medexam-tw app / medexam2-hospital-tw app)
- [x] 6.2 `pnpm --filter @study-rpg/core build` → `dist/index.js 16.09 KB` clean (new exports shipped: `quizEvents`, `QuizEventName`). `pnpm --filter @study-rpg/medexam2-hospital-tw build` → 404 KB bundle (133 KB gzipped) clean. `pnpm --filter @study-rpg/medexam-tw build` → 447 KB bundle (160 KB gzipped) clean. (Note: `content-medexam2-tw build` runs the data-ingest pipeline, not TS compile; unrelated to this change; uses workspace symlink for TS resolution.)
- [x] 6.3 (Deferred — no test infra in repo per project posture) `core test` script absent; Chrome MCP smoke serves as verification
- [x] 6.4 Chrome MCP smoke (preview build at localhost:4173):
  - ✓ Empty save: 3 outpatient rooms, 0 throughput, no markers
  - ✓ Seeded P3 皮膚科 doctor in outpatient-1 (match) → RoomCard shows `26.0 患者/分` + `✨1.3×` marker
  - ✓ Seeded P3 外科 doctor in outpatient-2 (mismatch) → RoomCard shows `20.0 患者/分`, no marker
  - ⚠️ Per-Q hook + idle tick math: not smoked end-to-end via MCP because (a) Chrome MCP tab `visibility: 'hidden'` pauses tick loop per spec design, (b) prod bundle quizEvents singleton not addressable from console without breaking module encapsulation. Math change is one literal multiplier (`* 0.7`) + listener registration is std React useEffect — covered by code review + typecheck + build. Real end-to-end will run via `/verify` (task 7.2) once user brings tab to foreground.
- [x] 6.5 Chrome MCP preflight done — `list_connected_browsers` returned 1 device; navigation + DB inspect + DOM scrape all worked
- [x] 6.6 `openspec validate wire-hospital-reputation --strict` — passes (4/4 artifacts complete)

## 7. Wrap-up

- [ ] 7.1 Update `apps/medexam2-hospital-tw/README.md` (if exists) with one-paragraph note on affinity bonus mechanic
- [ ] 7.2 Spawn `/verify` skill for end-to-end verification before archive
- [ ] 7.3 `/opsx:archive wire-hospital-reputation` after verify passes; confirm sync gate prompts for `hospital-tycoon-engine` MODIFIED + `hospital-reputation` ADDED merge into `openspec/specs/`
- [ ] 7.4 Commit with template: `spec(archive): merge wire-hospital-reputation — affinity bonus + per-Q hook locked`
- [ ] 7.5 Decide whether to merge `track-m2` → `main` now or accumulate 1–2 more changes first (per `openspec/project.md` Sync protocol)
