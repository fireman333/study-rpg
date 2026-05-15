import type { Rarity } from '@study-rpg/content-medexam2-tw'

/**
 * 3-tier fallback per recruitment-gacha spec:
 *   doctor-<subjectId>-<rarity> → doctor-default-<rarity> → doctor-default-P3
 *
 * Returns undefined if even the ultimate fallback is missing — caller decides
 * whether to render emoji placeholder or nothing.
 */
export function lookupSprite(
  spriteKey: string,
  spritesMap: Record<string, string>,
  rarity: Rarity,
): string | undefined {
  return spritesMap[spriteKey] ?? spritesMap[`doctor-default-${rarity}`] ?? spritesMap['doctor-default-P3']
}
