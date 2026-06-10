# neurons-pixel-typography

## Purpose

The pixel-vs-legible font-family scoping for `apps/neurons-tw`. It defines which UI surfaces render in the Cubic 11 pixel font (the warm GBA "RPG chrome") versus which MUST stay in the legible default (Noto Sans TC) — namely exam content and long-form prose — plus the webfont delivery contract (app-self-hosted, base-correct `@font-face`, `font-display: swap`). The app's global default is pixel; legible is an explicit per-surface opt-out so long CJK medical stems never become exhausting to read. This capability governs only font-family; it coexists with `neurons-clinical-aesthetic` (the cold-signal colour layer + monospace clinical data-readouts), which it does not override.

## Requirements

### Requirement: The Cubic 11 pixel webfont SHALL be shipped and loaded by the neurons app

The `apps/neurons-tw` app SHALL deliver the Cubic 11 pixel font (OFL-1.1) as a self-hosted webfont bundled by the app itself — declared via an app-level `@font-face` whose `src` is resolved by the app's own build (e.g. a Vite-fingerprinted relative `url()` from the app source, or the app's `public/` directory) — and SHALL NOT rely on a theme package to deliver the webfont (npm consumers do not receive theme font assets). The resolved font URL SHALL be correct under the app's configured Vite `base` in both dev (`/`) and production (`/neurons/`) so the font resolves rather than 404-ing to a silent fallback. The `@font-face` SHALL use `font-display: swap` so font loading never blocks first paint. The OFL license / attribution SHALL ship alongside the font asset.

#### Scenario: Pixel font asset loads at runtime

- **WHEN** the neurons app boots in a browser and any pixel-chrome surface renders
- **THEN** the Cubic 11 font file SHALL be requested and return HTTP 200 from the app's own bundled asset path (base-correct, not a 404)
- **AND** the `@font-face` SHALL declare `font-display: swap`
- **AND** an OFL license / attribution file SHALL ship alongside the font asset

#### Scenario: A chrome element actually resolves to the pixel font, not the fallback

- **GIVEN** the Cubic 11 webfont has loaded
- **WHEN** the computed `font-family` of a pixel-chrome element (e.g. the top-nav or app title) is inspected
- **THEN** the rendered font SHALL be Cubic 11 (the first family in the pixel token stack), not the Noto Sans TC fallback

### Requirement: Pixel font-family tokens SHALL be the single source of truth for chrome typography

The app SHALL define pixel font-family CSS custom properties (a CJK stack, a numeric stack, and a Latin/English stack — mirroring the sibling 二階 app's `--font-pixel-cjk` / `--font-pixel-num` / `--font-pixel-en`) plus a legible token (`--font-legible`, the Noto Sans TC stack). Pixel-chrome surfaces SHALL reference the pixel tokens via `var(--…)` and SHALL NOT hardcode `'Cubic 11'` or `'VT323'` font-family literals (a canvas rendering context that requires a literal font name is the only allowed exception). The pre-existing `'Cubic 11'` and `'VT323'` references in neurons components SHALL be migrated to these tokens, unifying on Cubic 11 as the primary pixel family (VT323 demoted to a fallback only). The app's default body `font-family` SHALL be the pixel CJK stack; legible styling SHALL be applied as an explicit per-surface opt-out, never the other way around.

#### Scenario: Chrome references tokens, no stray font literals

- **GIVEN** the change implementation is complete
- **WHEN** the touched neurons component + CSS files are scanned for font-family declarations
- **THEN** pixel-chrome surfaces SHALL reference `var(--font-pixel-*)` tokens
- **AND** no component SHALL hardcode a `'Cubic 11'` or `'VT323'` font-family literal outside the token definitions and the `@font-face` (excepting a canvas context that needs a literal font name)

#### Scenario: Default body font is pixel

- **WHEN** a surface with no explicit font-family treatment renders
- **THEN** it SHALL inherit the pixel CJK stack (Cubic 11), not the legible stack

### Requirement: Pixel font SHALL apply to warm RPG chrome only

The Cubic 11 pixel font SHALL be applied to the warm "RPG chrome" surfaces: the app title and top-nav, section headers, buttons, chips, user-facing counters and numbers (energy values, the `X/N` collection count, accuracy percentage, timers), and flavor text (variant persona names, birth captions, family labels, achievement names, leaderboard chrome, and DMN + maze UI labels). This requirement SHALL NOT override the `neurons-clinical-aesthetic` capability's monospace clinical data-readout treatment on data surfaces (connectome / EEG instrument stats); the warm pixel chrome and the cold clinical data readouts coexist.

#### Scenario: Chrome surfaces render pixel

- **GIVEN** the Cubic 11 webfont has loaded
- **WHEN** the player views the top-nav, a section header, a button, a family-picker chip, the collection `X/N` counter, and a variant persona name
- **THEN** each of those chrome surfaces SHALL render in the Cubic 11 pixel font

#### Scenario: Clinical data-readouts are not regressed

- **GIVEN** the `neurons-clinical-aesthetic` monospace data-readout treatment exists on data surfaces
- **WHEN** a connectome / EEG instrument stat readout renders
- **THEN** it SHALL retain its clinical monospace treatment and SHALL NOT be changed by this typography capability

### Requirement: Exam content and long-form prose SHALL stay legible and never render in the pixel font

The following surfaces SHALL render in the legible Noto Sans TC stack (`--font-legible`) and SHALL NEVER render in the pixel font, even when nested inside a pixel-chrome container: the QuizModal question stem, the four answer options, the 詳解 (explanation) text, the disputed-answer banner, and the AI/disclaimer note; the 題庫 `/bank` (`QuestionBankPage`) question, option, answer, and explanation cells; the `/bookmarks` truncated question-stem preview; HelpMenu teaching paragraphs; and the bug-report input box and body text. These surfaces SHALL carry an explicit legible font-family override so that pixel styling cannot leak in via CSS inheritance. The governing boundary SHALL be: exam content or long-form prose → legible; surrounding operate/label chrome → pixel.

#### Scenario: Quiz exam text stays legible

- **WHEN** the player opens a question in the QuizModal
- **THEN** the question stem, the four options, the 詳解 explanation, and the AI/disclaimer note SHALL render in the legible Noto Sans TC stack, not the pixel font
- **AND** the surrounding quiz chrome (answer-quality buttons such as ✨太簡單 / 🤔我亂猜, hotkey badges, the energy-strip label, the bookmark control) MAY render in the pixel font

#### Scenario: Question bank body stays legible while its chrome is pixel

- **WHEN** the player opens `/bank`
- **THEN** the question, option, answer, and explanation cells SHALL render in the legible Noto Sans TC stack
- **AND** the `/bank` filter chips (科別 / 年份 / 次別) and the `N/total` count MAY render in the pixel font

#### Scenario: Long-form prose stays legible

- **WHEN** the player reads a HelpMenu teaching paragraph or types into the bug-report body
- **THEN** that long-form text SHALL render in the legible Noto Sans TC stack, not the pixel font

### Requirement: Chrome emoji SHALL render as pixel icons via an EmojiIcon component with graceful native fallback

Inline emoji on the app's warm "RPG chrome" surfaces SHALL be rendered through an `EmojiIcon` React component that substitutes a GBA-style pixel-art PNG (`apps/neurons-tw/public/icons/emoji/<lowercase-hex-codepoint>.png`, 64×64) for any emoji character mapped in the app's emoji-icon manifest (`apps/neurons-tw/src/lib/emoji-icons.ts`), so chrome emoji visually match the Cubic 11 pixel chrome. For an emoji character NOT present in the manifest, `EmojiIcon` SHALL fall back to rendering the original character in an inline `<span>` (the OS emoji font keeps working — no broken or missing-glyph "tofu" output). The manifest lookup SHALL normalize the U+FE0F variation selector before matching, so a variation-selector-bearing input (e.g. `⚔️`) resolves to the same asset as its bare codepoint. The pixel `<img>` SHALL be rendered with `image-rendering: pixelated`, an explicit width/height equal to the requested `size`, and `draggable={false}`. The resolved asset URL SHALL be base-correct under the app's configured Vite `base` (via `import.meta.env.BASE_URL`) so it returns HTTP 200 in both dev (`/`) and production (`/neurons/`) rather than 404-ing to a broken image. The OFL-equivalent provenance / attribution for the icon pack SHALL ship alongside the assets (a `CREDITS.md` in the icon directory).

This requirement governs only warm chrome emoji. It SHALL NOT pixelize emoji inside the legible exam/long-form surfaces governed by the "Exam content and long-form prose SHALL stay legible" requirement; emoji that appear within those surfaces SHALL remain native. Emoji embedded in non-JSX contexts (e.g. transient toast strings or dynamic label-data arrays) MAY remain native and are not required to route through `EmojiIcon`.

The HelpMenu SHALL follow the same chrome/prose boundary rather than being excluded wholesale: its floating ❓ FAB, 📖 header icon, accordion section icons, and action-button glyphs (e.g. 🚀 遠征動畫 toggle / 🧭 重看新手引導 / 🩺 開啟回報表單) are chrome and SHALL render through `EmojiIcon`; emoji inside its teaching paragraphs are long-form prose and SHALL remain native.

#### Scenario: Mapped chrome emoji renders as a pixel img

- **GIVEN** the manifest maps `'⚡'` to filename `'26a1.png'`
- **WHEN** a chrome surface renders `<EmojiIcon char="⚡" size={20} />`
- **THEN** the DOM SHALL produce an `<img>` whose `src` ends with `icons/emoji/26a1.png` (base-correct under the app's Vite `base`), with `width="20"` and `height="20"` and inline style including `image-rendering: pixelated`
- **AND** the asset SHALL return HTTP 200 (not a 404 / broken image)

#### Scenario: Unmapped emoji falls back to a native span

- **GIVEN** the manifest has no entry for a given emoji character (no pixel-art asset exists for it yet)
- **WHEN** `<EmojiIcon char="🔥" size={20} />` mounts
- **THEN** the DOM SHALL produce a `<span>` containing the literal native emoji glyph (rendered by the OS emoji font), with no `<img>` element and no missing-glyph "tofu" box

#### Scenario: Variation selector is normalized before lookup

- **GIVEN** the manifest maps the bare codepoint `'⚔'` (U+2694) to its pixel-art filename
- **WHEN** `<EmojiIcon char="⚔️" />` mounts where the input carries a trailing U+FE0F variation selector
- **THEN** the normalize step SHALL strip U+FE0F and the lookup SHALL match the bare-codepoint asset, rendering the pixel `<img>` (not the text fallback)

#### Scenario: Exam / long-form emoji stay native

- **GIVEN** the legible exam/long-form surfaces (QuizModal stem/options/詳解, `/bank` body cells, HelpMenu paragraphs, bug-report body)
- **WHEN** any emoji appears inside one of those surfaces
- **THEN** it SHALL render as a native system emoji glyph and SHALL NOT be substituted with a pixel-art sprite

#### Scenario: HelpMenu chrome emoji render as pixel icons

- **WHEN** the player opens the HelpMenu
- **THEN** the floating ❓ FAB, the 📖 header icon, every accordion section icon, and the action-button glyphs (🚀 / 🧭 / 🩺) SHALL render as pixel `<img>` elements whose assets return HTTP 200
- **AND** emoji inside the teaching paragraphs SHALL remain native system glyphs
