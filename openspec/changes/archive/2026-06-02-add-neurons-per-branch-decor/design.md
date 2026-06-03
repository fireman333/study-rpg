## Context

`neurons-variant-context-art` (shipped 2026-06-02) renders a variant's birth-context as faint full-bleed textures behind the neuron. The **decor** channel currently has 3 universal textures (`decor:redemption` / `decor:milestone` / `decor:elder`) shared by all 11 families. We want them flavoured per NT branch (DA / 5HT / GABA / Glu) so lineage reads visually alongside provenance.

Current pieces:
- `variant-decor.ts` — pure `variantContextArt(row): { decor: DecorKey[]; band: BandKey }`. Decor types derived from `provenance` booleans; band from `rolledAt`. Unit-tested without DB.
- `VariantSprite.tsx` — composer; renders each decor key as `SPRITE_MAP[key]` faint background `<img>` behind the neuron.
- `theme-pixel-neurons/src/sprites.ts` — globs `sprites/decor/*.png` → `decor:<stem>`; `DECOR_KEYS` (3) get a `TRANSPARENT_PIXEL` fallback in `SPRITE_MAP`.
- Canonical family→branch lives **build-time only** in `content-neurons-tw/scripts/build.ts` `FAMILY_BY_SUBJECT[*].ntBranch` (`'DA'|'5HT'|'GABA'|'Glu'`). The app's `NtBranch` type is a separate parallel literal in `apps/neurons-tw/.../connectome/layout.ts`.

## Goals / Non-Goals

**Goals:**
- Decor textures vary by the variant's NT branch, with a clean fallback to the existing universal texture so we can ship code before all 9 branch textures exist.
- Branch derivation is pure + cross-device deterministic (single exported `familyId → branch` map; no doc/code drift per coding §6).
- Zero schema/sync change; band + rarity + connectome untouched; background-watermark model preserved (no foreground badges, no colour wash).

**Non-Goals:**
- No change to the brain-wave band channel, rarity channel, or connectome SVG.
- No unification of the app's `connectome/layout.ts` `NtBranch` with the new content-pack branch type (they stay parallel identical unions; unifying is out of scope).
- No Dexie/R2 version bump, no new sync adapter.

## Decisions

### D1 — Helper returns `branch`; composer resolves the per-branch key (not the helper)
`variantContextArt(row)` keeps returning the same universal `decor: DecorKey[]` (so existing decor scenarios/tests pass verbatim) and **adds** `branch: NtBranchId | null` derived from `row.familyId`. `VariantSprite.tsx` builds the per-branch sprite key and resolves it with fallback.
- **Why**: keeps the provenance→type mapping requirement untouched, isolates the branch concern, and the branch derivation is still unit-tested in `variant-decor.test.ts` (the helper owns it).
- **Alternative rejected**: helper returns branch-specific keys directly → breaks every existing scenario asserting `decor:redemption` and couples the pure helper to sprite-key strings.

### D2 — Single exported `FAMILY_NT_BRANCH` in the content pack; build script consumes it
Add `packages/content-neurons-tw/src/families.ts` exporting `export type NtBranchId = 'DA'|'5HT'|'GABA'|'Glu'` and `export const FAMILY_NT_BRANCH: Record<string, NtBranchId>` (the 11-family table). Refactor `scripts/build.ts` `FAMILY_BY_SUBJECT` so its `ntBranch` field derives from `FAMILY_NT_BRANCH` (single source). `variant-decor.ts` imports `FAMILY_NT_BRANCH` from `@study-rpg/content-neurons-tw` (it already imports `MILESTONE_STREAK_THRESHOLD` from there — no new dep, no cycle: the content pack never imports the app).
- **Why**: coding §6 — one canonical enum source; build output and runtime helper agree by construction.
- **Alternative rejected**: hard-code the 11-family map inside `variant-decor.ts` → guaranteed drift the next time a family/branch changes.
- **Unknown-family fallback**: if `FAMILY_NT_BRANCH[row.familyId]` is undefined (defensive), `branch = null` → composer uses the universal texture.

### D3 — Per-branch key shape `decor:<type>:<branch-lowercase>`; resolver owns the fallback chain
Key = `decor:redemption:da`, `decor:milestone:5ht`, etc. (`branch.toLowerCase()` → `da/5ht/gaba/glu`, matching the existing `branch:da` sprite-key precedent in `sprites.ts`/`BranchRoot.tsx`). Add an exported resolver `decorSpriteUrl(universalKey: string, branch: string | null): string` in `sprites.ts` that returns: per-branch real asset if present → else universal real asset if present → else `TRANSPARENT_PIXEL`. `VariantSprite` calls this instead of indexing `SPRITE_MAP` directly for decor.
- **Why**: `TRANSPARENT_PIXEL` and "is this a real file?" knowledge stays inside the theme pack (it owns the glob + placeholder). The composer stays dumb. The resolver accepts `string | null` for branch to avoid a theme→content type dependency.
- `DECOR_KEYS` is generated programmatically (3 universal + 3×4 per-branch = 15) so every key has a defensive `SPRITE_MAP` entry too.

### D4 — Assets: 9 branch-tinted textures, Gemini-first, deferrable
4 branches × 3 types − reuse the 3 current universals as the per-branch-miss fallback = up to 9 new `sprites/decor/*.png`. Branch tint anchored on `NT_BRANCH_COLOR` (DA `#a05bd4`-ish / 5HT `#c44d4d` / GABA `#6a9bc4` / Glu `#6a8c3f`), same firing-field / myelin-field / Cajal-plate motifs, 384×384, 16-color, transparent bg, faint. Per `image_gen_routing.md` Gemini-first. The fallback chain (D3) means **code ships green before any branch texture exists** — asset generation is a clearly-marked, individually-droppable task.

## Risks / Trade-offs

- **Branch tint reads as a colour wash / rainbow grid** → keep tint subtle, opacity unchanged (0.07–0.11), and dogfood visually via Chrome MCP before declaring done; the band letter stays the only saturated accent.
- **`FAMILY_NT_BRANCH` ↔ build.ts drift** → eliminated by D2 (build derives from the export). A test asserts all 11 families resolve.
- **Split subjects (微生物學 / 免疫學)** must both be in the map → 免疫學→GABA, 微生物學→Glu; covered by the all-11 test.
- **Theme→content type coupling** avoided by D3 (resolver takes `string | null`).

## Migration Plan

Pure render change — no data migration. Rollback = revert the change. Branch textures can land incrementally (fallback to universal until each file exists); shipping with 0 new textures is visually identical to today.
