## Context

Neurons has four progression lanes (roadmap `2026-06-04-neurons-progression-systems-roadmap.md`): **energy axis** (maze neural energy, shipped), **mastery axis** (`masteryEnergyMultiplier`, shipped), **equipment/companion** (parked), **DMN supplies** (in-flight). The PIVOT merges the last two into one **acceleration system** — a single lane of speed·energy boosts with two persistence forms (transient **consumable** vs durable **permanent**).

This builds on the just-shipped `realign-dmn-event-rewards-to-maze` state: `family-buff` is already a post-commit maze-energy `×FAMILY_BUFF_ENERGY_MULT` (=2, 1h) at `connectome.ts:231`; the faucet currently composes **multiplicatively**: `CORRECT_ENERGY × streakMultiplier × masteryMult × familyBuffMult`. The DMN deck is a 20-card closed-cap dex (P1×2 / P2×4 / P3×6 / P4×8; weights 2/10/30/58) of 5 event kinds.

OE-anchored neuroscience (queried 2026-06-04, crossref-validated) maps the two forms onto real biology:

| Form | Lane | Neuroscience | OE anchors (DOI) |
|---|---|---|---|
| **消耗品 consumable** (transient) | speed | phasic NE/DA arousal → gain modulation → faster processing (subsec–sec) | `10.1038/s41586-022-04782-2`; `10.1016/j.neuron.2012.09.011`; `10.1523/jneurosci.3475-15.2016` |
| | learning window | acute BDNF surge → transient LTP facilitation (~hours) | `10.1002/dneu.22592`; `10.1016/j.brainres.2014.10.019`; `10.3390/jcm9041136` |
| | energy | astrocyte–neuron lactate shuttle → acute on-demand energy substrate | `10.1038/nrn.2018.19`; `10.1073/pnas.2212004119` |
| **永久 permanent** (durable) | speed | oligodendrocyte myelin → durable conduction velocity (adaptive days–weeks) | `10.1002/glia.23665`; `10.1038/s41593-022-01169-4`; `10.1523/jneurosci.3185-16.2017` |
| | endurance | Na⁺/K⁺-ATPase pump → restores ion gradients = endurance, NOT speed | prior grill anchors |

The lactate OE answer independently confirms the pump is endurance-not-speed (ANLS is triggered by glutamate-uptake-driven astrocytic Na⁺/K⁺-ATPase but the pump restores gradients), reinforcing the guardrail that permanent-endurance ≠ permanent-speed.

## Goals

- One boost-composition contract (additive `1 + Σ`, hard-capped) governing both consumable and permanent forms, applied to the energy faucet + exploration speed.
- DMN draw as the **single** acquisition channel for both forms (no new fusion/achievement coupling).
- Remove `streak-shield` (integrity) without breaking sync or the closed-cap dex.
- Additive schema only (no pk change); coordinated version bumps; v15→v16 upgrade fixture.

## Non-Goals

- No change to `neuron-variant-fusion` or the `neurons-achievements` reward union.
- No IAP / real-money / ad-reward path (rolls stay gameplay-triggered).
- No medexam-tw / 二階 surface.
- No reading-timer rework (the expedition axis already feeds DMN draws).

## Decisions

### Decision 1 — DMN draw is the single acquisition channel (owner fork 1)

Each DMN draw first rolls a small **`EQUIPMENT_DRAW_RATE`** (starting **≈ 5 %**, dogfood-tunable — low enough to feel "機率更低" than getting a consumable, high enough to actually collect 10+ over a save) against the *unowned* permanent pool. If it hits and the pool is non-empty → roll an **equipment rarity P1–P5** by `EQUIPMENT_RARITY_WEIGHTS` (mirrors the variant-gacha P1–P5 shape) → award an unowned equipment of that tier (nearest-unowned fallback). Otherwise → roll a consumable card by the existing P1–P4 weights. When all permanents are owned, draws revert to consumables only.

- **Why over dupe-fusion / achievement** (my original recommendation, overridden): owner chose to keep one channel. This is simpler — no `neuron-variant-fusion` modification, no `neurons-achievements` reward-union unlock — and a low equipment draw rate matches the owner's "機率更低".
- Permanents are their **own P1–P5 collectible dex** (separate from the consumable dex), so the consumable closed-cap math is unaffected by equipment count.

### Decision 2 — Backpack / inventory (owner fork: stackable, no cap, tick-on-activation)

All consumable DMN effects stop auto-firing on draw. A drawn consumable lands in a **backpack** (`inventory` table: `kind → count`). The player **manually activates** from the backpack.

- **Stackable**, **no hard capacity cap**.
- **Time-limited** consumables (e.g., the reframed `family-buff` energy window) **tick from activation** (`activatedAt + durationMs`); the active-buff row drives client cleanup + the additive pool.
- **One-shot** consumables consume immediately on use.
- Existing `dmnActiveBuffs` table is reused/extended for activated time-limited buffs; the new `inventory` table holds *unspent* stock.

### Decision 3 — Permanent equipment/companion model: P1–P5 rarity collection of 10+ (owner Q2)

Permanents are **independent following sprites** (companion / pet / aura), **never body-worn** (avoids the medexam sprite-alignment landmine, owner-confirmed). Each is **owned once** (Q4 — fixed bonus, no levels in v1), contributing a **rarity-scaled** additive bonus to the energy and/or speed pool while owned.

- **Rarity-graded collection, ~12 items across P1–P5** (owner: "按照 5 個等級製作 10 個以上，P5 加成很差，P3 以上才有感"). Each item has a fixed `rarity ∈ P1–P5`, a `lane ∈ {speed, energy}`, and a `bonus` set by rarity:

  | Rarity | bonus (additive, dogfood-tunable) | feel |
  |---|---|---|
  | P1 | +0.30 | strong |
  | P2 | +0.18 | strong |
  | P3 | +0.10 | **有感 (noticeable)** |
  | P4 | +0.04 | minor |
  | P5 | +0.01 | negligible |

- **Two OE-anchored lanes** spread across the tiers (~6 each):
  - **Speed (myelin) lane** — oligodendrocyte / adaptive myelination / nodes of Ranvier (Nav1.6) / saltatory conduction. e.g. P5 single-wrap → P1 fully-myelinated fast-spiking aura.
  - **Energy (metabolic) lane** — Na⁺/K⁺-ATPase pump / mitochondria / astrocyte glycogen / lactate reserve (endurance, not speed). e.g. P5 trace-glucose → P1 mitochondrial powerhouse.
- Stored in a new `equipment` table (`equipmentId` PK, `rarity`, `obtainedAt`). All owned permanents sum (by `lane`) into the additive pool, then hard-capped (Decision 6). Catalog lives in `packages/content-neurons-tw/src/equipment-catalog.ts` with a build-time validator (≥ 2 items per rarity tier; every item has a valid lane + bonus matching its rarity).
- **Collectible dex** for equipment (P1–P5 grid, owned vs silhouette) — mirrors the variant/DMN dex pattern (Decision 8).

### Decision 4 — Cognitive-kinds conversion evaluation (owner fork 2 — "evaluate + flag sprites")

**Assessment of converting the 3 cognitive kinds → permanent equipment/companion:**

| Kind | Current effect | Convert to permanent? | Verdict |
|---|---|---|---|
| `family-buff` | maze-energy ×2, 1h | — (it's the base **consumable** energy boost) | **Keep as consumable** (reframe: acute neuromodulator surge) |
| `quick-review-batch` | clickable 5-Q expedition mini-batch | No — it's an **action** (replay/consolidation), not a passive speed/energy boost | **Keep as consumable** |
| `variant-rate-up` | one-shot boosted next-variant roll | No — it's **gacha-luck** in the variant lane, orthogonal to speed/energy; a *permanent* gacha-luck passive would be power-creep on collection | **Keep as consumable** |
| `hidden-reveal` | reveal next undrawn P1 silhouette | No — **collection-meta**, orthogonal to acceleration | **Keep as consumable** |

**Conclusion:** none of the three convert cleanly — each lives in a *different* lane (replay / gacha-luck / collection-meta), not the speed/energy acceleration lane. Forcing them into permanents would dilute the clean "consumable surge vs permanent infrastructure" neuroscience split. **Permanents are instead new myelin/pump-themed items (Decision 3).** The cognitive kinds simply move into the backpack as manual-activate consumables alongside `family-buff`.

**→ Sprite needs flagged for owner (Decision 7).**

### Decision 5 — `streak-shield` removal + `family-buff` reframe (locked)

- **`streak-shield` removed entirely** (integrity — only anti-learning crutch). Full footprint per roadmap §5: `dmn-types` union+kinds tuple; `dmn-cards` 4 entries; `dmn-event-dispatcher` case + `consumeStreakShield` + `META_STREAK_SHIELD`; `lib/services/streak.ts` consume site; `SYNCED_META_KEYS` `dmnStreakShieldAvailable`; `DmnDrawModal` + `HelpMenu` copy; idempotency test. Players with an armed shield silently lose it (no refund — it's an integrity removal).
- **`family-buff` kept**, reframed as the **base consumable energy boost** (already ×2 energy); moves into the backpack (manual-activate) instead of auto-firing.

### Decision 6 — Boost composition: additive `1 + Σ`, hard cap (owner fork 3)

Two additive pools, each hard-capped:

```
energyAccel = min(ENERGY_ACCEL_CAP, 1 + Σ(active consumable energyBonus) + Σ(owned permanent energyBonus))
speedAccel  = min(SPEED_ACCEL_CAP,  1 + Σ(active consumable speedBonus)  + Σ(owned permanent speedBonus))
```

- **Energy faucet** (connectome.ts:231) becomes `CORRECT_ENERGY × streakMultiplier × masteryMult × energyAccel`. The standalone `familyBuffMult` slot is **replaced** by `energyAccel` (family-buff's ×2 becomes a `+1.0` energy bonus inside the additive pool while active).
- **Exploration speed** (settle-cost / frontier progression) divides/scales by `speedAccel`.
- **Caps (dogfood-tunable, NOT OE-anchored):** `ENERGY_ACCEL_CAP ≈ 2.5`, `SPEED_ACCEL_CAP ≈ 2.0`. Additive-into-cap is the explicit guard against the positive-feedback runaway the grill flagged repeatedly (collection-count + streak + mastery + acceleration compounding).
- **Pacing:** because consumables are time-limited/one-shot and permanents are few + capped, peak acceleration is bounded; the cap is the hard ceiling, the consumable economy is the soft pacing.

### Decision 7 — Sprites (owner ask: "flag if extra sprites needed") → **YES, ~14 new**

- **Permanent equipment/companions (new): ~12** — the P1–P5 collection (Decision 3): ~6 speed/myelin-lane + ~6 energy/metabolic-lane, spread across the 5 tiers.
- **New consumable card arts (owner Q1 — add this change): 2** — a noradrenaline/dopamine **surge** (speed consumable) + a lactate **bolus** (energy consumable), both OE-anchored.
- **Total ≈ 14 new sprites**, generated via the established Gemini/codex pipeline (`image_gen_routing.md`). **This change ships placeholders** (1×1 transparent / registry stubs, mirroring the DMN/variant sprite pattern); real art is a separate `generate-acceleration-sprites` follow-up so the gameplay + schema ship without blocking on a ~14-sprite batch.

### Decision 8 — Schema, migration, closed-cap recompute

- **Dexie v16** (additive, no pk change): new `inventory` table (`kind` PK, `count`, manual state) + new `equipment` table (`equipmentId` PK, `obtainedAt`). Ships a **v15→v16 upgrade fixture** (dexie-fixture lint rule).
- **R2 neurons bundle `SCHEMA_VERSION` 15 → 16** (additive + reader-tolerance; v15 clients drop unknown adapter keys). New adapters: `inventory` (LWW per kind), `equipment` (monotonic-union — owning a permanent never un-owns). Coordinate the number with parallel sessions (first-pull took 15).
- **Backpack backfill:** none — accrues from v16 onward (grandfather pattern, mirrors wrong-answer-list). Existing collected consumable cards stay in the dex as collection record; they do **not** retroactively become backpack stock.
- **Closed-cap consumable dex recompute (Q1 = add surge/bolus this change):** removing `streak-shield` (4 cards) drops 20 → 16; adding 2 new kinds (`surge` speed + `bolus` energy) at ≥ 3 cards each (e.g., 3 each) → **22**. Surviving kinds (family-buff / variant-rate-up / quick-review-batch / hidden-reveal) keep their 4 each; validator still requires ≥ 3 cards/kind. Final per-tier weights re-balanced so P1–P4 still sum to 100.
- **Equipment dex (new, separate):** P1–P5 collectible grid of the ~12 permanents (owned vs silhouette), independent of the consumable closed-cap. Build-time validator: ≥ 2 items/tier, valid lane + rarity-matched bonus.

## Risks / Trade-offs

- **Positive-feedback runaway** (compounding speed/energy) — mitigated by additive-into-hard-cap (Decision 6); caps are dogfood-tuned.
- **streak-shield removal mid-flight** — a player mid-armed loses it silently; acceptable (integrity removal, no economic refund owed).
- **Sprite dependency** — placeholders ship first; real art gated on owner sprite approval.
- **Version-bump collision** — Dexie v16 / bundle 16 must be claimed before any parallel session bumps; coordinate via session-bus.
- **family-buff semantic move** — its ×2 becomes a `+1.0` additive bonus; verify the faucet math is equivalent when only family-buff is active (×2 ↔ energyAccel = 2.0 ≤ cap).

## Migration Plan

1. Land Dexie v16 + R2 SCHEMA_VERSION 16 (additive) with upgrade fixture + cross-version bundle tests.
2. Move DMN dispatch from auto-fire to backpack deposit; activation path reads backpack → active-buff → additive pool.
3. Remove streak-shield across the full footprint; recompute closed-cap.
4. Add permanent pool + low-prob draw branch + equipment passive application.
5. Ship placeholder sprites; queue `generate-acceleration-sprites` follow-up.

## Resolved (owner, propose gate 2026-06-04)

- **Q1 — Add `surge` + `bolus` consumable kinds THIS change** (consumable lane ≠ only family-buff). Consumable dex → 22.
- **Q2 — Equipment = P1–P5 rarity collection, ~12 items**, bonus scales by tier (P5 +0.01 negligible → P3 +0.10 有感 → P1 +0.30). Not 2–3 fixed items.
- **Q3 — Caps `ENERGY_ACCEL_CAP = 2.5` / `SPEED_ACCEL_CAP = 2.0`** (dogfood-tunable starting points).
- **Q4 — Equipment own-once, fixed bonus** (no upgrade ladder in v1).

## Still-open (non-blocking, resolve during apply / follow-up)

- Exact `EQUIPMENT_DRAW_RATE` + `EQUIPMENT_RARITY_WEIGHTS` numbers (telemetry-tuned; sensible starts in Decision 1).
- Final per-tier consumable card re-weighting after the dex grows to 22 (P1–P4 must still sum to 100).
- Real sprite art (~14) → `generate-acceleration-sprites` follow-up.
