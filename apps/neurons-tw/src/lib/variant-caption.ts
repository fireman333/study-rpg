/**
 * Pure helper: NeuronVariantRow → single-line birth caption (Pikmin Bloom
 * "the collectible carries the context of the habit that grew it").
 *
 * Display-only. Four forms (design D4 of add-neurons-variant-provenance):
 *   standard        — `2026-06-01 · 答對 10 題藥理學時放電誕生`
 *   救贖            — `2026-06-01 · 攻下一題曾錯的藥理學時放電誕生`
 *   里程碑          — `2026-06-01 · 連續 7 天 · 答對 80 題藥理學時放電誕生`
 *   元老 (no prov.) — `2026-05-25 · 藥理學 · 傳承個體`
 *
 * 救贖 and 里程碑 combine inline: a milestone redemption reads
 *   `2026-06-01 · 連續 7 天 · 攻下一題曾錯的藥理學時放電誕生`.
 * Copy is tunable; locked at the /verify visual pass.
 */

import { MILESTONE_STREAK_THRESHOLD } from '@study-rpg/content-neurons-tw'
import type { NeuronVariantRow } from './db'

export function variantBirthCaption(row: NeuronVariantRow): string {
  const p = row.provenance
  // 元老 / 傳承: pre-upgrade row with no provenance. Derive the date from the
  // existing rolledAt epoch + subject from familyId; no special tags.
  if (!p) {
    const date = new Date(row.rolledAt).toLocaleDateString('en-CA')
    return `${date} · ${row.familyId} · 傳承個體`
  }
  // Body: 救贖 phrasing when the triggering question had been wrong before;
  // else the standard "答對 N 題該科" form (N = slot threshold = apAtUnlock).
  const body = p.wasRedemption
    ? `攻下一題曾錯的${row.familyId}時放電誕生`
    : `答對 ${p.apAtUnlock} 題${row.familyId}時放電誕生`
  // 里程碑: streak ≥ threshold folds the streak inline ahead of the body
  // (composes with 救贖).
  const streakPrefix =
    p.streakAtMint >= MILESTONE_STREAK_THRESHOLD ? `連續 ${p.streakAtMint} 天 · ` : ''
  return `${p.bornAtISO} · ${streakPrefix}${body}`
}
