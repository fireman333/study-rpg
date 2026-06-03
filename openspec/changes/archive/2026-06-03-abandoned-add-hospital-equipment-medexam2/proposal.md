## Why

The 二階 hospital mode's revenue economy currently has a starved endgame: `gameCounters.revenue` accumulates aggressively past `醫學中心` (default config +167/min at `國家級教學醫院` per `hospital-finances` spec), but the existing sinks (facility upgrade caps at 1M for `roomFacility 3.0`, room extension caps per tier, doctor training, AAD retirement refund inverts the sink) all plateau by mid-game. The result: endgame players watch revenue tick up with nothing meaningful to spend it on while reputation remains the sole gate-keeping resource — both for tier progression and for 命運卡 draws.

This change introduces **hospital equipment** — capital-investment items (CT / MRI / 內視鏡 / 達文西 etc.) that consume large amounts of revenue in exchange for two passive multipliers: a forever bonus to reputation gain rate and a forever bonus to patient throughput. Equipment is the long-tail revenue sink that:

1. Stays meaningful into endgame (highest-tier equipment costs 10s of millions, hours of `國家級` net revenue per upgrade level)
2. Does NOT bypass the 命運卡 reputation cost gate (multiplier requires active play — purely AFK farming doesn't accelerate reputation)
3. Adds a third axis to T4 progression: the `醫學中心 → 國家級教學醫院` upgrade SHALL require 3 unique equipment installed (any level), preventing T4 players from coasting on reputation alone
4. Does not retroactively impact T2 / T3 players (gate is T4-only, equipment purchase is voluntary at lower tiers)

The image assets for the 10 equipment items are generated in the apply phase via Gemini (preferred per `~/.claude/imports/image_gen_routing.md` for simple icon-style sprites with chroma-key + 16-color quantize post-processing).

## What Changes

- **New `hospital-equipment` capability**: 10 equipment items (CT / MRI / 內視鏡 / 達文西 / 心導管室 / PET-CT / LINAC / ECMO / Hybrid OR / NGS sequencer), each with a 3-level upgrade ladder (L1 → L2 → L3) and locked revenue costs. Each level grants a flat additive bonus to (a) hospital-wide reputation gain rate multiplier and (b) hospital-wide patient throughput multiplier. Bonuses stack additively across all owned equipment levels.
- **Equipment purchase + upgrade SHALL be available at any hospital tier** (only constraint: sufficient `revenue`). New「設備」section on the Hospital page renders each equipment as a card with current level / next-level cost / installed-on date / passive bonus breakdown.
- **Reputation gain multiplier SHALL apply to every reputation accrual path** (quiz answer rewards, reading session reputation, mock exam rewards, mentor daily) — the multiplier modifies the rate, not the existing baseline formulas. AFK / idle gameplay alone does NOT generate reputation; multiplier requires active play to manifest.
- **Patient throughput multiplier SHALL apply to every assigned doctor's per-minute output**, multiplying together with existing factors (`baseRate × powerMultiplier × roomFacility × affinityBonus × equipmentMultiplier`). This is hospital-wide, not per-room.
- **MODIFY `clinic-level-up` capability** (two coordinated changes):
  1. **T4 equipment gate**: the `醫學中心 → 國家級教學醫院` upgrade gate SHALL add a new third condition: `≥ 3 unique equipment installed at any level`. The existing reputation gate, diversification gate, and requireP1 conditions remain unchanged in structure.
  2. **T4 reputation threshold bump**: `TIER_UPGRADE_THRESHOLDS.醫學中心` SHALL change from `150_000` to `300_000` (2× increase). The 150k value was set during `add-quiz-economy-redesign` (2026-05-18) for a 30-day full-clear; owner reports endgame arrives too fast. Math verification (2026-05-23): at typical play (~5,000 rep/day) the current 150k threshold is hit at day ~30; doubling to 300k pushes T4 to day ~60 (≈ 30 days extra endgame from 醫學中心 unlock at 80k). Higher targets (500k / 1M / 1.5M) were rejected — they push T4 to 100–270+ days, risking player attrition before reaching the endgame. The `診所 → 區域醫院` (30k) and `區域醫院 → 醫學中心` (80k) thresholds are NOT changed — players already crossed those gates at the lower values.
  3. Other tier upgrade gates (T1→T2, T2→T3) are NOT affected by either modification.
- **Backfill story**: existing saves at T1 / T2 / T3 are unaffected (equipment is opt-in; only the T4 reputation threshold and gate composition changed). Existing T4 saves are grandfathered — `gameCounters.tier === '國家級教學醫院'` players who upgraded BEFORE this change ships SHALL NOT lose their tier even if (a) they have 0 equipment installed or (b) they upgraded at the old 150k threshold. Tier monotonicity per `clinic-level-up` Requirement 1 guarantees this. T3 players in flight (saving toward T4) face both new conditions simultaneously.

## Capabilities

### New Capabilities

- `hospital-equipment` — equipment catalog, purchase / upgrade transactions, owned-equipment Dexie schema, multiplier calculation helpers, UI integration on Hospital page

### Modified Capabilities

- `clinic-level-up` — T4 upgrade gate gains an equipment requirement (3rd dual-gate becomes triple-gate); existing T1/T2/T3 gates unchanged

## Impact

**Client (medexam2-hospital-tw)**
- New: `apps/medexam2-hospital-tw/src/lib/equipment.ts` (catalog + multiplier helpers)
- New: `apps/medexam2-hospital-tw/src/services/equipment-purchase.ts` (Dexie transactions)
- New: `apps/medexam2-hospital-tw/src/components/EquipmentPanel.tsx` (Hospital page section)
- New: `apps/medexam2-hospital-tw/src/components/EquipmentCard.tsx` (per-equipment row)
- Edited: `apps/medexam2-hospital-tw/src/pages/Hospital.tsx` (mount EquipmentPanel)
- Edited: `apps/medexam2-hospital-tw/src/lib/tick.ts` (read equipment multipliers when computing throughput + reputation deltas)
- Edited: `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts` / `reading-rewards.ts` / `mentor.ts` / `mock-exam.ts` — apply equipment reputation multiplier
- Edited: `apps/medexam2-hospital-tw/src/db/schema.ts` — Dexie v16 bump (v15 claimed by `add-achievement-system` 2026-05-23): new table `hospitalEquipment` (one row per owned equipment with current level + installedAt + updatedAt) + migration step copying nothing (new feature, starts empty)
- New images: 10 equipment sprites (32×32 or 48×48 pixel-art, 16-color, GBA-era aesthetic) — generated via Gemini in apply phase

**Content (content-medexam2-tw)**
- New: `packages/content-medexam2-tw/src/equipment-catalog.ts` (the 10 equipment definitions with cost / multiplier values — `EQUIPMENT_CATALOG: EquipmentDef[]`)
- Edited: `packages/content-medexam2-tw/src/index.ts` — export the catalog

**Core (packages/core)**
- New: `packages/core/src/types.ts` — add `EquipmentId` union + `EquipmentDef` interface + `OwnedEquipment` row type
- The catalog content (specific equipment names / costs) stays in `content-medexam2-tw` per CLAUDE.md curator rule "medical terms belong in theme / content packs, never in core"

**Sync (R2 + Supabase)**
- The `m2-snapshot.json.gz` bundle SHALL include the new `hospitalEquipment` table; bundle schema_version bumps from 1 → 2 (additive — old clients read with empty array fallback)
- `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts` — extend `m2Bundle` snapshot to include `hospitalEquipment`
- Supabase mirror is NOT extended (M4.5 dual-write is migrating to R2-only; equipment data lives only in R2 bundle going forward)

**Specs**
- `openspec/specs/hospital-equipment/spec.md` (new file)
- `openspec/specs/clinic-level-up/spec.md` (T4 gate requirement modified)

**No-op zones**
- `add-r2-cloud-sync-migration` in-flight change — equipment lives inside m2 bundle which is part of the migration; schema_version bump (1 → 2) is forward-compatible. Coordinate apply order: equipment change MUST apply after R2 cutover (Phase 3+) to avoid Supabase dual-write attempts on a non-existent Supabase column.
- `add-hospital-leaderboard-correct-count-filter` in-flight change — leaderboard fields don't include equipment count or multiplier
- `add-abbreviated-tier-labels-medexam2` in-flight change — equipment UI uses `tierLabel()` for any tier name display
- `add-fate-card-equipment-donation-reward` (future change, NOT in this proposal) — fate cards may grant equipment as a lucky-event reward; depends on this change being applied first. Out of scope here.
