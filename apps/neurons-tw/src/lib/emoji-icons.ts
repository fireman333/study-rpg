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
