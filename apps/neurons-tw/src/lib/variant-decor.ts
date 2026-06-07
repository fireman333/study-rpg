/**
 * Pure helper: NeuronVariantRow → context-art descriptor (Pikmin Bloom step 3,
 * "帽子=出身"). Two neuro-themed channels, both display-only, zero new persisted
 * state. Sibling of `variant-caption.ts` (text channel).
 *
 * 1. DECOR (provenance booleans) — small flat neurophysiology symbol badges
 *    pinned to a fixed corner (uniform size, never over the soma):
 *      救贖    wasRedemption                       → decor:redemption (動作電位 spike — re-firing / LTP)
 *      里程碑  streakAtMint >= MILESTONE_STREAK_…   → decor:milestone  (髓鞘節點 myelin / saltatory) — stacks with 救贖
 *      元老    provenance === undefined            → decor:elder      (Cajal 祖細胞) — exclusive
 *      標準    has provenance, none of the above     → no decor badge
 *
 * 2. BAND (birth time-of-day) — the variant's birth HOUR maps to the EEG band
 *    that dominates that circadian epoch. Hour is read from `rolledAt` in a FIXED
 *    timezone (Asia/Taipei) so every device computes the same band (rolledAt is an
 *    absolute epoch; the tz is constant → cross-device deterministic). The band is
 *    drawn as a small EEG-waveform glyph whose shape encodes it.
 *
 * Band↔state mapping grounded on EEG canon (OpenEvidence 2026-06-02; NEJM Brown
 * 2010 NEJMra0808281; Constant & Sabourdin 2012, Pediatr Anesth):
 *   δ 0.5–4 Hz  deep NREM slow-wave sleep   (high amplitude, slow)
 *   θ 4–8 Hz    drowsiness / light sleep / REM
 *   α 8–13 Hz   relaxed wakefulness, eyes closed
 *   β 13–30 Hz  active, alert, focused cognition (low amplitude, fast)
 * Amplitude falls as frequency rises — the glyph mirrors this (δ few big humps …
 * β many tight low ones). The hour→epoch buckets are a circadian flavour hook.
 */

import { MILESTONE_STREAK_THRESHOLD, FAMILY_NT_BRANCH, type NtBranchId } from '@study-rpg/content-neurons-tw'
import type { NeuronVariantRow } from './db'
import { isSecondLapSlot, synapseLocationFor } from './maze/graph'

export type DecorKey = 'decor:redemption' | 'decor:milestone' | 'decor:elder'
export type BandKey = 'delta' | 'theta' | 'alpha' | 'beta'

export interface BandMeta {
  /** Short chip / tooltip label, e.g. `δ 深夜`. */
  label: string
  /** Greek band letter (the background watermark). */
  greek: string
  /** Wash + watermark hue. */
  color: string
  /** Canonical frequency range, for tooltips / docs. */
  hz: string
}

export const BAND_META: Record<BandKey, BandMeta> = {
  delta: { label: 'δ 深夜', greek: 'δ', color: '#5b6ee1', hz: '0.5–4 Hz' },
  beta: { label: 'β 上午', greek: 'β', color: '#d49a3f', hz: '13–30 Hz' },
  alpha: { label: 'α 午後', greek: 'α', color: '#3fa36b', hz: '8–13 Hz' },
  theta: { label: 'θ 夜晚', greek: 'θ', color: '#8e6bd4', hz: '4–8 Hz' },
}

export interface VariantContextArt {
  decor: DecorKey[]
  band: BandKey
  /**
   * The variant's NT branch, derived from its family (single source
   * `FAMILY_NT_BRANCH`). Drives per-branch decor texture selection at render;
   * null when the family is not in the map (composer falls back to the
   * universal texture). Per add-neurons-per-branch-decor.
   */
  branch: NtBranchId | null
}

/**
 * Birth hour-of-day (Asia/Taipei, fixed) → circadian EEG band. Cross-device
 * deterministic: `rolledAt` is absolute and the timezone is constant.
 *   00–06 深夜 → δ (deep-sleep epoch)   06–12 上午 → β (alert focus)
 *   12–18 午後 → α (relaxed)            18–24 夜晚 → θ (drowsy wind-down)
 */
export function brainwaveBand(rolledAt: number): BandKey {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    hour12: false,
  }).format(new Date(rolledAt))
  const hour = Number(hourStr) % 24 // some engines emit '24' for midnight
  if (hour < 6) return 'delta'
  if (hour < 12) return 'beta'
  if (hour < 18) return 'alpha'
  return 'theta'
}

/**
 * 二回目 location-variant art (add-neurons-maze-second-lap-variants /
 * neurons-variant-context-art). A second-lap location variant renders the
 * family's BASE sprite (slot 1) with a position-keyed hue/filter derived
 * deterministically from its learning-circuit location, so a second device renders
 * identically AND no new sprite asset ships. Returns null for first-route variants
 * (they render their own slot sprite). Coexists with the decor / band channels and
 * is distinct from the rarity channel.
 */
export interface LocationVariantArt {
  /** Base sprite key to render (the family's slot-1 base sprite, not the empty slot key). */
  baseSpriteKey: string
  /** Deterministic CSS filter (hue-rotate + saturate) keyed by (familyId, location). */
  filter: string
  /** The learning-circuit location name (中文), or null for a padded node. */
  location: string | null
}

/** Deterministic non-negative hash → hue degrees [0,360). Pure, device-stable. */
function hueFromString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  return h % 360
}

export function locationVariantArt(familyId: string, slotIndex: number): LocationVariantArt | null {
  if (!isSecondLapSlot(familyId, slotIndex)) return null
  const location = synapseLocationFor(familyId, slotIndex)
  const hue = hueFromString(`${familyId}|${location ?? String(slotIndex)}`)
  return {
    baseSpriteKey: `variant:${familyId}:1`,
    filter: `hue-rotate(${hue}deg) saturate(1.15)`,
    location,
  }
}

export function variantContextArt(row: NeuronVariantRow): VariantContextArt {
  const p = row.provenance
  const decor: DecorKey[] = []
  if (!p) {
    // 元老 / 傳承: no provenance → founding-neuron badge only (exclusive).
    decor.push('decor:elder')
  } else {
    // Push 里程碑 first so it leads the badge row when it stacks with 救贖.
    if (p.streakAtMint >= MILESTONE_STREAK_THRESHOLD) decor.push('decor:milestone')
    if (p.wasRedemption) decor.push('decor:redemption')
  }
  const branch = FAMILY_NT_BRANCH[row.familyId] ?? null
  return { decor, band: brainwaveBand(row.rolledAt), branch }
}
