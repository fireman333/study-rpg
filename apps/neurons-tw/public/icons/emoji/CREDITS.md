# Pixel-art Emoji Icon Set (neurons-tw)

GBA-style pixel-art icons used as inline UI emoji replacements in the neurons-tw
warm RPG chrome (see `src/components/EmojiIcon.tsx` + `src/lib/emoji-icons.ts`).
Filename = Twemoji codepoint convention (lowercase hex), e.g. `26a1.png` = ⚡.

## Provenance

This pack was assembled for `pixelate-neurons-emoji` (2026-06-07):

- **16 icons copied verbatim** from the sibling 二階 app
  (`study-rpg-2nd/apps/medexam2-hospital-tw/public/icons/emoji/`): ☁ `2601` /
  ⚡ `26a1` / ⭐ `2b50` / ✨ `2728` / 🎨 `1f3a8` / 🎯 `1f3af` / 🎲 `1f3b2` /
  🏆 `1f3c6` / 🏷 `1f3f7` / 🐞 `1f41e` / 👋 `1f44b` / 💡 `1f4a1` / 📖 `1f4d6` /
  📚 `1f4da` / 🤔 `1f914` / 🩺 `1f9fa`. Those were generated 2026-05-22 via
  OpenAI Codex CLI (`gpt-image-2`).
- **5 icons generated** 2026-06-07 for neurons-only chrome glyphs via OpenAI
  Codex CLI (`gpt-image-2` / `$imagegen`), then post-processed locally with
  ImageMagick (chroma-key cream BG → resize 64×64 nearest-neighbor → 16-color
  quantize): 🧬 `1f9ec` (DNA helix) / 🧠 `1f9e0` (brain) / 🔗 `1f517` (chain
  link) / ⚔ `2694` (crossed swords) / 🔭 `1f52d` (telescope).
- **10 icons generated** 2026-06-10 for the HelpMenu chrome backfill
  (`pixelate-neurons-helpmenu-emoji`), same codex CLI formula + ImageMagick
  post-process: 🧭 `1f9ed` (compass) / ⌨ `2328` (keyboard) / 📋 `1f4cb`
  (clipboard) / 🌟 `1f31f` (glowing star) / 🔌 `1f50c` (electric plug) /
  💎 `1f48e` (gem stone) / 🐛 `1f41b` (bug) / 🏅 `1f3c5` (sports medal) /
  ❓ `2753` (question mark) / 🚀 `1f680` (rocket).
- **6 icons generated** 2026-07-05 for the homepage chrome backfill
  (`pixelate-neurons-homepage-emoji`), same codex CLI formula + ImageMagick
  post-process (corner-connected floodfill chroma-key → trim → point resize 60px
  → extent 64×64 → 16-color): 🩹 `1fa79` (adhesive bandage) / 🔍 `1f50d`
  (magnifying glass) / 🗓 `1f5d3` (spiral calendar) / 🔥 `1f525` (fire) /
  📅 `1f4c5` (tear-off calendar) / 🧫 `1f9eb` (petri dish). These cover the
  今日處方箋 / 錯題出征 / 神經元遠征隊 / focus-toast chrome glyphs that were
  still rendering as native system emoji.
- **3 icons added** 2026-07-05 (2nd homepage pass — family-card action buttons,
  hotkeys banner, 熄燈儀式): 🆕 `1f195` (new badge, generated via codex) plus
  🔄 `1f504` (refresh) and 🌙 `1f319` (crescent moon) **copied verbatim from the
  二階 pack** (same 2026-05-22 codex origin as the shared 16). The hotkeys-banner
  glyphs ⌨️ `2328` / ⭐ `2b50` / ✨ `2728` / 🤔 `1f914` / ❓ `2753` were already
  in the pack and just needed wiring.

## Style anchor (codex prompt formula)

> Classic Japanese RPG pixel art style — Pokemon Emerald, Fire Emblem GBA,
> Final Fantasy Tactics Advance aesthetic. Single object centered on plain solid
> pastel cream background (#fef5ce). Crisp dark outlines (1–2px), multi-tone cell
> shading with hard-edged transitions, 8–12 color palette per icon.

## Coverage

Only the emoji that neurons-tw chrome actually uses are shipped. Unmapped emoji
fall back to the native system glyph (graceful — see `EmojiIcon.tsx`); coverage
can grow by dropping a PNG here + adding a row to `src/lib/emoji-icons.ts` with
no other code change.

## License

Generated content; project license applies (engine AGPL-3.0, content pack
CC-BY-NC-4.0).
