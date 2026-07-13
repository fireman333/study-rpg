// Pixel-art emoji icon lookup, ported from 二階 (medexam2-hospital-tw). Maps the
// inline chrome emoji neurons actually uses to 64×64 GBA-style pixel PNGs under
// public/icons/emoji/<codepoint>.png. Emoji not in the map fall back to native
// system glyphs (see EmojiIcon.tsx) — coverage can grow by adding a PNG + a row
// here with zero other code change.
const ICON_FILES: ReadonlyArray<readonly [string, string]> = [
  // Shared with 二階's pack (copied verbatim)
  ['☁', '2601.png'],
  ['⚡', '26a1.png'],
  ['⭐', '2b50.png'],
  ['✨', '2728.png'],
  ['🎨', '1f3a8.png'],
  ['🎯', '1f3af.png'],
  ['🎲', '1f3b2.png'],
  ['🏆', '1f3c6.png'],
  ['🏷', '1f3f7.png'],
  ['🐞', '1f41e.png'],
  ['👋', '1f44b.png'],
  ['💡', '1f4a1.png'],
  ['📖', '1f4d6.png'],
  ['📚', '1f4da.png'],
  ['🤔', '1f914.png'],
  ['🩺', '1f9fa.png'],
  // neurons-only (generated to match the pack style)
  ['⚔', '2694.png'],
  ['🔗', '1f517.png'],
  ['🔬', '1f52c.png'],
  ['🔭', '1f52d.png'],
  ['🧠', '1f9e0.png'],
  ['🧬', '1f9ec.png'],
  // HelpMenu chrome backfill (pixelate-neurons-helpmenu-emoji)
  ['⌨', '2328.png'],
  ['❓', '2753.png'],
  ['🌟', '1f31f.png'],
  ['🏅', '1f3c5.png'],
  ['🐛', '1f41b.png'],
  ['💎', '1f48e.png'],
  ['📋', '1f4cb.png'],
  ['🔌', '1f50c.png'],
  ['🚀', '1f680.png'],
  ['🧭', '1f9ed.png'],
  // Homepage chrome backfill (pixelate-neurons-homepage-emoji): 今日處方箋 /
  // 錯題出征 / 神經元遠征隊 / focus-toast glyphs that were still native.
  ['🩹', '1fa79.png'],
  ['🔍', '1f50d.png'],
  ['🗓', '1f5d3.png'],
  ['🔥', '1f525.png'],
  ['📅', '1f4c5.png'],
  ['🧫', '1f9eb.png'],
  // Family-card action buttons + hotkeys banner + 熄燈儀式 (2nd homepage pass).
  // 🔄 / 🌙 copied verbatim from the 二階 pack; 🆕 generated to match.
  ['🆕', '1f195.png'],
  ['🔄', '1f504.png'],
  ['🌙', '1f319.png'],
  // Error-cause modifiers (add-neurons-weakness-radar-and-error-repair): 👁 看錯.
  // 💡 觀念洞 reuses the existing 1f4a1.png row above.
  ['👁', '1f441.png'],
  // 置頂下次出征 CTA (refold-neurons-quick-review-into-expedition): 📌 pushpin,
  // generated to match the pack so the renamed pin CTA renders pixel-art.
  ['📌', '1f4cc.png'],
  // 考前中心 hub (add-neurons-exam-prep-hub): ⏱ 救急 / ✏ 練題 / ⏳ 五分鐘速看. Bare
  // codepoints (normalize() strips FE0F). Adding ⏱ also upgrades the homepage /
  // FamilyPicker / RescueScene ⏱ from native fallback to pixel-art (shared manifest).
  ['⏱', '23f1.png'],
  ['✏', '270f.png'],
  ['⏳', '23f3.png'],
  // HelpMenu 說明選單 backfill (fix reported raw emoji in HelpMenu): the 📄 原始詳解
  // PDF section icon + ♻ 重置帳號 section icon rendered as native glyphs next to
  // pixelated siblings; 🗺 一週攻略地圖 appears in the 考前講義 body. Bare codepoints
  // (normalize() strips FE0F). Generated via the same codex gpt-image-2 + ImageMagick
  // formula as the rest of the pack (see public/icons/emoji/CREDITS.md).
  ['📄', '1f4c4.png'],
  ['♻', '267b.png'],
  ['🗺', '1f5fa.png'],
  // Homepage 今日處方箋 backfill (2026-07-13): 🗂 依目前年份範圍穩定練習 range chip in
  // DailyPrescriptionCard was already wired through <EmojiIcon> but had no asset, so it
  // fell back to the native glyph. Same codex gpt-image-2 + ImageMagick formula.
  ['🗂', '1f5c2.png'],
  // 首頁 + 考前中心 backfill (2026-07-13): the 考前中心 tier chips (🌲 常青必掃 / ❄ 經典
  // 但降溫; ✨ 近年新寵 was already in the pack), homepage 💠 成熟印記, the 今日處方 tier
  // ladder (✅ 今日完成 / ⛰ 深度出征 / 🎉 完成慶祝) and 模擬考 📝 headers/CTAs still rendered
  // as native glyphs. Same codex gpt-image-2 + ImageMagick formula (see CREDITS.md).
  ['🌲', '1f332.png'],
  ['❄', '2744.png'],
  ['💠', '1f4a0.png'],
  ['✅', '2705.png'],
  ['⛰', '26f0.png'],
  ['🎉', '1f389.png'],
  ['📝', '1f4dd.png'],
]

const ICON_MAP = new Map(ICON_FILES)

function normalize(emoji: string): string {
  return emoji.replace(/️/g, '')
}

export function emojiIconUrl(emoji: string): string | null {
  const filename = ICON_MAP.get(normalize(emoji))
  return filename ? `${import.meta.env.BASE_URL}icons/emoji/${filename}` : null
}

export function hasEmojiIcon(emoji: string): boolean {
  return ICON_MAP.has(normalize(emoji))
}
