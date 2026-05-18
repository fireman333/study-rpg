## 1. Coordinate authoring (pure data)

- [ ] 1.1 Draft new `DOCTOR_SLOT_POSITIONS` for `tier1` (診所): 3 outpatient slots, evenly distributed across 768 px width. Suggested: `[outpatient(180,220), outpatient(384,220), outpatient(588,220)]`. Single row, no ward, no surgery.
- [ ] 1.2 Draft `tier2` (區域醫院): 2 ward + 7 outpatient + 3 surgery = 12 slots in two rows. Suggested top row y=180 (4 outpatient + 1 surgery default), bottom row y=300 (extension overflow row: 3 outpatient ext + 2 ward ext + 2 surgery ext).
- [ ] 1.3 Draft `tier3` (醫學中心): 3 ward + 7 outpatient + 4 surgery = 14 slots. Two rows; top y=180 has 4 outpatient default + 2 surgery default + 1 ward default; bottom y=300 has 2 ward ext + 3 outpatient ext + 2 surgery ext.
- [ ] 1.4 Draft `tier4` (國家級教學醫院): 4 ward + 8 outpatient + 5 surgery = 17 slots. Two rows ≤ 9 slots each. Top y=180: 5 outpatient default + 3 surgery default + 1 ward default (9). Bottom y=300: 1 ward default + 2 ward ext + 3 outpatient ext + 2 surgery ext (8).
- [ ] 1.5 Visually verify each proposed `(x, y)` does not fall inside a painted wall / furniture sprite in the corresponding `scenes/tier{1..4}.png`. Use Read tool to view PNGs at full resolution; if any slot lands on a painted obstacle, adjust by ±20 px and re-check. Document any forced adjustments in `design.md` Open Questions §3.

## 2. Theme pack code edit

- [ ] 2.1 Edit `packages/theme-pixel-hospital/src/index.ts:22-56` — replace the entire `DOCTOR_SLOT_POSITIONS` constant with the four new arrays from §1.
- [ ] 2.2 Confirm no other code in `theme-pixel-hospital/src/` hard-codes slot coordinates (`grep -n 'x:.*y:' packages/theme-pixel-hospital/src/`). If any duplicates exist, consolidate to the constant.
- [ ] 2.3 Run `pnpm --filter @study-rpg/theme-pixel-hospital build` and confirm it succeeds.

## 3. Type-level + downstream verification

- [ ] 3.1 Confirm `SlotPosition` in `packages/core/src/types.ts` is unchanged (no field additions per Decision 4). Run `pnpm --filter @study-rpg/core typecheck`.
- [ ] 3.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — expect zero errors.
- [ ] 3.3 Confirm `apps/medexam2-hospital-tw/src/components/HospitalScene.tsx` was NOT touched. The realign is data-only; render logic stays as shipped in the 2026-05-18 bug fix.

## 4. Functional smoke (Chrome MCP at dev server)

- [ ] 4.1 Start dev server: `pnpm --filter @study-rpg/medexam2-hospital-tw dev`. Open Chrome MCP at `http://localhost:5174/study-rpg/hospital/`.
- [ ] 4.2 For tier1 (default 診所 state): seed 3 doctors of mixed subjects (e.g., 1 內科, 1 外科, 1 家醫科), assign each to `outpatient-1`, `outpatient-2`, `outpatient-3`. Verify all 3 sprites visible at the 3 outpatient slot coordinates from §1.1. No `console.warn`.
- [ ] 4.3 For tier2: bump `gameCounters.tier = '區域醫院'`, seed up to 4 outpatient + 1 surgery default doctors, assign each to default rooms. Verify 5 sprites at expected positions, no warns.
- [ ] 4.4 For tier2 with extensions: purchase max extensions (3 outpatient + 2 surgery + 2 ward = 7 extras) via `purchaseRoomExtension`. Seed enough doctors to fill all 12 rooms. Verify 12 sprites visible across two rows, no warns.
- [ ] 4.5 Repeat 4.3+4.4 for tier3 (14 sprites max) and tier4 (17 sprites max).
- [ ] 4.6 Orphan room test: directly mutate `db.doctors.put({ ..., assignedRoom: 'outpatient-nonexistent' })` for one doctor. Verify `console.warn` fires once in DEV with the new orphan-room scenario format.

## 5. Spec sync + archive

- [ ] 5.1 Run `openspec validate realign-hospital-scene-slots --strict` and confirm pass.
- [ ] 5.2 Walk through the new `openspec/changes/realign-hospital-scene-slots/specs/hospital-scene/spec.md` delta vs the current `openspec/specs/hospital-scene/spec.md` and confirm MODIFIED + ADDED + REMOVED operations all parse correctly.
- [ ] 5.3 Run `/opsx:verify realign-hospital-scene-slots` (3-dim check before archive).
- [ ] 5.4 Run `/opsx:archive realign-hospital-scene-slots` (with sync gate — answer "yes" when prompted to sync delta into main specs).
- [ ] 5.5 Verify post-archive: `openspec/specs/hospital-scene/spec.md` now reflects the new requirements; `openspec/changes/realign-hospital-scene-slots/` moved to `openspec/changes/archive/<date>-realign-hospital-scene-slots/`.

## 6. Optional follow-up (out of this change)

- [ ] 6.1 If §1.5 visual review revealed PNG obstacles forcing significant coordinate compromises → file a follow-up change `redesign-hospital-scene-backgrounds` to widen canvas or repaint to accommodate denser slot layouts.
- [ ] 6.2 If user feedback after dogfood shows extension rooms cause confusion ("which doctors did I hire vs purchase room for?") → file a follow-up change `add-extension-room-visual-distinction` for "EXT" badge or tier-color tinting.
