## Context

`neuron-variant-gacha` shipped with all 55 `variant:<familyId>:<slotIndex>` keys mapped to the 1×1 transparent-PNG scaffold placeholder, and its own spec explicitly deferred real art to a follow-up. This change is that follow-up. It mirrors the archived `generate-neurons-sprites` change (which did the 11 family icons) end-to-end — same Gemini MCP → ImageMagick recipe, same `import.meta.glob` wiring, same `/tmp` two-stage pipeline.

**The one genuinely-new problem vs the sibling**: the sibling generated 1 sprite per family. This change generates **5 slots per family that must read as ONE neuron archetype evolving** (slot 1 newcomer / 初代 → slot 5 legendary apex / 傳奇), not 5 unrelated creatures. Coherence across a family's 5 slots — same neuron-type silhouette + NT color, with only stage/ornamentation escalating — is the core art-direction risk, and Gemini calls are independent (no built-in cross-call consistency), so coherence must be engineered into the prompts + verified with a QA/regen loop.

## Goals / Non-Goals

**Goals:**

- Ship 55 real GBA-era pixel-art variant sprites (11 families × 5 slots), 384×384, 16-color, transparent bg.
- Within each family, all 5 slots read as the SAME source-neuron archetype evolving (consistent silhouette + NT color; escalating grandeur slot 1→5) per the catalog persona names + blurbs.
- Across families, correct NT-branch color coding (DA gold / 5HT red / GABA blue / Glu green).
- Reproducible: all 55 prompts + regen procedure documented in `SPRITE_GENERATION.md`.
- `SPRITE_MAP` variant section flips from 55 placeholders to 55 real hashed-URL PNGs; everything else (terminal `variant:default` + items / cosmetics / skill / core) stays placeholder.

**Non-Goals:**

- **不** generate items (20) / cosmetics (20) / skill placeholders (36) / core scaffold sprites — neurons-tw exposes no page for them; separate future changes.
- **不**改 DMN fate-card art (already real).
- **不**補 `VariantUnlockToast` 元件 (spec line 347 gap — separate concern, out of scope).
- **不**做 animated sprites — static frames only.
- **不**改 gacha 機制 / 權重 / catalog 文字 / spriteKey 命名 / Dexie rows.
- **不**用 codex CLI (per `image_gen_routing.md`: medium-complexity collectibles → Gemini-first; codex per-call is also independent so wouldn't help coherence anyway, and is ~30× slower).

## Decisions

### Decision 1: Gemini MCP parallel generation, batched by family

**Choice**: 55 sprites via `mcp__gemini__gemini_generate_image`, fired in **11 batches of 5 (one batch per family)** rather than one 55-wide batch or 5 batches of 11.

**Why**:
- Per `image_gen_routing.md` Gemini-first for medium-complexity icons; sibling proved the Gemini→magick recipe.
- Batch-by-family makes within-family QA natural: review a family's 5 slots together, regen just that family if incoherent.
- 55 parallel calls risk free-tier rate limits; 5-wide batches are safe and still fast (~11 × ~10s ≈ a few min wallclock).
- Coherence comes from the **prompt** (shared base, see Decision 5), not batching — batching is purely a QA/rate-limit convenience.

**Alternative considered**: codex CLI (native pixel art) — rejected: ~2–4 min/sprite × 55 ≈ 2–3 hr, and per-call independence means it wouldn't improve slot coherence over Gemini.

### Decision 2: Post-process = the sibling's exact ImageMagick recipe (unchanged)

```bash
corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:)
magick "$src" -filter point -resize 384x384! +dither -colors 16 \
  -fuzz 10% -transparent "$corner" "PNG32:$out"
```

**Why**: identical to `generate-neurons-sprites` Decision 2 — already verified. Nearest-neighbor resize preserves pixel sharpness; 16-color quantize hits GBA palette; corner-pixel chroma-key strips Gemini's solid bg. Do NOT invent a new recipe.

### Decision 3: File layout `sprites/variants/<familyId>-<slotIndex>.png`

**Choice**: 55 files e.g. `藥理學-1.png` … `微生物學-5.png` under a new `packages/theme-pixel-neurons/sprites/variants/` subfolder. Chinese filename segment + numeric slot, joined by `-`.

**Why**:
- Mirrors `sprites/subjects/<subjectId>.png` (Chinese UTF-8 filenames) + `theme-pixel-hospital/sprites/doctor-內科-P3.png` precedent — proven on macOS + Linux + Vite.
- `<familyId>-<slotIndex>` → key `variant:<familyId>:<slotIndex>` is a trivial parse (split on the LAST `-`, since family IDs contain no `-`).
- Subfolder namespaces variants away from subjects/items/etc. for a cleanly-scoped glob.

### Decision 4: `import.meta.glob` with `?url` (mirror subjects wiring)

```ts
const variantSprites = import.meta.glob('../sprites/variants/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
```

Map each `<familyId>-<slotIndex>.png` → `variant:<familyId>:<slotIndex>` and spread into `SPRITE_MAP`, **replacing the 55 `TRANSPARENT_PIXEL` entries** in the variant section. Keep `variant:default` → `TRANSPARENT_PIXEL`. Identical mechanism to the subject glob already in `sprites.ts`.

**Why**: `?url` → Vite hashed URLs (cache-bust on rebuild), lazy-loaded via `<img>`, never inlined into the main bundle. `eager: true` avoids async import surprises at module init.

### Decision 5: Prompt = shared per-family base + per-slot stage modifier (the coherence engine)

**Choice**: For each family, author ONE base prompt fragment (neuron-type silhouette + NT color + house style), then append a per-slot stage modifier. 55 prompts = 11 bases × 5 stage modifiers.

Base fragment (per family) template:
```
GBA-era pixel art neuron creature sprite, 384×384 centered, transparent-ready
solid white background, flat shading, 16-color limited palette, Pokemon Gen-1 +
Stardew Valley creature aesthetic. Same character across all 5 frames: a
<neuron-type, e.g. cerebellar Purkinje> neuron with cute round face and a body
silhouette echoing the real <morphology, e.g. elaborate planar dendritic-tree fan>.
Primary color <NT-branch hex>. No text, no watermark, single creature centered.
```

Per-slot stage modifier (uniform across all families):
```
slot 1 (初代 newcomer): smaller, plain, slightly unsure expression, minimal accessory.
slot 2 (學徒): a little larger, one simple tool of the persona.
slot 3 (中階): confident pose, persona accessory clearly featured.
slot 4 (大師 master): ornate, glowing accents, commanding posture.
slot 5 (傳奇 legendary apex): radiant aura / particle accents, regal/mythic, most
elaborate version of the SAME silhouette — unmistakably the grown-up of slot 1.
```

Persona accessory per slot drawn from the catalog `displayName` + `description` (e.g. 生物化學 Mathematician → abacus→chalkboard→equation halo; 病理學 Judge → gavel; 生理學 CEO → tie→briefcase→corner-office crown).

**Why**:
- A shared base fragment forces the same silhouette + color across a family's 5 slots → coherence.
- A uniform stage ladder gives a consistent "newcomer→apex" reading across ALL families (player learns slot 5 = best at a glance).
- Catalog-driven accessories keep each slot's identity tied to its persona name (already neuroscience-anchored per `wire-neurons-content-and-theme`).

**Alternative considered**: 55 independent bespoke prompts — rejected: maximizes variety but loses the "one archetype evolving" reading the catalog narrative requires.

### Decision 6: `/tmp` two-stage pipeline (mirror sibling)

Gemini saves raw 1024×1024 → `/tmp/neurons-variant-sprites-raw/<familyId>-<slotIndex>.png`; magick post-processes → final `sprites/variants/`. Raw files stay inspectable for per-sprite prompt tuning + regen.

## Risks / Trade-offs

- **[Within-family slots come out incoherent — 5 different-looking creatures]** (the main risk) → shared base fragment (Decision 5) + batch-by-family QA (Decision 1). Foreground human review per family; regen just the incoherent family with a tightened silhouette anchor. Expect a 2nd pass for ~1–3 families. → 接受
- **[Cross-family style drift — 11 families don't share house style]** → uniform house-style clause + stage ladder in every prompt. → 接受
- **[Gemini content-safety on medical terms (解剖學 / 病理學 / 寄生蟲)]** → per `image_gen_routing.md`, Gemini usually draws medical creatures fine (unlike codex gate); if a prompt is refused, reword to the creature/persona framing without clinical nouns + retry. → 接受
- **[Gemini free-tier rate limit on batches]** → 5-wide batches with brief spacing; fall back to serial if throttled. Wall-time impact minor. → 接受
- **[Bundle grows ~1.6 MB from 55 PNGs]** → hashed URLs, lazy `<img>` load, not in main bundle; only fetched when a variant renders. → 接受
- **[Chinese filenames]** → proven by subjects/ + hospital doctor sprites on macOS/Linux/Vite. Windows not a target. → 接受

## Migration Plan

Pure asset addition + 1 file edit (`sprites.ts`) + 1 doc edit. Steps:

1. Verify Gemini MCP loadable; `mkdir -p packages/theme-pixel-neurons/sprites/variants /tmp/neurons-variant-sprites-raw`.
2. Author 11 base fragments + reuse the 5 stage modifiers; assemble 55 prompts from `NEURON_VARIANT_CATALOG`.
3. Generate per family (11 batches × 5) → raw to `/tmp/…`.
4. Post-process each raw via magick (Decision 2) → `sprites/variants/<familyId>-<slot>.png`.
5. Foreground QA per family (5 slots coherent? silhouette consistent? slot 1→5 escalates?); regen incoherent families.
6. Verify 55 final files exist, each 384×384, ≤50 KB, transparent.
7. Edit `sprites.ts`: add `variantSprites` glob; replace the 55 `TRANSPARENT_PIXEL` variant entries with resolved URLs; keep `variant:default` placeholder.
8. Extend `SPRITE_GENERATION.md` with 55 prompts + regen procedure.
9. typecheck both `@study-rpg/theme-pixel-neurons` + `@study-rpg/neurons-tw`.
10. Dev smoke: unlock a variant / open `/connectome` → real sprite renders in `VariantUnlockModal` + `FamilyPicker` (no blank box).
11. `openspec validate generate-neuron-variant-sprites --strict`.
12. `/verify` (user-driven) → `/opsx:archive`.

**Rollback**: `git rm packages/theme-pixel-neurons/sprites/variants/*.png` + revert `sprites.ts` variant section to the `TRANSPARENT_PIXEL` spread. Spec MODIFIED reverts cleanly (placeholder was the prior contract).

## Open Questions

- **Stage-ladder labels in the prompt — Chinese or English?** Proposal: English stage descriptors in prompt (Gemini handles English better); the Chinese persona names inform accessories only.
- **Generate 1024 native then quantize to 384, or 384 native?** Proposal: 1024 → quantize 384 (sibling Decision — higher detail survives the downsample).
- **How aggressive should the slot-5 "legendary" treatment be?** Proposal: radiant aura + particle accents but SAME silhouette; if it reads as a different creature, dial back ornamentation. Resolve during family QA.
- **If a whole family's archetype reads poorly (e.g. abstract types like 公共衛生學 / 生物化學), do we anchor harder on morphology or on persona?** Proposal: anchor on the neuron-type morphology silhouette first (scientific fidelity per project rule), persona accessory second. Revisit per family at QA.
