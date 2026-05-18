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

/**
 * The two ER doctor sprite keys (male / female). Used by `rollNewERConsult`
 * to randomly pick a gender at spawn time. Keys MUST match the `doctor-*.png`
 * glob convention used by `packages/theme-pixel-hospital/src/sprites.ts`.
 */
export const ER_DOCTOR_SPRITE_KEYS = ['doctor-er-doctor', 'doctor-er-doctor-female'] as const
export type ERDoctorSpriteKey = typeof ER_DOCTOR_SPRITE_KEYS[number]

/**
 * Look up an ER consultation doctor sprite by key, with fallback chain.
 * Falls through to `doctor-default-P2` when a dedicated sprite is missing
 * (e.g. male sprite not yet generated).
 */
export function lookupERDoctorSprite(
  spritesMap: Record<string, string>,
  key: ERDoctorSpriteKey | string = 'doctor-er-doctor',
): string | undefined {
  return spritesMap[key] ?? spritesMap['doctor-default-P2'] ?? spritesMap['doctor-default-P3']
}
