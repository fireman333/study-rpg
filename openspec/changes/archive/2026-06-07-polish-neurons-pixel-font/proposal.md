## Why

`apps/neurons-tw` aims for a GBA-era pixel-RPG look, and three components already *reference* `font-family: 'Cubic 11'` / `'VT323'` — but the webfont was **never shipped** (no `@font-face`, no `public/fonts/`), so every reference silently falls back to Noto Sans TC and the app has no pixel typography at all. The sibling 二階 app (`study-rpg-2nd`) already ships Cubic 11 with a clean `--font-pixel-*` token system; neurons should match that "RPG chrome" feel — **without** making long medical exam text painful to read (project NFR already warns CJK pixel fonts are exhausting for long stems).

## What Changes

- **Ship the Cubic 11 webfont** into `apps/neurons-tw/public/fonts/` (`Cubic_11.woff2` 391 KB + `.woff` 643 KB, OFL-1.1) + an app-level `@font-face` + OFL attribution. `font-display: swap`.
- **Add `--font-pixel-*` CSS tokens** to `apps/neurons-tw/src/styles.css` (mirroring the 二階 token system) so chrome surfaces reference them uniformly instead of hardcoding font names.
- **Apply pixel font to "RPG chrome" only**: app title / nav / section headers / buttons / chips / counters & numbers (energy values, `X/220` collection count, accuracy %, timers) / flavor text (variant persona names, captions, family labels, achievement names, leaderboard chrome, DMN + maze UI labels). The three existing `'Cubic 11'` / `'VT323'` references switch to the tokens (VT323 folded into Cubic 11 — single pixel family).
- **Keep exam content + long-form prose legible (Noto Sans TC, never pixel)** — explicit allow-list: QuizModal question stem + 4 options + 詳解 explanation + AI/disclaimer badge; 題庫 `/bank` (`QuestionBankPage.tsx`) question/option/explanation cells; HelpMenu teaching paragraphs; bug-report input box/body. Boundary rule = *"is it exam content or long-form prose?"* → legible; surrounding operate/label chrome → pixel.
- **Does NOT touch the `neurons-clinical-aesthetic` cold-signal data-readouts** — the monospace clinical stat treatment on data surfaces (connectome / EEG instrument readouts) stays as that capability dictates; pixel-typography governs the *warm chrome* font-family only and the two coexist.

## Capabilities

### New Capabilities

- `neurons-pixel-typography`: The pixel-vs-legible font-family scoping for neurons-tw — which UI surfaces render in the Cubic 11 pixel font (warm RPG chrome) vs which MUST stay in the legible default (exam content + long-form prose), plus the webfont delivery contract (app `public/fonts/` + `@font-face` + `font-display: swap`).

### Modified Capabilities

<!-- None. neurons-clinical-aesthetic (cold-signal color layer + monospace data readouts) is a separate concern and is NOT modified; pixel-typography coexists with it. -->

## Impact

- **Assets**: new `apps/neurons-tw/public/fonts/Cubic_11.woff2` + `Cubic_11.woff` + OFL license/attribution.
- **CSS**: `apps/neurons-tw/src/styles.css` (`@font-face` + `--font-pixel-*` tokens + chrome-surface rules + explicit legible overrides).
- **Components** (switch hardcoded font refs → tokens / apply chrome class): `App.tsx` (nav/title), `FamilyPicker.tsx`, `MazeExpedition.tsx`, `HelpMenu.tsx`, `QuizHotkeysAnnouncementBanner.tsx`, and the chrome of `CollectionPage` / `LeaderboardPage` / `AchievementsPage` / `DmnCollectionPage` / `QuizModal` (buttons/chips/counters only) / `QuestionBankPage` (filter chips + count only).
- **Out of scope (explicit)**: emoji stay native system color emoji — pixelizing the ~119 inline emoji is a deferred follow-up, not this change.
- **Zero schema / sync** — pure presentation. No Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no Worker change (`dexie-fixture-lint` no-op).
- **Deploy**: `deploy-cf-pages.yml` only (rebuilds neurons + CF Pages).
