## Context

Follow-up to `decouple-neurons-subjects-from-nt-branches` (committed `3077a9d`). 7 subjects got new card accents but their sprites still carry the old NT-branch tint (sprites were generated with the 4-color palette baked in). Owner reviewed and approved an in-place recolor of the existing art over a full regeneration.

## Goals / Non-Goals

**Goals:** the 7 new-color sprites' dominant tint matches their card accent; the approved morphology + persona accessory is preserved; zero code/schema change.

**Non-Goals:** the 4 anchor sprites (unchanged); regenerating new artwork from scratch; any items/cosmetics/other sprite categories.

## Decisions

### D1 — In-place `magick` hue-shift, not regeneration
Each of the 7 sprites is recolored by sampling its dominant hue, computing the rotation to the target accent hue, and applying `magick <src> -modulate 100,<satPct>,<hueVal> <out>` (saturation nudged toward the accent's saturation). This preserves the exact pixel art the owner approved and only shifts color — faster and higher-fidelity than Gemini/codex regen for a pure recolor. _Alternative rejected_: generative regen (different morphology, slower, quality variance). Hue-shift verified to land each output's dominant hue within ~4° of the target accent, owner-approved on a before/after swatch.

### D2 — Anchors untouched
解剖學 / 組織學 / 生物化學 / 藥理學 keep their NT-branch color → their sprites already match → not re-tinted.

### D3 — Spec reconciliation
The sprite requirement's color dimension (「NT branch color tint」) is updated to「per-subject accent tint」 to stay accurate after the decouple change. The 胚胎學 example scenario's「Glu-branch green tint」 → its new olive-yellow accent. The 生物化學 example keeps「GABA blue」 (it is an anchor, unchanged).

## Risks / Trade-offs

- **Hue-shift introduces stray colors on multi-color sprites** → owner-reviewed each on a before/after swatch and approved; large rotations (生理 +93° / 公衛 −91° / 病理 +62°) inspected specifically.
- **Concurrent maze session in the same worktree** → sprites live under `theme-pixel-neurons/sprites/subjects/` (not maze-owned); explicit per-file staging of only the 7 PNGs + the spec at commit.

## Migration Plan

1. Copy the 7 recolored PNGs over the originals.
2. `pnpm --filter @study-rpg/theme-pixel-neurons build` (if any) + app build; Chrome MCP confirm the 7 cards show accent ≈ sprite.
3. **Rollback**: `git checkout` the 7 PNGs (pure asset revert, no state).

## Open Questions

_None._ Owner approved the recolored sprites.
