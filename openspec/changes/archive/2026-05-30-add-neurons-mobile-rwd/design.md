## Context

`apps/neurons-tw` styles everything via inline `style={{…}}` objects sourced from `THEME_PIXEL_NEURONS`. There is no `styles.css` and almost no `@media` queries, so nothing reflows on mobile. 二階 (`apps/medexam2-hospital-tw/src/styles.css`) is the reference: a single stylesheet with ~27 media queries implementing horizontal-scroll nav tabs, a fade-edge mask at 480px, body overscroll lock, and single-column reflow. This change ports those patterns to neurons-tw, scoped to the homepage nav + FamilyPicker cards + 4 modal/toast overlays.

## Goals / Non-Goals

**Goals:**
- Homepage nav + family cards + overlays reflow cleanly at 375/390px (no horizontal page overflow; all controls reachable).
- Mirror 二階's proven RWD patterns + breakpoints (480/768) for cross-app consistency.
- Desktop (≥ 768px) layout pixel-identical to before.
- First `styles.css` in neurons-tw, structured so future RWD changes (connectome, list pages) extend it.

**Non-Goals:**
- connectome tree SVG RWD (separate change).
- list pages (`/bookmarks` `/achievements` `/leaderboard`) RWD (separate change).
- Full inline→CSS migration — only media-sensitive properties move.
- 320px support; new deps; Tailwind.

## Decisions

### Decision 1: The core constraint — inline styles beat external CSS, so media-sensitive properties MUST leave inline

**The crux.** Inline `style={{}}` has higher specificity than any external stylesheet rule. An `@media` rule in `styles.css` will **NOT** override an inline property. Therefore, for every property we want a breakpoint to control (e.g. nav `flexWrap`, `overflowX`, card grid `gridTemplateColumns`, modal `width`), the inline declaration of that property MUST be **removed** and re-expressed as a CSS class rule. Properties that don't change responsively stay inline.

- **Choice**: give the responsive elements a `className` (e.g. `.neurons-nav`, `.neurons-family-grid`, `.neurons-modal`), move ONLY the responsive properties into `styles.css` base + `@media` rules, and delete those exact properties from the inline objects.
- **Alternative rejected**: keep inline + slap `!important` on every CSS rule — brittle, specificity war, and still loses to inline `!important`. Removing the inline property is the clean path.
- **Implication**: each touched component gets a `className` + a slimmed inline object; the base (desktop) values move to the class so desktop stays identical.

### Decision 2: One `styles.css`, imported once at app entry, mirroring 二階 class names

`apps/neurons-tw/src/styles.css` imported in the app entry (`main.tsx`). Class names mirror 二階 where the pattern is identical (e.g. nav strip ≈ `.app-header__meta` behavior) so the two apps stay legible side-by-side. Breakpoints: `@media (max-width: 768px)` (single-column reflow) and `@media (max-width: 480px)` (nav scroll + fade), matching 二階.

### Decision 3: Patterns ported from 二階 (verbatim where possible)

- **Nav ≤ 480px**: `display:flex; overflow-x:auto; -webkit-overflow-scrolling:touch` + `-webkit-mask-image: linear-gradient(...)` fade on the right edge; thin scrollbar styling.
- **Body scroll lock**: `body:has(.modal-backdrop){overflow:hidden}` + `overscroll-behavior-y:none`. (Confirm neurons modals expose a `.modal-backdrop`-equivalent class; if not, add one.)
- **Cards < 768px**: `grid-template-columns: 1fr` (single column).
- **Modals 375px**: `max-width: 100vw` minus margin; inner content area `overflow-y:auto; max-height` so long content scrolls inside, not the page.

### Decision 4: Measurement-first — probe before writing CSS

Per the grill, **task 1 is a Chrome MCP measurement** of the current `OverviewPage` nav at 375px to quantify the actual overflow/squish (which items clip, by how much) BEFORE writing rules. Don't assume the failure shape.

### Decision 5: Verification = Chrome MCP class-override RWD probe (NOT resize_window)

Per `~/.claude/imports/chrome_mcp_rwd_probe.md`, `resize_window` doesn't actually change `innerWidth`. Verify by injecting an override stylesheet + toggling an `.is-mobile` / `.is-narrow` class on a probe container at 375 / 414 / 600, then `getBoundingClientRect()` to assert: nav doesn't overflow, cards single-column, modal fits. Dev-pass = change done; prod CF Pages re-check deferred to the deploy round.

## Risks / Trade-offs

- **[Inline-style specificity silently wins → CSS "does nothing"]** → Decision 1: remove the exact inline property being made responsive; a quick console check (`getComputedStyle` shows the CSS value, not the inline one) confirms the migration took. This is the #1 thing to get right.
- **[Removing an inline property changes desktop too]** → move the desktop value into the CSS class base rule (outside `@media`) so ≥768px is unchanged; assert via the "desktop unchanged" scenario.
- **[neurons modals may not have a `.modal-backdrop` class for the `:has()` lock]** → add the class to the backdrop element if absent (minimal touch).
- **[`body:has()` browser support]** → baseline in all current evergreen mobile browsers (Safari 15.4+); acceptable for this audience.
- **[Scope creep into connectome/list pages]** → hard out-of-scope; if a list page looks broken during probing, log it as a follow-up, don't fix here.

## Migration Plan

1. Chrome MCP probe current `OverviewPage` nav @ 375px → record overflow.
2. Create `apps/neurons-tw/src/styles.css`; import in app entry.
3. Per surface (nav → cards → modals → toasts): add `className`, move responsive properties from inline into CSS base + `@media`, delete those inline properties.
4. Class-override RWD probe @ 375/414/600 → assert no overflow / single-column / modal fits.
5. Confirm desktop (≥768px) unchanged (visual + `getComputedStyle`).
6. typecheck + build; `/opsx:verify`; archive.

**Rollback**: delete `styles.css` + its import, restore the moved inline properties. Pure-additive otherwise.

## Open Questions

- Does neurons already import any CSS at entry (reset/index.css)? Apply-phase step 0 confirms; if yes, co-locate; if no, this is the first.
- Exact 二階 class names worth reusing vs neurons-prefixed — resolve while reading `medexam2-hospital-tw/src/styles.css` in task 2.
