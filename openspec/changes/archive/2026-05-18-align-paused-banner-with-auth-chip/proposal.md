# Align paused-banner reopen button with AuthButton chip

## Why

When sync is paused (user picked "待會再決定"), two top-of-page controls render simultaneously:

1. **Paused banner reopen button** (`.sync-paused-banner__btn`) — cream wooden frame, inline above route content, vertical center ≈ 20px from page top
2. **AuthButton OAuth chip** (`.auth-button`) — dark glassmorphism, `position: fixed; top: 12px right: 12px`, vertical center ≈ 25px from page top

They sit in the same visual row but have:
- ~5px vertical-center offset (chip slightly lower than btn)
- Clashing visual idioms (wooden retro vs glassmorphism)

User flagged the misalignment in 2026-05-18 dogfood (Session A `/spec resume`). Quote: "banner按鈕和oauth高度沒對齊有點醜".

The banner reopen button was introduced in [ebc2961](https://github.com/fireman333/study-rpg/commit/ebc2961) (paused banner moved inline above route content to avoid nav overlap). At that time the visual coordination with AuthButton was not designed — banner just sits in normal flow while AuthButton remains `position: fixed`.

## What Changes

1. CSS: align `.auth-button` vertical center with `.sync-paused-banner__btn` vertical center when both are visible. Achieve via either:
   - **Option A** (recommended, minimum-diff): adjust `.auth-button { top }` from `12px` to a value matching the banner's vertical-center
   - **Option B**: adjust `.sync-paused-banner` `padding-top` to bring the banner btn's center down to match chip's `top: 12px` baseline

2. (Stretch, gated on user OK) Harmonize visual style — adopt theme's wooden-frame idiom for both, OR unify on glassmorphism. Out of scope for this change unless user confirms.

3. Add a new normative requirement to `cloud-sync` capability stating that the paused banner reopen entry SHALL render at a position that is visually anchored with sibling top-bar controls.

## Impact

- Affected specs: `cloud-sync` (ADD new requirement: visual consistency with sibling controls)
- Affected code: `apps/medexam2-hospital-tw/src/styles.css` (CSS-only — `.auth-button` and/or `.sync-paused-banner__btn`)
- No engine / service / data / TS / behavior changes
- Diff size: < 10 LOC expected
- HMR-safe: pure CSS, parallel browser sessions will pick up via Vite HMR with no state loss

## Out of scope

- Restructuring AuthButton out of `position: fixed` into a shared topbar container (bigger refactor; defer)
- Mobile reflow optimization beyond what current rule covers
- Replacing the glassmorphism aesthetic project-wide
