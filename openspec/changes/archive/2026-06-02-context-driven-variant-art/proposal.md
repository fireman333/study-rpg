## Why

`add-neurons-variant-provenance` already gives every collected variant a one-line **birth caption** telling its study-context story (救贖 / 里程碑 / 元老 / 標準). But the caption is text — a player must read each card to learn its origin. Pikmin Bloom's signature is that a collectible's **decoration is its origin, readable at a glance** ("帽子=出身"). This change turns the same provenance into a glanceable visual layer so the Pokédex grid shows at a sweep which individuals were born in redemption, in a study streak, or are inherited 元老 — the glanceability the caption can't give. This is Pikmin Bloom step 3, building directly on the provenance shipped in step 1.

- Add a pure helper `variantContextArt(row)` that derives, **at render time**, a set of decor keys (from the stored `provenance`) plus a brain-wave band (from the variant's birth hour). Zero new persisted state.
- Add **3 universal full-bleed neuro-field background textures** (transparent-keyed PNGs) composited as **faint semi-transparent backdrops behind** the neuron — never as foreground overlays:
  - `decor:redemption` — action-potential **firing field** — `provenance.wasRedemption` (浴火重生 / LTP re-firing)
  - `decor:milestone` — **myelinated-axon field** (nodes of Ranvier) — `streakAtMint >= MILESTONE_STREAK_THRESHOLD` (saltatory milestone)
  - `decor:elder` — antique **Cajal histology plate** — `provenance === undefined` (元老 / 傳承)
  3 assets cover all 55 variants × every context — no per-context sprite explosion. 救贖 + 里程碑 stack; 元老 is exclusive.
- Add a **brain-wave band** dimension derived from the variant's birth **hour-of-day** (`rolledAt` read in a *fixed* Asia/Taipei timezone → cross-device deterministic) mapped to the EEG band dominant in that circadian epoch: **δ** 00–06 (deep-sleep hours) / **β** 06–12 (morning focus) / **α** 12–18 (afternoon) / **θ** 18–24 (evening). Rendered as a small colour-coded **δ/θ/α/β** Greek-letter corner watermark — the card's only colour accent (no full-cell colour wash, so the dex grid stays visually consistent). Band↔state mapping is OpenEvidence-grounded (NEJM Brown 2010; Constant 2012).
- Add a shared `<VariantSprite>` component that composes the faint context backdrop + the fully-visible neuron, used at every collected-variant render site.
- Wire context-art into **3 display points**: the `/collection` dex card, the `VariantUnlockModal` mint reveal, and the `/collection` family-section-header representative.
- **No Dexie `.version()` bump, no R2 bundle schema bump, no new sync adapter.** Everything derives purely from the existing `provenance` + `rolledAt` (already synced); a second device computes identical art with no extra plumbing.
- The context art sits entirely **behind** the neuron, so it never occludes the soma and there is no badge alignment to get wrong (design pivot after visual review — foreground corner badges crowded the sprite).
- The decor channel stays visually orthogonal to the rarity channel (P1–P5 colours / chip / reveal spin) so context never reads as rarity.

## Capabilities

### New Capabilities
- `neurons-variant-context-art`: render-time derivation of decor overlays + season tint from a variant's study-context provenance, and consistent composition of base + overlays + tint at every collected-variant render site.

### Modified Capabilities
<!-- None. Context-art composes additively onto the existing /collection dex card (neurons-variant-collection-view) and gacha unlock modal (neuron-variant-gacha) renders; their requirements (the card SHALL show sprite/name/rarity/caption; the unlock SHALL surface modal+toast) remain true. -->

## Impact

- **Code**: `packages/theme-pixel-neurons/src/sprites.ts` (register `sprites/decor/*.png` → 3 keys, mirror existing glob pattern + `?? TRANSPARENT_PIXEL` fallback). New `apps/neurons-tw/src/lib/variant-decor.ts` (pure helper: `variantContextArt` + `brainwaveBand` + `BAND_META` + types, mirror `lib/variant-caption.ts`). New `apps/neurons-tw/src/components/VariantSprite.tsx`. Edits to `routes/CollectionPage.tsx` (`VariantSlotCard` + family-section header), `components/VariantUnlockModal.tsx`.
- **Assets**: 3 new decor PNGs (`packages/theme-pixel-neurons/sprites/decor/`), 384×384 full-bleed neuro-field textures, 16-color transparent, via Gemini per `image_gen_routing.md`. The brain-wave band is rendered in code (Greek letter) → 0 band assets.
- **Dependency**: requires the `provenance` field shipped by `add-neurons-variant-provenance` (already on `track-neurons`, commit `5ff6532`). No new npm dependency.
- **Storage / sync**: none. No schema migration, no bundle bump, no adapter. (No Dexie `.version()` change → does not trigger the upgrade-fixture lint.)
- **Tests**: Vitest for `variantContextArt` / `brainwaveBand` (4 provenance shapes + stacking + elder + birth-hour→band incl. boundaries) + Chrome MCP visual pass at the render sites.
- **Out of scope (deferred)**: per-NT-branch flavoured decor (4 branches × 3 = 12 assets) — ship universal first, revisit with telemetry.
