# ABANDONED — 2026-06-03

**Status: ABANDONED, not completed.** This OpenSpec change was at 44/61 tasks when
abandoned. Owner decision (2026-06-03).

## Why abandoned

二階 (`apps/medexam2-hospital-tw` + `packages/theme-pixel-hospital` +
`packages/content-medexam2-tw`) was extracted to the standalone repo
`study-rpg-2nd` by change `split-medexam2-standalone` (cutover 2026-06-03). This
change is a **二階 feature** whose home repo is now elsewhere, so the monorepo's
change-tracking for it is orphaned.

## What this means for the actual feature

- The hospital-equipment **feature CODE** (§1–§8 + §10–§11, shipped 2026-05-24)
  lives in `apps/medexam2-hospital-tw` + `packages/content-medexam2-tw/src/equipment-catalog.ts`
  + `packages/theme-pixel-hospital/sprites/equipment/` + `@study-rpg/core` types.
  Those dirs were copied into `study-rpg-2nd` at the split, so **the feature rode
  along** and is live in the standalone repo. (Owner: verify present in
  `study-rpg-2nd` if it matters — it should be, as it was in the working tree at
  copy time.)
- §9 (R2 m2-bundle sync wiring for `hospitalEquipment`) was **never implemented**
  (it was blocking on the R2 cutover). If equipment cross-device sync is wanted,
  it is now `study-rpg-2nd`'s concern, tracked there (not here).

## Spec deltas NOT synced

This change's delta specs were **deliberately NOT synced** into the monorepo's
`openspec/specs/` (unlike a normal archive):
- `clinic-level-up` (MODIFIED — the T4 triple-gate incl. ≥3 equipment + 150k→300k
  reputation bump)
- `hospital-equipment` (ADDED — new capability)

They stay only inside this archived folder as a historical record. The monorepo's
main specs intentionally do **not** learn about equipment, because 二階 specs in
the monorepo are moot now that 二階 lives in `study-rpg-2nd`.

## If you need this later

Recover the proposal/design/tasks from this folder and re-propose inside
`study-rpg-2nd` (if that repo adopts OpenSpec), not in the monorepo.
