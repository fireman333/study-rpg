## Why

A bug fix in `HospitalScene.tsx` (2026-05-18) made sprite rendering follow the doctor's **actual assigned room** instead of the `SUBJECT_TO_ROOM[subjectId]` natural mapping. The fix surfaced two latent gaps in `theme-pixel-hospital`: (1) at every tier, slot-position inventory does NOT match `TIER_ROOMS` room inventory, so default-state sprites silently drop; (2) extension rooms purchased via `services/room-extension.ts` have no slot positions at all. The existing `hospital-scene` capability spec also documents the now-incorrect "subject-bound" behavior — it needs to be brought into alignment with the shipped code.

## What Changes

- **MODIFIED** `hospital-scene`: replace "subject-bound slot positions" requirement with "assigned-room-bound" requirement (codifies the shipped 2026-05-18 fix into spec).
- **MODIFIED** `hospital-scene`: realign per-tier slot inventory so every `(tier, room_type)` pair has slot_count ≥ default room_count from `TIER_ROOMS`. New per-tier slot tables to be defined in `design.md`.
- **MODIFIED** `hospital-scene`: add the tier4 (`國家級教學醫院`) slot inventory row that was missing from the existing requirement table.
- **ADDED** `hospital-scene`: deterministic rendering rule for **extension rooms** (`extra-<type>-<n>` ids from `purchaseRoomExtension`) — either dedicated extension slot positions or an explicit overflow indicator. Players SHALL see assigned-doctor visual feedback for every room they own.
- **ADDED** `hospital-scene`: scenario for "orphaned doctor.assignedRoom pointing to deleted room" — bug-fix `console.warn` SHALL fire only in this anomalous case, not as routine overflow.

Not breaking for engine consumers — `SlotPosition` shape change (if any) is decided in `design.md`. If shape changes, treat as `@study-rpg/core` minor bump per project.md's "Engine API surface ... breaking changes need a CHANGELOG entry".

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `hospital-scene`: see "What Changes" above. Existing scenarios about "subject-bound" rendering and "only first ward slot fills for multiple 內科 doctors" are replaced; new scenarios for extension-room rendering and orphan-room warning are added.

## Impact

- **Theme pack art assets**: `packages/theme-pixel-hospital/public/scenes/tier{1..4}.png` may need re-art if the new slot density (e.g., tier4 needs 5 outpatient + 3 surgery + 2 ward + up to 7 extension slots = 17 sprites in 768×384) cannot fit without redesign. design.md weighs background redesign vs overflow-row UI.
- **Theme pack code**: `packages/theme-pixel-hospital/src/index.ts:22-56` — primary edit site (rewrite `DOCTOR_SLOT_POSITIONS` per new tables).
- **Core types (possibly)**: `packages/core/src/types.ts` `SlotPosition` shape — only if we add a discriminator for "extension slot" or "default slot". design.md decides; if changed, M3 `@study-rpg/core` semver bump + CHANGELOG entry required.
- **App component**: `apps/medexam2-hospital-tw/src/components/HospitalScene.tsx` — ideally untouched. If overflow UI is the chosen strategy, this file gets a small render branch.
- **Affinity bonus, AssignDoctorModal, TIER_ROOMS room counts**: NOT touched — out of scope per proposal author.
- **Engine consumer fork validation**: `apps/medexam-tw` (一階) does not use `doctorSlotPositions` (verified — only `theme-pixel-medical` exists for 一階; scene rendering differs). No regression risk for M2 track.
