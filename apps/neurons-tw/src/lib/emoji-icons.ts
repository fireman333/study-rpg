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
