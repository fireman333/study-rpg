## Why

Tutorial copy in `packages/content-medexam2-tw/src/tutorial.ts` was locked by `redesign-hospital-economy` on 2026-05-17 and has drifted out of sync with ~5 archived changes between 2026-05-17 → 2026-05-19. Two concrete drifts cause new-player friction:

1. **`TUTORIAL_STEPS[2].first-assignment` body is factually wrong** — says「把醫師拖到「門診」房間」implying drag-and-drop. After `redesign-doctor-roster-as-shelf` (2026-05-19), actual UX is click-room → `AssignDoctorModal` → pick from list. A new player following the tutorial will try to drag, get no response, and conclude the feature is broken.
2. **`SURFACE_HINTS[2].hospital` body is silent on three things** that skip-tutorial players cannot recover elsewhere — the「跳過教學」link on Step 1 marks all 7 onboarding steps complete, so skip-flow players never see Step 3's assignment teaching nor any pointer to the new doctor sprite shelf (post-`redesign-doctor-roster-as-shelf`) nor the `/roster` ✏️ rename entry added by `add-doctor-rename` (2026-05-19).

## What Changes

- **`TUTORIAL_STEPS[2].body`** — replace「把醫師拖到「門診」房間」with「點「門診」房間 → 從清單選一位醫師指派」, preserving the trailing「同科加成最大」half. Onboarding Step 3 now matches shipped click-room UX.
- **`SURFACE_HINTS[2].body`** — expand from one sentence (Facility upgrade + extension only) to three sentences covering: (a) click-room → pick assignment, (b) original Facility/extension content, (c) doctor sprite shelf identity + `/roster` ✏️ rename pointer. Surface hint is now the skip-tutorial safety net.
- No requirement-level changes — both strings are content-pack data, not capability requirements.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `hospital-tutorial`: refine documentation requirements for L1 onboarding step `first-assignment` (must describe click-room interaction, not drag) and L2 surface hint `hospital` (must include shelf explanation + rename entry pointer so skip-tutorial players are not stranded). No behavior changes.

## Impact

- **Files changed**: 1 (`packages/content-medexam2-tw/src/tutorial.ts` — two string-literal replacements)
- **Build**: rebuild content pack via `pnpm --filter @study-rpg/content-medexam2-tw build`
- **DB / cloud sync**: zero impact — `gameCounters.tutorial.completedSteps` schema unchanged
- **Existing saves**: zero migration; already-completed players won't re-trigger; mid-tutorial players see new copy on next step resume
- **Branch**: track-m2 (二階 changes per `openspec/project.md` § Dual-worktree pattern); will sync back to main in next batch merge
- **Verify**: smoke-test fresh-save in `pnpm --filter @study-rpg/medexam2-hospital-tw dev` — verify Step 3 modal text + first-visit hospital hint text
- **Out of scope** (explicit, per owner verdict during grilling):
  - `TUTORIAL_STEPS[6].done` feature listing (staying generic per design D10)
  - `SURFACE_HINTS[3].fate-cards` targeted-ticket mention (epic/legendary is 100k+ rep deep — discoverable organically)
  - `MILESTONE_TIPS` (already in sync; `triggerDescription` already notes 48k→30k threshold rename)
  - `HelpMenu` copy (separately maintained, already refreshed by `fix-helpmenu-copy-stale` 2026-05-19)
