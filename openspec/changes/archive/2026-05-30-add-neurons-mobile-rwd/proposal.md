## Why

`apps/neurons-tw` shipped with all-inline styling (via `THEME_PIXEL_NEURONS`) and almost no `@media` queries, so the homepage top-nav (6 links + `DmnDrawButton` + `AuthGate`) squishes on phones and overlays aren't verified at mobile widths. The project NFR requires **mobile < 768px single-column reflow** (`openspec/project.md` Non-Functional Requirements). Sibling 二階 (`apps/medexam2-hospital-tw`) already solved this with a `styles.css` + ~27 media queries (horizontal-scroll nav, fade mask, overscroll lock). This is the **#2 remaining neurons launch gap** — the #1 (invisible variant gacha art) just shipped via `generate-neuron-variant-sprites`. We mirror 二階's proven patterns rather than invent new ones.

## What Changes

- Add `apps/neurons-tw/src/styles.css` (neurons-tw's first dedicated responsive stylesheet), imported once at the app entry.
- Migrate **only the media-sensitive rules** (homepage nav, FamilyPicker cards, modal/toast sizing) out of inline `THEME_PIXEL_NEURONS` styles into CSS classes with `@media`. Leave all non-responsive inline styles untouched (**NOT** a full inline→CSS rewrite — scope guard).
- Mirror 二階's RWD patterns, referencing `apps/medexam2-hospital-tw/src/styles.css`:
  - **480 / 768 breakpoints**
  - Horizontal-scroll nav tabs + `-webkit-mask-image` fade affordance at ≤ 480px
  - `body:has(.modal-backdrop) { overflow: hidden }` + `overscroll-behavior-y: none`
- **Surfaces**: `OverviewPage` top-nav + `FamilyPicker` cards + 4 overlays (`QuizModal` / `DmnDrawModal` / `VariantUnlockModal` + achievement toasts).
- **Target widths**: iPhone SE 375 / standard 390 (+ 360 Android in passing).

**不做**：

- connectome tree SVG RWD — separate, harder change (pan/zoom/scale decisions).
- list pages (`/bookmarks` / `/achievements` / `/leaderboard`) RWD — separate change.
- Full inline→CSS migration — only media-sensitive rules move.
- 320px (old-device) support — 375 floor.
- New dependencies / Tailwind (project constraint: vanilla CSS + CSS variables only).

## Capabilities

### New Capabilities

- `neurons-responsive-layout`: mobile reflow requirements for neurons-tw's homepage nav + family cards + modal/toast overlays — single-column reflow < 768px, horizontal-scroll nav + fade affordance ≤ 480px, overlays fit viewport without overflow at 375px. Follows the `quiz-partner-card-rwd` precedent of keeping RWD as its own small capability rather than scattering responsive clauses across `neurons-mode`.

### Modified Capabilities

- 無（neurons-mode 既有的 Overview nav / family-picker / quiz requirements 不改語意，只是新增 responsive 行為由新 capability 描述）

## Impact

- **Code**:
  - `apps/neurons-tw/src/styles.css`（新；first responsive stylesheet, mirrors 二階 patterns）
  - `apps/neurons-tw/src/main.tsx`（或 app entry）— `import './styles.css'` 一行
  - `OverviewPage.tsx` / `FamilyPicker.tsx` / 4 overlay components — 加 `className` hooks（minimal；inline style 保留，只把 media-sensitive 的搬到 class）
- **APIs / Dependencies**: 無新增
- **Data / Sync**: 不碰 Dexie / R2 / event schema
- **Backwards compat**: 純樣式增加；桌機 layout 不變（@media 只在窄寬觸發）
- **Bundle**: +1 small CSS file（hashed by Vite）
- **Spec touched**: 1 new capability `neurons-responsive-layout`
- **Out-of-scope follow-ups**: `neurons-responsive-connectome`（SVG）、`neurons-responsive-list-pages`
