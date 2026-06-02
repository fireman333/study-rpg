## Why

Today every collected variant's context-art **decor** layer (救贖 firing field / 里程碑 myelin field / 元老 Cajal plate) uses one of **3 universal textures** shared across all 11 families. A DA dopaminergic neuron's firing-field looks identical to a GABA interneuron's. Flavouring decor per NT branch makes the「帽子=出身」provenance read more strongly at a glance — a variant's birth context AND its neurotransmitter lineage both become visible — and is the next queued Pikmin-Bloom polish item the owner decided to do (item B of `openspec/decisions/2026-06-02-neurons-pikmin-next-session.md`).

## What Changes

- Decor key shape gains a branch dimension: `decor:<type>` → `decor:<type>:<branch>` (e.g. `decor:redemption:da`). The 4 NT branches are DA / 5HT / GABA / Glu.
- `variantContextArt(row)` keeps returning the same logical decor **types**, but the render composer resolves a **per-branch** sprite key derived from the variant's family, falling back to the existing universal `decor:<type>` key when the per-branch asset is absent (graceful, incremental ship).
- A runtime `familyId → NT-branch` map is extracted into the content pack and **exported** so the pure helper / composer can derive a variant's branch deterministically. The build script's existing branch column is refactored to consume this single source (no parallel hard-coded copy — coding principle §6).
- Up to 9 new branch-tinted neuro-field decor textures are added (4 branches × 3 types, reusing the 3 current universals as the fallback layer). Asset generation is a deferrable task — the fallback chain lets code ship before all textures exist.
- The **brain-wave band** channel, the **rarity** channel, and the connectome SVG are untouched.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-variant-context-art`: the decor-channel requirement is extended so decor textures are branch-flavoured (resolved per the variant's family→branch lineage) with a defined fallback to the universal texture; a new requirement covers deterministic family→branch derivation from a single exported source. Stacking/exclusivity, the band channel, the render-behind-the-neuron model, and graceful-degrade-on-missing-asset are unchanged.

## Impact

- **App** `apps/neurons-tw/src/lib/variant-decor.ts` (or the composer) — branch derivation; `apps/neurons-tw/src/components/VariantSprite.tsx` — per-branch key resolution with universal fallback.
- **Content pack** `packages/content-neurons-tw/src/` — new exported `FAMILY_NT_BRANCH` (+ branch literal type); `scripts/build.ts` refactored to derive `FAMILY_BY_SUBJECT.ntBranch` from it.
- **Theme pack** `packages/theme-pixel-neurons/src/sprites.ts` `DECOR_KEYS` list (programmatic 3×4 + 3 universal); `packages/theme-pixel-neurons/sprites/decor/*.png` (9 new branch-tinted textures).
- **Tests** `apps/neurons-tw/src/__tests__/variant-decor.test.ts` extended for branch dimension + universal fallback.
- **No** Dexie `.version()` bump, **no** R2 bundle `SCHEMA_VERSION` bump, **no** new sync adapter — decor stays a pure function of already-synced `provenance` + `familyId`.
