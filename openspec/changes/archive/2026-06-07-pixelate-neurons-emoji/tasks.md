## 1. Asset pack

- [x] 1.1 Create `apps/neurons-tw/public/icons/emoji/`; copy the 15 shared PNGs from `~/coding-scratch/study-rpg-2nd/apps/medexam2-hospital-tw/public/icons/emoji/`: ✨`2728` 🤔`1f914` 📖`1f4d6` 🐞`1f41e` ⭐`2b50` ⚡`26a1` 🏆`1f3c6` 🩺`1f9fa` 🎲`1f3b2` 📚`1f4da` 💡`1f4a1` 🎯`1f3af` 🎨`1f3a8` 👋`1f44b` ☁`2601`.
- [x] 1.2 Generate the 5 neurons-only PNGs into the same dir using 二階's documented prompt formula + ImageMagick post-process (chroma-key cream `#fef5ce` → resize 64×64 nearest-neighbor → 16-color quantize), per `~/.claude/imports/image_gen_routing.md`: 🧬`1f9ec` 🧠`1f9e0` 🔗`1f517` ⚔`2694` 🔭`1f52d`. Eyeball each against the copied 15 in one grid; regenerate any that don't match the pack style.
- [x] 1.3 Author `apps/neurons-tw/public/icons/emoji/CREDITS.md` (mirror 二階's: provenance for copied + generated icons, prompt formula, license = engine AGPL-3.0 / content CC-BY-NC-4.0).

## 2. Lookup + component (port verbatim)

- [x] 2.1 Create `apps/neurons-tw/src/lib/emoji-icons.ts` — `ICON_FILES` trimmed to the 20 covered rows (15 shared + 5 generated), `ICON_MAP`, `emojiIconUrl()` (uses `import.meta.env.BASE_URL`), `hasEmojiIcon()`, `normalize()` (strip U+FE0F).
- [x] 2.2 Create `apps/neurons-tw/src/components/EmojiIcon.tsx` — `<EmojiIcon char size title className/>` → pixel `<img>` (`imageRendering:pixelated`, explicit width/height, `draggable={false}`, `WebkitUserDrag:none`, `userSelect:none`, `verticalAlign:middle`) with `<span>{char}` native fallback when `emojiIconUrl` returns null.

## 3. Wire chrome JSX render sites (chrome only — leave legible surfaces native)

- [x] 3.1 Swap covered-set emoji literals → `<EmojiIcon char=…/>` in the chrome components: `FamilyPicker.tsx`, `FamilyFilterChips.tsx`, `MasteryChip.tsx`, `VariantCollectionChip.tsx`, `MazeExpedition.tsx`, `maze/MazeGrid.tsx`, `AchievementCard.tsx`, `AchievementToastHost.tsx`, `SynapseFormationToast.tsx`, `DmnDrawModal.tsx`, `EquipmentDexPanel.tsx`, `LeaderboardPromoBanner.tsx`, `QuizHotkeysAnnouncementBanner.tsx`, `HomepageOnboarding.tsx` (chrome bits), and the chrome regions of `OverviewPage.tsx` / `CollectionPage.tsx`.
- [x] 3.2 In `QuizModal.tsx`: swap ONLY the answer-quality buttons (✨太簡單 / 🤔我亂猜), the inline 🐞 control, and other quiz chrome. Do NOT touch the question stem / 4 options / 詳解 / disputed banner / AI note (legible surfaces — emoji there, if any, stay native).
- [x] 3.3 Confirm legible-surface excludes are left native: `QuestionBankPage.tsx` body cells, `BookmarksPage.tsx` stem-preview, `HelpMenu.tsx` teaching paragraphs, `BugReportModal.tsx` body/inputs. (`MotionDemoPage.tsx` is DEV-only — optional.)
- [x] 3.4 Clean up: remove any now-orphaned emoji-related inline styles / spans left behind by the swaps; no stray unused imports.

## 4. Verify

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw build` + `pnpm -r typecheck` clean.
- [x] 4.2 `pnpm --filter @study-rpg/neurons-tw test` (neurons vitest) green; `pnpm lint:dexie-fixtures` is a no-op (zero schema change — confirm no `.version()` bump).
- [x] 4.3 Chrome MCP dev smoke: mapped chrome emoji render as `<img>` (naturalWidth>0, computed `image-rendering: pixelated`), an unmapped long-tail emoji (e.g. 🔥) renders as native `<span>` (no tofu / no broken img), a `⚔️` (VS-16) input resolves to the pixel asset; exam/long-form surfaces (`/bank`, QuizModal stem/options/詳解) show NO pixel-img substitution; console clean.
- [x] 4.4 `/simplify` (code-touching) pass.
- [ ] 4.5 Post-merge prod Chrome MCP: `med-study-rpg.com/neurons/` — chrome emoji `<img>` load (asset `/neurons/icons/emoji/*.png` returns 200), pixelated render, SPA 三件套 (in-app nav + direct URL + F5), console clean.
