# pixelate-neurons-helpmenu-emoji

## Why

`pixelate-neurons-emoji` (2026-06-07) ported the pixel emoji icon mechanism and swapped the app-wide chrome render sites, but HelpMenu was blanket-listed under the legible-surface excludes (task 3.3 named "HelpMenu.tsx teaching paragraphs"). The exclusion was meant for the teaching prose; HelpMenu's **chrome** — the floating ❓ FAB, the 📖 header, the 16 accordion section icons, and the 3 action buttons (🚀 遠征動畫 toggle / 🧭 重看新手引導 / 🩺 開啟回報表單) — got skipped along with it and still renders smooth native color emoji against the GBA pixel chrome. Owner spotted it on 2026-06-10: 「HelpMenu 的 emoji 都還沒有像素化」.

## What Changes

- Backfill **10 new pixel emoji PNGs** into `apps/neurons-tw/public/icons/emoji/` for the HelpMenu chrome glyphs not yet in the pack: 🧭 `1f9ed` / ⌨ `2328` / 📋 `1f4cb` / 🌟 `1f31f` / 🔌 `1f50c` / 💎 `1f48e` / 🐛 `1f41b` / 🏅 `1f3c5` / ❓ `2753` / 🚀 `1f680` — generated via the pack's documented codex `gpt-image-2` formula + ImageMagick post-process (chroma-key cream → 64×64 nearest-neighbor → 16-color quantize), matching the existing 21-icon style.
- Add the 10 manifest rows to `src/lib/emoji-icons.ts` (bare-codepoint keys; U+FE0F inputs like ⌨️ resolve via the existing `normalize()`).
- Swap HelpMenu chrome emoji literals → `<EmojiIcon>`: FAB ❓, header 📖, all 16 `SECTIONS[].icon` (rendered once at the accordion summary), and the 3 action buttons. **Teaching paragraphs stay native** per the existing legible-surface requirement — inline prose emoji (✨ 🤔 ⭐ 🐞 📋 ⚔️ …) are NOT touched.
- Update `public/icons/emoji/CREDITS.md` provenance for the 10 new icons.

## Capabilities

### Modified Capabilities

- `neurons-pixel-typography`: the "Chrome emoji SHALL render as pixel icons via an EmojiIcon component" requirement gains an explicit HelpMenu chrome/prose boundary — FAB + header + section icons + action buttons are chrome (pixel icons); teaching paragraphs remain legible-native.

## Impact

- **New files**: 10 PNGs under `apps/neurons-tw/public/icons/emoji/`.
- **Edited files**: `apps/neurons-tw/src/components/HelpMenu.tsx`, `apps/neurons-tw/src/lib/emoji-icons.ts`, `apps/neurons-tw/public/icons/emoji/CREDITS.md`.
- **Schema / sync**: **ZERO** — no Dexie bump, no R2 `SCHEMA_VERSION` bump, no Worker change; `lint:dexie-fixtures` is a no-op.
- **Deploy**: presentation-only; rides the normal merge→main → `deploy-cf-pages.yml` path.
