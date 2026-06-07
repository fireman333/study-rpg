## ADDED Requirements

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

The app SHALL define pixel font-family CSS custom properties (a CJK stack, a numeric stack, and a Latin/English stack — mirroring the sibling 二階 app's `--font-pixel-cjk` / `--font-pixel-num` / `--font-pixel-en`) plus a legible token (`--font-legible`, the Noto Sans TC stack). Pixel-chrome surfaces SHALL reference the pixel tokens via `var(--…)` and SHALL NOT hardcode `'Cubic 11'` or `'VT323'` font-family literals. The pre-existing `'Cubic 11'` and `'VT323'` references in neurons components SHALL be migrated to these tokens, unifying on Cubic 11 as the primary pixel family (VT323 demoted to a fallback only). The app's default body `font-family` SHALL remain the legible Noto Sans TC stack — pixel styling SHALL be opt-in per chrome surface, never a global swap.

#### Scenario: Chrome references tokens, no stray font literals

- **GIVEN** the change implementation is complete
- **WHEN** the touched neurons component + CSS files are scanned for font-family declarations
- **THEN** pixel-chrome surfaces SHALL reference `var(--font-pixel-*)` tokens
- **AND** no component SHALL hardcode a `'Cubic 11'` or `'VT323'` font-family literal (these live only inside the token definitions)

#### Scenario: Default body font stays legible

- **WHEN** a surface with no explicit font-family treatment renders
- **THEN** it SHALL inherit the legible Noto Sans TC stack, not the pixel font

### Requirement: Pixel font SHALL apply to warm RPG chrome only

The Cubic 11 pixel font SHALL be applied to the warm "RPG chrome" surfaces: the app title and top-nav, section headers, buttons, chips, user-facing counters and numbers (energy values, the `X/N` collection count, accuracy percentage, timers), and flavor text (variant persona names, birth captions, family labels, achievement names, leaderboard chrome, and DMN + maze UI labels). This requirement SHALL NOT override the `neurons-clinical-aesthetic` capability's monospace clinical data-readout treatment on data surfaces (connectome / EEG instrument stats); the warm pixel chrome and the cold clinical data readouts coexist.

#### Scenario: Chrome surfaces render pixel

- **GIVEN** the Cubic 11 webfont has loaded
- **WHEN** the player views the top-nav, a section header, a button, a family-picker chip, the collection `X/N` counter, and a variant persona name
- **THEN** each of those chrome surfaces SHALL render in the Cubic 11 pixel font

#### Scenario: Clinical data-readouts are not regressed

- **GIVEN** the `neurons-clinical-aesthetic` monospace data-readout treatment exists on data surfaces
- **WHEN** a connectome / EEG instrument stat readout renders
- **THEN** it SHALL retain its clinical monospace treatment and SHALL NOT be changed by this typography change

### Requirement: Exam content and long-form prose SHALL stay legible and never render in the pixel font

The following surfaces SHALL render in the legible Noto Sans TC stack (`--font-legible`) and SHALL NEVER render in the pixel font, even when nested inside a pixel-chrome container: the QuizModal question stem, the four answer options, the 詳解 (explanation) text, and the AI/disclaimer badge text; the 題庫 `/bank` (`QuestionBankPage`) question, option, and explanation cells; HelpMenu teaching paragraphs; and the bug-report input box and body text. These surfaces SHALL carry an explicit legible font-family override so that pixel styling cannot leak in via CSS inheritance. The governing boundary SHALL be: exam content or long-form prose → legible; surrounding operate/label chrome → pixel.

#### Scenario: Quiz exam text stays legible

- **WHEN** the player opens a question in the QuizModal
- **THEN** the question stem, the four options, the 詳解 explanation, and the AI/disclaimer badge SHALL render in the legible Noto Sans TC stack, not the pixel font
- **AND** the surrounding quiz chrome (answer-quality buttons such as ✨太簡單 / 🤔我亂猜, hotkey badges, the energy-strip label, the bookmark control) MAY render in the pixel font

#### Scenario: Question bank body stays legible while its chrome is pixel

- **WHEN** the player opens `/bank`
- **THEN** the question, option, and explanation cells SHALL render in the legible Noto Sans TC stack
- **AND** the `/bank` filter chips (科別 / 年份 / 次別) and the `N/total` count MAY render in the pixel font

#### Scenario: Long-form prose stays legible

- **WHEN** the player reads a HelpMenu teaching paragraph or types into the bug-report body
- **THEN** that long-form text SHALL render in the legible Noto Sans TC stack, not the pixel font

### Requirement: Emoji SHALL remain native system emoji (out of scope for pixelization)

This change SHALL leave the app's inline emoji as native system color emoji and SHALL NOT replace them with pixel-art sprites or a pixel emoji font. Emoji pixelization is explicitly deferred to a future follow-up.

#### Scenario: Emoji render natively, not as tofu

- **WHEN** any surface containing an inline emoji renders after the pixel font has loaded
- **THEN** the emoji SHALL render as a native system emoji glyph (not a missing-glyph "tofu" box and not a pixel-art sprite substitution)
