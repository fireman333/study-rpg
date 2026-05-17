/**
 * Fate-card pack art registry — maps fate card tier (`common` / `rare` / `epic`
 * / `legendary`) to a 192×256 (3:4 portrait) pixel-art "card-back" PNG. Used by
 * `FateCardPage` as the visual header above each tier's draw button.
 *
 * Generated via Gemini 2.5 Flash Image (nanobanana) MCP, post-processed with
 * `magick -fuzz 12% -transparent <corner> -trim +repage -filter point
 * -resize 192x256! +dither -colors 16` to match the GBA-era 16-color aesthetic
 * (2026-05-18 follow-up to `redesign-hospital-economy` §7).
 *
 * Uses Vite's `import.meta.glob` with `?url`. Returns `undefined` if any tier
 * is missing — caller gracefully degrades by hiding the card-back image.
 * Forks that ship fewer tiers SHALL omit `fateCardArt` from their theme pack
 * entirely.
 */

const fateCardArtModules = import.meta.glob(
  '../sprites/fate-cards/fate-card-{common,rare,epic,legendary}.png',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
) as Record<string, string>

function extractTierKey(path: string): string {
  const match = path.match(/\/fate-card-(common|rare|epic|legendary)\.png$/)
  return match ? match[1] : ''
}

const fateCardArtEntries = Object.entries(fateCardArtModules)
  .map(([path, url]) => [extractTierKey(path), url] as const)
  .filter(([key]) => key)

export const FATE_CARD_ART_MAP: Record<string, string> = Object.fromEntries(fateCardArtEntries)

export const FATE_CARD_ART:
  | { common: string; rare: string; epic: string; legendary: string }
  | undefined =
  FATE_CARD_ART_MAP.common &&
  FATE_CARD_ART_MAP.rare &&
  FATE_CARD_ART_MAP.epic &&
  FATE_CARD_ART_MAP.legendary
    ? {
        common: FATE_CARD_ART_MAP.common,
        rare: FATE_CARD_ART_MAP.rare,
        epic: FATE_CARD_ART_MAP.epic,
        legendary: FATE_CARD_ART_MAP.legendary,
      }
    : undefined
