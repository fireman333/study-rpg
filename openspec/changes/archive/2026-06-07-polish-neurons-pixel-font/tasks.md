## 1. Ship the Cubic 11 webfont + tokens

- [x] 1.1 Create `apps/neurons-tw/public/fonts/` and copy `Cubic_11.woff2` (391 KB) + `Cubic_11.woff` (643 KB) from `~/coding-scratch/study-rpg-2nd/apps/medexam2-hospital-tw/public/fonts/`.
- [x] 1.2 Add the Cubic 11 OFL-1.1 license + attribution: ship `apps/neurons-tw/public/fonts/OFL.txt` (fetch the canonical Cubic 11 OFL text) and add a one-line credit (e.g. in the app's existing CREDITS / about surface or a comment in `styles.css`).
- [x] 1.3 Verify the neurons Vite `base` in `apps/neurons-tw/vite.config.*` (expected `/neurons/`). The `@font-face` `src` URL MUST match it (e.g. `/neurons/fonts/Cubic_11.woff2`). A mismatched base → 404 → silent fallback.
- [x] 1.4 Add the `@font-face` block for `'Cubic 11'` (woff2 + woff `src`, `font-display: swap`) to the top of `apps/neurons-tw/src/styles.css`, mirroring the 二階 `styles.css` declaration.
- [x] 1.5 Add `:root` tokens to `apps/neurons-tw/src/styles.css`: `--font-pixel-cjk: 'Cubic 11','Noto Sans TC',sans-serif;` `--font-pixel-num: 'Cubic 11','VT323','Courier New',monospace;` `--font-pixel-en: 'Cubic 11','Press Start 2P','Courier New',monospace;` and `--font-legible: 'Noto Sans TC',sans-serif;` (match the app's actual current default stack). Confirm default body font-family stays the legible stack (no global swap).

## 2. Migrate existing hardcoded font refs → tokens

- [x] 2.1 `MazeExpedition.tsx:351,361` — replace `'Cubic 11', 'Noto Sans TC', sans-serif` with `var(--font-pixel-cjk)`.
- [x] 2.2 `HelpMenu.tsx:279` — replace `'Cubic 11', …` with the pixel token (header/chrome only).
- [x] 2.3 `QuizHotkeysAnnouncementBanner.tsx:90` + `HelpMenu.tsx:368,382` — replace `'VT323', 'Courier New', monospace` with `var(--font-pixel-num)` (unify on Cubic 11). Confirm `HelpMenu.tsx` teaching paragraphs are NOT pixel (§3.4).
- [x] 2.4 Grep `apps/neurons-tw/src` for any remaining `'Cubic 11'` / `'VT323'` literal — none should remain outside the token definitions in `styles.css`.

## 3. Apply pixel to warm chrome; lock exam/long-form to legible

- [x] 3.1 Enumerate the chrome-surface allow-list: grep all `*Page` / nav / chip / button / counter components and decide each → pixel (chrome) vs legible (exam/prose). Apply pixel via `var(--font-pixel-*)` to: `App.tsx` nav + app title; `FamilyPicker.tsx` family labels/chips; chrome of `CollectionPage` / `LeaderboardPage` / `AchievementsPage` / `DmnCollectionPage` (titles, chips, counters, persona names, captions, achievement names, leaderboard chrome).
- [x] 3.2 Counters/numbers in chrome (energy values, `X/N` collection count, accuracy %, timers) → `var(--font-pixel-num)`.
- [x] 3.3 QuizModal: apply pixel to the surrounding chrome ONLY (answer-quality buttons ✨太簡單 / 🤔我亂猜, hotkey badges, energy-strip label, bookmark). Add an explicit `font-family: var(--font-legible)` override on the question stem + 4 options + 詳解 explanation + AI/disclaimer badge so inheritance can't leak pixel in.
- [x] 3.4 `/bank` (`QuestionBankPage.tsx`): filter chips (科別/年份/次別) + `N/total` count → pixel; question/option/explanation cells → explicit `var(--font-legible)`.
- [x] 3.5 Long-form prose explicit legible override: HelpMenu teaching paragraphs + bug-report input box/body → `var(--font-legible)`.
- [x] 3.6 Confirm emoji untouched (no sprite/emoji-font substitution introduced) — out of scope.

## 4. Verify (run-mode quality gate)

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw build` (TS strict + Vite) green.
- [x] 4.2 `pnpm -r typecheck` + `pnpm lint:dexie-fixtures` (latter must be a no-op — zero schema).
- [x] 4.3 `pnpm --filter @study-rpg/neurons-tw test` green (no test changes expected; confirm no regression).
- [x] 4.4 Dev Chrome MCP smoke: chrome renders Cubic 11 (computed font-family resolves to Cubic 11, not fallback) + QuizModal stem/options/詳解 + `/bank` body confirmed legible + emoji native + console clean.
- [x] 4.5 `/simplify` pass on the touched files.

## 5. Ship (run-mode: archive → commit → push → merge → deploy → prod-verify)

- [ ] 5.1 `/opsx:archive polish-neurons-pixel-font` (sync delta into `openspec/specs/neurons-pixel-typography/`).
- [ ] 5.2 Explicit per-file `git add` + archive commit on `track-neurons`; push.
- [ ] 5.3 Merge `track-neurons` → `main` (in the `study-rpg` worktree; leave its untracked `add-cloudflare-auth-migration/` untouched) → push → `deploy-cf-pages.yml`.
- [ ] 5.4 Prod verify at `med-study-rpg.com/neurons/`: SPA three-piece + the 4-point visual bar — (a) chrome = Cubic 11 pixel not fallback, (b) QuizModal stem/options/詳解 + `/bank` body NON-pixel, (c) emoji renders fine (not tofu), (d) network shows font file 200 + `font-display:swap` with no FOIT.
