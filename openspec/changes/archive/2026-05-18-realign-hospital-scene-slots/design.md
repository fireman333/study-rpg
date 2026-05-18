## Context

`apps/medexam2-hospital-tw/src/components/HospitalScene.tsx` was patched on 2026-05-18 to use a doctor's **actual assigned room** (looked up via `db.rooms`) instead of `SUBJECT_TO_ROOM[doctor.subjectId]`. The fix made two pre-existing data gaps observable:

1. **Slot inventory mismatch with TIER_ROOMS** (from `packages/content-medexam2-tw/src/clinic-tiers.ts:32`):

   | Tier | Default rooms (TIER_ROOMS) | Scene slots today (theme/src/index.ts:22–55) | Mismatch |
   |---|---|---|---|
   | 診所 | outpatient×3 | ward×1 + outpatient×1 | 1 wasted ward slot; 2 of 3 診間 sprites silently drop |
   | 區域醫院 | outpatient×4 + surgery×1 | ward×2 + outpatient×2 + surgery×1 | 2 wasted ward; 2 診間 drop |
   | 醫學中心 | outpatient×4 + surgery×2 + ward×1 | ward×3 + outpatient×3 + surgery×2 | 2 wasted ward; 1 診間 drop |
   | 國家級教學醫院 | outpatient×5 + surgery×3 + ward×2 | ward×3 + outpatient×4 + surgery×3 | 1 wasted ward; 1 診間 drop |

2. **Extension rooms have zero slot positions**. `services/room-extension.ts:111-120` creates rooms with id `extra-<type>-<n>` (max +3 outpatient / +2 surgery / +2 ward per tier ≥ 區域醫院). Assigned doctors silently drop with `console.warn` in DEV (post-fix) or with no signal at all (pre-fix).

The existing `hospital-scene` capability spec still documents the SUBJECT_TO_ROOM-bound behavior and lacks a tier4 row. Spec is stale relative to shipped code.

**Constraints**:
- Scene canvas locked at 768×384 px; doctor sprite locked at 96×96 px (theme convention; changing breaks all scene art).
- `packages/core/src/types.ts` `SlotPosition` is the engine contract (`@study-rpg/core@0.2.0` published to npm 2026-05-16). Adding required fields = breaking change requiring major bump + CHANGELOG.
- Background PNG art (`scenes/tier{1..4}.png`) was hand-drawn for the original slot positions; redesigning canvases is a meaningful art ask.
- Players reach tier4 only in endgame (~30-day target per project.md). Tier4 over-density is the worst case; tier1–2 can be solved with pure coordinate moves.

## Goals / Non-Goals

**Goals:**
- Every default-state room (TIER_ROOMS for the current tier) MUST have a deterministic slot position that its assigned doctor's sprite renders at.
- Extension rooms (when purchased) MUST also have a deterministic visual representation.
- The `DOCTOR_SLOT_POSITIONS` constant in `theme-pixel-hospital/src/index.ts` becomes the single source of truth — no scattered hard-coded coordinates.
- `console.warn` in `HospitalScene.tsx` fires only on genuine data anomalies (orphan `assignedRoom`).
- Forward-compatible with future tiers / content packs forks (TOEFL / law exam).

**Non-Goals:**
- Re-doing affinity bonus math (already correct).
- Changing TIER_ROOMS room counts or unlocking schedule.
- Animating sprites between slots on assignment.
- Per-doctor positioning customization (drag-to-reposition).
- Solving rendering for arbitrary content-pack-defined `SUBJECT_TO_ROOM` schemas — the medexam2-tw mapping is the validation target.

## Decisions

### Decision 1: Slot inventory rule = `slot_count(tier, type) ≥ room_count(tier, type) + max_extras(type)`

For every `(tier, room_type)` pair, scene MUST provision slots ≥ default room count **plus the maximum extension cap** for that type (so a maxed-out hospital has no orphans). New inventory tables:

| Tier | ward | outpatient | surgery | total |
|---|---|---|---|---|
| 診所 | 0 | 3 | 0 | 3 |
| 區域醫院 | 0 + 2 ext = 2 | 4 + 3 ext = 7 | 1 + 2 ext = 3 | 12 |
| 醫學中心 | 1 + 2 ext = 3 | 4 + 3 ext = 7 | 2 + 2 ext = 4 | 14 |
| 國家級教學醫院 | 2 + 2 ext = 4 | 5 + 3 ext = 8 | 3 + 2 ext = 5 | 17 |

(Extension caps from `ROOM_EXTENSION_COSTS` in `packages/content-medexam2-tw/src/`. The maxExtras values are 3/2/2 across all tiers ≥ 區域醫院; verified during proposal authoring.)

**Rationale**: Provisioning for the worst-case maxed-out hospital eliminates `console.warn` in default play forever. Cost is bigger `DOCTOR_SLOT_POSITIONS` array (17 entries for tier4) — trivial JSON; the visual density is the real cost (see Decision 3).

**Alternatives considered**:
- *Just realign defaults, leave extensions to overflow row*: simpler tables but leaves the dogfood pain point (extensions invisible). Rejected.
- *Slot count = exact room count, no extras provisioned*: forces extension purchase to trigger a layout shift. Rejected for unpredictable UX.

### Decision 2: Drop ward slots from 診所 + 區域醫院 default layouts

The existing scene reserves ward slots even though tier1 + tier2 have ZERO default ward rooms. This is dead visual real estate. Move those (x, y) coordinates to outpatient/surgery instead.

Specifically:
- 診所 today: `[ward(280,220), outpatient(488,220)]` → propose `[outpatient(180,220), outpatient(384,220), outpatient(588,220)]` (3 evenly-spaced outpatient slots, centered).
- 區域醫院: drop the 2 ward slots, gain 2 outpatient slots.

Ward slots only appear from 醫學中心 onwards (1 ward room) and 國家級 (2 ward rooms) — matching TIER_ROOMS.

**Rationale**: Removes both the "wasted ward slot" inventory bug and the visual confusion of empty pixels under what looks like a ward icon. Players in 診所 see exactly 3 consultation rooms = the 3 診間 they own.

### Decision 3: Two-row layout for tier3 + tier4 (no background redesign)

Tier3 needs ≤ 14 sprites, tier4 needs ≤ 17. At 96 px sprite width on a 768 px canvas, a single row holds 8 sprites max (with no spacing). Two rows give 16 — still 1 short of tier4 max. Options:

- **A. Background canvas redesign (768×384 → 1024×384 or 768×512)**: requires re-art for all 4 PNGs, breaks the locked scene dimensions in `hospital-scene` spec.
- **B. Two-row layout within existing 768×384 canvas**: top row y=180, bottom row y=300, ~80–90 px sprite spacing horizontally. Slight overlap of bottom row over the front wall of the painted hospital is acceptable (pixel-art style permits foreground occlusion).
- **C. Smaller sprites for tier3+ (96 → 64)**: more fit but visual inconsistency across tiers.
- **D. Scrollable scene horizontally on mobile**: violates the existing scene spec's "fixed height" + complicates click-to-upgrade target.

**Chosen: B**. No art changes. Slight visual overlap at tier4 max-extras is acceptable (this is endgame, low risk of mass user friction). For tier4 row 1 = 8 slots at x=[60, 160, 260, 360, 460, 560, 660, 760-ish (clipped)] is too tight — we use **9 slots per row max** by stacking pairs (e.g., ward duo at x=80–120 overlapping intentionally as a "ward team"). Concrete coordinates worked out in `tasks.md`.

**Rationale**: B preserves the established 768×384 contract and ships entirely as a code-only change in one theme package. A means art + spec change; B does not.

### Decision 4: SlotPosition shape stays unchanged

The current shape is `{ room: 'ward' | 'outpatient' | 'surgery', x: number, y: number }`. No new fields needed:

- We do NOT need a `kind: 'default' | 'extension'` discriminator. The HospitalScene render loop already maps doctors to slots by room type + cursor index; whether a slot is "default" or "extension" is irrelevant to rendering.
- We do NOT need a `roomId` link. Doctors are assigned to rooms; rooms map to slot type; slots fill in `obtainedAt` order. Linking slots to specific room ids is over-engineering (players don't notice which exact slot their doctor lands in — they care that *someone* fills *something*).

**Rationale**: `@study-rpg/core@0.2.0` was just published 2026-05-16. Avoiding a breaking semver bump within 2 days of release preserves forkability for the (so-far hypothetical) external content-pack consumers.

### Decision 5: Slot-fill order = same as today (assignedDoctors sorted by obtainedAt, slotCursor incremented per room type)

No change to `HospitalScene.tsx` rendering logic. Decisions 1–3 are purely a data update to `DOCTOR_SLOT_POSITIONS`.

**Rationale**: minimizes blast radius. The shipped bug-fix + this realign together make HospitalScene render correct for ALL realistic states; HospitalScene's `console.warn` only fires on the orphan-room edge case.

### Decision 6: New scenario for "orphan assignedRoom" warning

Add `hospital-scene` scenario: doctor.assignedRoom points to a room id not in db.rooms (data corruption, possibly from a future migration bug or a SRS sync conflict). Expected behavior: skip rendering with `console.warn` in DEV, no crash.

**Rationale**: Codifies the shipped `console.warn` behavior so future cleanup work doesn't accidentally remove it.

## Risks / Trade-offs

- **[Risk] Tier4 visual density with 17 max sprites at 96×96 on 768×384 will look cluttered** → Mitigation: chosen Decision 3 two-row layout positions extension slots clearly lower (y=300) than default slots (y=180), creating a visual "extension wing"; if user testing shows confusion, fall back to plan A (background redesign) as a separate change.
- **[Risk] Pixel-art canvas may have foreground walls that block the new slot positions** → Mitigation: before applying, manually visually-check each tier PNG to ensure the proposed (x, y) coordinates don't land inside a wall sprite. Two-row layout's y=300 is below the painted building outline based on the existing tier3 PNG; tier1/tier2 need a check.
- **[Risk] Future fork (content-toefl-mini) may have different SUBJECT_TO_ROOM with no surgery room type** → Mitigation: out of scope. The medexam2-tw content pack is the only validation target; forks can ship their own slot positions.
- **[Trade-off] No `roomId` link in SlotPosition means players cannot "tell which doctor is in outpatient-2 vs outpatient-3" visually** → Acceptable: room cards in the room list panel (RoomCard.tsx) already convey assignment explicitly; the scene is ambient art, not a precise control surface.
- **[Trade-off] Bigger DOCTOR_SLOT_POSITIONS object (tier4 grows from 10 entries to 17)** → trivial code size impact (~600 bytes uncompressed), negligible.

## Migration Plan

No data migration needed. This is a pure constant update in a theme pack. Steps:

1. Apply: edit `packages/theme-pixel-hospital/src/index.ts` with new `DOCTOR_SLOT_POSITIONS`.
2. Run `pnpm --filter @study-rpg/theme-pixel-hospital build` to refresh the published-via-workspace consumer.
3. Run `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` (no type changes expected — slot shape unchanged).
4. Manually verify each tier via Chrome MCP smoke (assign max doctors to all default rooms, check sprite placement).
5. Update `openspec/specs/hospital-scene/spec.md` per delta.

**Rollback**: pure code-level revert. No DB / state migration; rollback is `git revert <commit>`.

## Open Questions

1. **Should extension slots be visually distinguished from default slots?** (e.g., dimmer tint, "EXT" badge). Currently proposed as identical visuals — they share `room.type` and behave identically in the engine. Distinguishing might help players track which rooms are "earned" vs "purchased" but adds complexity. **Defer to apply-stage user feedback**.
2. **Should the front-of-hospital scene gain a small "+" affordance suggesting room extensions are available?** Tangential — belongs in a separate `room-extension-ui` proposal, not this realign.
3. **For tier4, does the existing PNG's painted foreground (e.g., front wall, parking) clip the proposed bottom-row y=300?** Requires visual review during apply (Task 6 in tasks.md).
