# Design — rework-neurons-collection-gacha (Collection 2.0 Phase 2 spine)

## Context

Flip the neurons-tw collection from deterministic AP-threshold auto-unlock to a
study-gated gacha. This is the Phase-2 spine of the Collection 2.0 mini-milestone
(grilled 2026-06-02). It owns the mechanic + currency + pyramid + schema redesign;
later phases (3 fusion / 4 expedition rewards / 5 flavor / 6 art) build on it.

Worktree: `~/coding-scratch/study-rpg-neurons-gacha`, branch
`feat/neurons-collection-gacha` (Lane B of the parallel-lane SOP at
`openspec/decisions/2026-06-02-collection2-parallel-lane-serial-merge-sop.md`).
This run stops at the merge gate — pushes the branch, does **not** touch `main`.

## Decisions

### D1 — Variant identity keeps PK `[familyId, slotIndex]`; `slotIndex` range extends to 0–5

Dexie **cannot change a primary key in an upgrade** (`dexie_pk_change_pitfall.md`:
"Not yet support for changing primary key"). So we do **not** rename to `variantId`.
Instead the existing composite PK `[familyId, slotIndex]` is retained and
`slotIndex` is reinterpreted as a **variant index 0–5** where:

| slotIndex | rarity (fixed) | source |
|---|---|---|
| 0 | P0 (apex, 1/family) | **new** — placeholder sprite this phase |
| 1 | P5 (commonest) | existing sprite, remapped |
| 2 | P4 | existing sprite |
| 3 | P3 | existing sprite |
| 4 | P2 | existing sprite |
| 5 | P1 (rarest of the legacy five) | existing sprite |

Rationale: existing personas run newcomer (slot 1, plainest) → 傳奇 apex (slot 5);
mapping plain→common (P5) and apex→rare (P1) preserves that gradient, and P0 is a
*new* mythic above the legacy apex. Phase 6 fills more variants per tier (extending
`slotIndex` past 5) to make the pyramid wide; this phase ships 1 variant per tier
(degenerate pyramid — the **shape** comes from the rarity *weights*, the **width**
from Phase 6). No PK change → no `DatabaseClosedError` risk.

### D2 — Per-family pull (not a global banner)

The player selects a **family/subject** and spends currency to pull within it.
Rationale: preserves the family-centric collection + connectome structure, matches
"study a subject → collect that subject's neurons", and keeps per-family P0 pity
natural. (Alternative: one global banner — simpler but severs the subject link and
complicates per-family P0 pity. Rejected.) **→ GATE-1 confirm item.**

### D3 — Pull algorithm

```
pull(familyId):
  require balance >= PULL_COST           # else UI disables the button
  require family not fully collected      # else UI shows 全收集 + disables
  spend PULL_COST (neuralEnergySpent += COST)
  pullCount[familyId] += 1                # P0 pity clock (monotonic)
  rarity = rollRarityWithP0Pity(familyId, pullCount[familyId])
  target = a catalog variant of (familyId, rarity)   # 1 per tier this phase
  if target already owned:
     copies += 1                          # DUPE — Phase 3 fusion consumes
  else:
     persist new neuronVariants row (copies = 1, provenance stamped)
  reveal modal+toast
```

`rollRarityWithP0Pity`: effective P0 probability =
`clamp(P0_BASE + max(0, pullCount - P0_PITY_START) * P0_PITY_RAMP, 0, 1)`; the
remaining mass is split across P1–P5 proportional to their base weights. If the
family's P0 is **already owned**, P0 weight = 0 (only one P0 exists per family).

### D4 — Dupes produce `copies` (the gacha must "bite")

With 1 variant/tier and *no* dupes, 6 pulls trivially complete a family and rarity/
pity become cosmetic. The grill's P0-chase + Phase-3 fusion (which *consumes* dupes)
require that **this phase produces dupes**. So a pull can return an owned variant →
`copies += 1`. Dupes have **no consumer yet** (Phase 3 adds fusion); a small
"× N" badge surfaces the count. `copies` makes `neuronVariants` rows mutable, so the
sync adapter gains a `copies` MAX-merge carve-out (D7).

### D5 — Currency: monotonic earned/spent pair (correct cross-device), balance derived

Currency is **not** stored as a single mutable balance (the meta sync adapter is
first-write-wins; a plain balance key would never propagate updates, and an LWW
envelope would discard a device's earns *and* spends on conflict). Instead two
**monotonic** meta counters:

- `neuralEnergyEarned` (+= on every faucet event)
- `neuralEnergySpent`  (+= PULL_COST on every pull)
- **balance = earned − spent** (derived at read, never persisted)

Both ride the existing `backfill/counters.ts` MAX-merge post-pass (same machinery as
`totalStudyMinutes`), which is monotonic-correct across devices. Known limitation:
concurrent *offline* earns under-count under MAX (not SUM) — acceptable for a spine +
single-device dogfood; documented, revisit if telemetry shows loss.

Faucet/cost (dogfood-tuned starting guesses, single source of truth in
`content-neurons-tw`): `CORRECT_ANSWER_ENERGY = 3`, `READING_MINUTE_ENERGY = 2`,
`PULL_COST = 20`.

### D6 — P0 soft-pity numbers (game design, not OE)

`P0_BASE_RATE = 0.007`, `P0_PITY_START = 40`, `P0_PITY_RAMP = 0.05` (≈ +5pp/pull
past 40 → effective ceiling ~pull 60). Per the grill P0-rate evaluation. All in
one content-pack constant block; dogfood-tune by editing only that block. Per-family
pity clock = `familyAccrual.pullCount` (monotonic; once that family's P0 is owned the
clock stops mattering).

### D7 — Sync (R2 `SCHEMA_VERSION` 8 → 9, additive + reader-tolerant)

- `neuronVariants` adapter: row identity `[familyId, slotIndex]` is **immutable for
  content** (rarity/displayName/spriteKey/provenance fixed at mint); on conflict keep
  the existing row but `copies = max(local, incoming)` and keep the earliest
  `rolledAt`. (MAX-merge carve-out, in the spirit of the project's `everWrong` /
  `dmnEventLog` monotonic discipline.) **DO NOT replace copies-MAX with LWW.**
- `familyAccrual` adapter: add `pullCount` to the MAX-merge field set (monotonic).
- Currency: `neuralEnergyEarned` / `neuralEnergySpent` added to `SYNCED_META_KEYS` +
  the `counters.ts` MAX-merge allowlist.
- `SCHEMA_VERSION` 8 → 9; `validateBundleMeta` already tolerates `> SCHEMA_VERSION`
  (logs + continues) and drops unknown adapter keys. v8 clients reading v9 drop the
  new meta keys; v9 reading v8 → currency keys absent → balance starts at 0; legacy
  variant rows in a v8 bundle (old slot-rarity shape) — irrelevant after the local
  full reset, and identity-immutable so they re-import harmlessly.
- Worker is bundle-opaque — **no Worker code change**.

### D8 — Full reset scope (v10 upgrade)

The v9→v10 `.upgrade()` callback:
1. `neuronVariants.clear()` (incompatible shape: slot range + fixed rarity + copies)
2. reset `familyAccrual` gacha fields: `unlockedSlots = []` (vestigial now),
   `pullCount = 0`
3. init currency: `neuralEnergyEarned = '0'`, `neuralEnergySpent = '0'`
**Preserved:** AP, synapses, mastery, questionHistory, bookmarks, achievements,
`totalStudyMinutes`, representativeVariants (stale entries treated as absent). Only
the *collection* resets — wiping study progress would be hostile and is not what
"collection reset" means. **→ GATE-1 confirm item.** No grandfather logic, no banner.

The `.stores('…')` for v10 is **identical to v9** (no structural index change — both
new fields are non-indexed); the only delta is the `.upgrade()` callback. Fixture
`db-v9-to-v10-migration.test.ts` seeds v9 with old-shape variants + AP + synapses,
opens at v10, and asserts: `neuronVariants` empty, currency = 0, AP/synapses intact.

### D9 — Connectome decoupling

`recordCorrectAnswer` keeps incrementing AP (display) and keeps the synapse co-fire
logic (`sameDayCorrect` / `firedToday` — independent of AP). It **stops** computing
`slotsCrossedByIncrement` and **stops** emitting `connectome.variantSlotUnlocked`,
and it **adds** `neuralEnergyEarned += CORRECT_ANSWER_ENERGY` inside the tx. The
`variantSlotUnlocked` event name + `slotsCrossedByIncrement`/`nextSlotThreshold`
helpers + the gacha subscriber are removed. The homepage family card drops the
next-slot-threshold line (AP + `🧬 X/6` chip remain).

### D10 — `rollGachaWithFloor` stays in core untouched

The new pull uses a neurons-local P0-pity roll (content-specific). Core's
`rollGachaWithFloor` / `rollGacha` / `loot.ts` API is **not** modified — leaving the
published `@study-rpg/core` contract stable (no CHANGELOG-breaking change). The
neurons floor-roll requirement is removed from the *neurons* spec, but core keeps the
helper for API stability + other consumers.

## Open questions resolved during grill (recorded for traceability)

- Currency shape → 1 generic token (not 4 NT-branch currencies) — grill F5 lean.
- Migration → full reset, no grandfather — grill F6.
- Dupe disposition → fusion is Phase 3; this phase only *produces* dupes — grill F7.
- P0 rate → ~0.7% base + soft pity from ~40 — grill P0 evaluation.

## GATE-1 confirmation items (genuine product choices)

1. **Pull scope** — per-family pull (D2). Alternative: single global banner.
2. **Reset scope** — wipe collection only, preserve study progress (D8).
   Alternative: nuke everything ("FULL RESET" read literally).
3. **Rarity→slot mapping** — slot1→P5 … slot5→P1 + new P0 (D1).

If any differ from intent, say so at the gate — the apply hasn't started.

## Risks / follow-ups (deferred, tracked)

- **P0 leaderboard/achievement wiring** (cross-track Worker regex `P[1-4]→P[0-4]` +
  D1 column + achievement validator). This phase **excludes P0 from `badges_csv`** to
  stay within the current regex. Follow-up change required before P0 can appear on
  the leaderboard.
- **Currency OE theming** — name/metaphor anchored to a real neuro substrate (run
  `/oe`). Provisional name: 神經能量 / neural energy.
- **Reward-balance / power-creep** (Phase 4) — permanent passive accelerators feed
  the P0 pity; scarcity-only with no hard cap is the residual risk (grill F3).
- **Dupe MAX-merge undercount** — once Phase 3 makes copies economically valuable,
  revisit whether copies needs a per-device counter instead of MAX.
- **Real P0 sprite art** — placeholder this phase; Phase 6 batch.
