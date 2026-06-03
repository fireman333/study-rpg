## 1. Measure (before writing any CSS)

- [x] 1.1 Confirm whether `apps/neurons-tw` already imports any CSS at entry — YES: `main.tsx:5` imports `@study-rpg/theme-pixel-neurons/styles/global.css` (0 media queries). New `styles.css` co-locates after it. No app-local `.css` yet.
- [x] 1.2 Chrome MCP probe @ 375px (dev on `localhost:5183`, not 5184; vite port 5175→auto-inc). **Finding**: nav (in `App.tsx`, NOT OverviewPage) has 6 items = 65+77+69+65+65+65 = 406px > 335px content box → `flex-wrap:wrap` wraps to **2 rows**, ballooning header 34px→**150px**. No page-level h-overflow (wrap prevents it; the spec's overflow clause is a satisfied backstop). Real fix = wrap→horizontal-scroll single row. Toast primitive (`lib/motion/Toast.tsx`) has inline `maxWidth:480px` > 375 = real overflow risk.
- [x] 1.3 Read `apps/medexam2-hospital-tw/src/styles.css` — extracted verbatim: `.app-header__meta` nav-scroll (`flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;scroll-snap`) + `@media(max-width:480px)` mask-image fade + `html,body{overscroll-behavior-y:none}` + `body:has(.modal-backdrop){overflow:hidden}` + `grid-template-columns:1fr` single-col.

## 2. Stylesheet scaffold

- [x] 2.1 Created `apps/neurons-tw/src/styles.css` with 480 / 768 breakpoint structure (mirror 二階)
- [x] 2.2 Imported once at app entry (`main.tsx:6`, after the theme global.css)

## 3. Nav (App.tsx top-nav — NOT OverviewPage; nav lives in the app shell header)

- [x] 3.1 `<nav>` now `className="neurons-nav"`; moved display/gap/flex-wrap to `.neurons-nav` base rule; **deleted the `navStyle` inline const entirely** (it held only those 3 props — inline beats CSS, Decision 1). Source was a local style const, not `THEME_PIXEL_NEURONS`.
- [x] 3.2 `@media (max-width: 480px)`: `flex-basis:100%` (own row) + `flex-wrap:nowrap` + `overflow-x:auto` + `-webkit-mask-image` fade + thin scrollbar + `flex-shrink:0` on `> a`
- [x] 3.3 Verified via `getComputedStyle` (see §6.1 probe) — CSS value now applies, not stale inline

## 4. FamilyPicker cards

- [x] 4.1 `branchRow` div now `className="neurons-family-grid"`; moved `gridTemplateColumns` out of inline `branchRowStyle` into CSS base (display:grid + gap stay inline)
- [x] 4.2 `@media (max-width: 768px)`: `grid-template-columns: 1fr` (single column)

## 5. Overlays (4)

- [x] 5.1 No `.modal-backdrop` class existed — added it to QuizModal (×3 backdrop states) + DmnDrawModal overlay + VariantUnlockModal overlay
- [x] 5.2 Added `body:has(.modal-backdrop){overflow:hidden}` + `html,body{overscroll-behavior-y:none}` to styles.css
- [x] 5.3 QuizModal already had `width:100%`+`maxWidth:720px`+`maxHeight:90vh`+ inner `bodyStyle{overflow-y:auto}` (fits 343px @375 + scrolls internally) — class added. **Deviation from plan**: DmnDrawModal (`min(420px,92vw)`) + VariantUnlockModal (`min(360px,92vw)`) already cap to viewport; did NOT add card `overflow-y:auto`/`maxHeight` because VariantUnlockModal's rarity badge is `position:absolute;top:-0.7rem` (overflow:auto would clip it) AND both are short fixed-layout reveal modals (~360–420px tall < 587px @ iPhone-SE 375×667 ·88vh) so no vertical overflow exists to scroll. Class-only is the minimal correct touch; verified fit in §6.
- [x] 5.4 Achievement toast: motion-lib `<Toast>` had inline `maxWidth:480px` (>375 → overflow). Capped to `min(480px, calc(100vw - 1.6rem))` (+ minWidth floor) — viewport-aware, desktop unchanged (picks 480 above ~512px)

## 6. Verify (Chrome MCP class-override probe — per chrome_mcp_rwd_probe.md, NOT resize_window)

- [x] 6.1 Probe @ 375/414/600: nav **single row + scrollable** (435px scrollW > 335/374 clientW), no page overflow; family cards **single-column** (gridTracks=1) at all 3; QuizModal width:100%@1rem-pad backdrop = ~343px fit + `bodyStyle{overflow-y:auto}`+maxHeight:90vh internal scroll; DMN/Variant `min(420/360px,92vw)` fit; toast capped `min(480px,100vw-1.6rem)`
- [x] 6.2 Desktop-unchanged @ 1024px: headerH 34 (= pre-change baseline), nav 1 row, gridTracks **5** (multi-col preserved) — `@media` rules don't apply, layout pixel-identical
- [x] 6.3 `read_console_messages onlyErrors` clean (boot + interaction; only pre-existing React-Router future warnings, none introduced)
- [x] 6.4 typecheck: `pnpm --filter @study-rpg/neurons-tw typecheck` — clean
- [x] 6.5 build: `pnpm --filter @study-rpg/neurons-tw build` — ✓ 1.41s; styles.css bundled (`index-*.css` 1.32 kB / gzip 0.67 kB)
- [x] 6.6 `openspec validate add-neurons-mobile-rwd --strict` — valid
- [x] 6.7 Live `body:has(.modal-backdrop)` lock confirmed (computed body overflow visible→hidden→visible) + `overscroll-behavior-y:none` active

## 7. Archive

## 7. Archive

- [ ] 7.1 `/verify` (optional, user-driven)
- [ ] 7.2 `/opsx:archive add-neurons-mobile-rwd`
- [ ] 7.3 `openspec validate --all --strict` confirm specs valid post-merge

## Acceptance criteria

- [x] `apps/neurons-tw/src/styles.css` exists + imported at entry (`main.tsx:6`)
- [x] At 375px: no horizontal page overflow; nav items all reachable (scrollable); FamilyPicker single-column
- [x] At ≤ 480px: nav horizontal-scrolls with fade affordance (mask-image confirmed in loaded stylesheet)
- [x] All 4 overlays fit 375px without horizontal overflow; body locks scroll when a modal is open (live-confirmed)
- [x] Desktop (≥ 768px) layout visually unchanged from pre-change (1024px: headerH 34, gridTracks 5 — identical)
- [x] Only media-sensitive properties migrated out of inline (no full rewrite); connectome + list pages untouched
- [x] typecheck + build green; `validate --strict` passes
