## 1. Asset backfill

- [x] 1.1 Generate the 10 HelpMenu chrome PNGs via codex `gpt-image-2` (pack formula prompt) + ImageMagick post-process (floodfill chroma-key cream `#fef5ce` → trim → 64×64 nearest-neighbor → 16-color quantize): 🧭`1f9ed` ⌨`2328` 📋`1f4cb` 🌟`1f31f` 🔌`1f50c` 💎`1f48e` 🐛`1f41b` 🏅`1f3c5` ❓`2753` 🚀`1f680`. Eyeball each against the existing 21 in one grid; regenerate any that clash with the pack style.
- [x] 1.2 Update `apps/neurons-tw/public/icons/emoji/CREDITS.md` provenance (10 new generated icons, date, formula unchanged).

## 2. Manifest + HelpMenu wiring

- [x] 2.1 Add the 10 rows to `ICON_FILES` in `apps/neurons-tw/src/lib/emoji-icons.ts` (bare-codepoint keys).
- [x] 2.2 `HelpMenu.tsx`: swap chrome emoji → `<EmojiIcon>` — FAB ❓ (size 22), header 📖 (16), section summary icon `{section.icon}` (20, decorative), 🚀 toggle pill (14), 🧭 replay pill (14), 🩺 回報表單 CTA (15). Teaching paragraphs untouched (inline prose emoji stay native per spec).

## 3. Verify

- [x] 3.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` green; no Dexie `.version()` bump (fixture lint no-op).
- [x] 3.2 `pnpm --filter @study-rpg/neurons-tw build` clean.
- [x] 3.3 Chrome MCP dev smoke: open HelpMenu — FAB / header / all 16 section icons / 3 buttons render as `<img>` (naturalWidth>0, `image-rendering: pixelated`, asset 200); body paragraphs contain NO pixel-img substitution; console clean.
- [x] 3.4 Owner eyeballed the 10 new icons (style match OK) + confirmed spec delta wording (2026-06-10 「OK」) → archive + commit.
