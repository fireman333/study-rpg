## Why

The neurons progression roadmap (`openspec/decisions/2026-06-04-neurons-progression-systems-roadmap.md`, PIVOT) collapses two parked phases — P2 (DMN → consumable supplies) and P3 (permanent equipment / companion) — into one coherent **加速系統 (acceleration system)**: a single "巷子" of speed·energy boosts with **two persistence forms** (transient consumable vs durable permanent). Doing them together prevents the overlap the roadmap diagnosed (a DMN buff and a permanent companion both silently "accelerating") and lets one boost-composition + hard-cap contract govern both forms. It also removes the last anti-learning crutch (`streak-shield`) for integrity.

## What Changes

- **New acceleration boost layer** over the maze neural-energy economy: an additive `1 + Σbonus` pool (hard-capped) for **energy faucet** gain and **exploration speed**, composed onto the existing multiplicative faucet (`streak × mastery`).
- **DMN deck becomes the single acquisition channel for both forms** (per owner decision): each draw yields either a **consumable** (common) or, at **low probability**, a **permanent equipment/companion** (rare). No dupe-fusion / achievement-reward path — keeps the achievements reward union untouched.
- **Consumables → backpack (inventory), manual-activate.** All DMN effects stop auto-firing on draw; the player chooses when to spend them. `family-buff` is **kept and reframed** as the base consumable energy boost (it is already a maze-energy ×2; this change moves it into the backpack).
- **Permanent equipment/companions**: independent following-sprite passives (NOT body-worn — avoids the medexam sprite-alignment landmine), OE-anchored as structural/homeostatic infrastructure (oligodendrocyte myelin → durable speed; Na⁺/K⁺-ATPase pump → energy endurance).
- **BREAKING (gameplay): `streak-shield` removed entirely** (integrity — the only mechanic that lets a player dodge an honest streak break). Collected `streak-shield` cards leave the closed-cap dex; the closed-cap count recomputes.
- **Cognitive kinds evaluated for conversion** (owner ask): `quick-review-batch` / `variant-rate-up` / `hidden-reveal` assessed for equipment/companion conversion — see design Decision 4 (recommendation: keep as consumables; permanents are new myelin/pump-themed items).
- **Schema**: Dexie **v16** (new `inventory` + `equipment` tables) + R2 neurons bundle **SCHEMA_VERSION 16** (additive + reader tolerance; coordinated — first-pull took 15, quiz-modes-srs took Dexie v15). No primary-key change; ships a v15→v16 upgrade fixture.

## Capabilities

### New Capabilities
- `neurons-acceleration-system`: the boost-composition contract (additive `1 + Σ` energy + speed pools, hard cap + pacing), the consumable **backpack/inventory** (stackable, manual-activate, one-shot or time-limited), and the **permanent equipment/companion** definitions + passive application.

### Modified Capabilities
- `neurons-dmn-fate-cards`: draw outcome now branches to consumable (→ backpack, manual-activate) **or** low-probability permanent equipment/companion; `streak-shield` kind removed; `family-buff` reframed as a backpack consumable; closed-cap dex recomputed.
- `neurons-brain-maze`: the correct-answer energy faucet and exploration-speed/settle progression compose with the new additive acceleration multipliers under a hard cap (positive-feedback runaway guard).

## Impact

- **Code (neurons-tw only, `track-neurons`)**: `packages/content-neurons-tw/src/{dmn-types,dmn-cards,dmn-card-validator}.ts` (kinds, catalog, equipment defs); `apps/neurons-tw/src/lib/services/{dmn-*,connectome,streak,acceleration*}.ts`; `apps/neurons-tw/src/lib/db.ts` (Dexie v16); `apps/neurons-tw/src/lib/sync/{tables,r2/bundles}.ts` (new adapters + SCHEMA_VERSION 16); new `Backpack` + `Equipment` UI + DMN draw-result wiring; `theme-pixel-neurons` new equipment/companion sprites.
- **Schema/sync**: additive Dexie + R2 bump (coordinate version numbers with parallel sessions — bundle 16 / Dexie v16). No Supabase (neurons sync is R2-based).
- **Out of scope / untouched**: `neuron-variant-fusion`, `neurons-achievements` reward union, medexam-tw, 二階. No IAP/real-money path (rolls stay gameplay-triggered).
- **Assets**: new sprites required for permanent equipment/companions (and any new consumable kinds) — count + theme in design Decision 4 / Decision 7; generated via the established Gemini/codex pipeline as a follow-up if the owner approves the count.
