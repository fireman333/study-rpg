## Context

`add-neurons-variant-provenance` stamps each minted variant with `NeuronVariantProvenance = { bornAtISO, apAtUnlock, wasRedemption, streakAtMint }` and renders a text caption via `variantBirthCaption(row)` (`apps/neurons-tw/src/lib/variant-caption.ts`). Pre-upgrade rows have `provenance === undefined` (元老 / 傳承). Every row also carries `rolledAt` (absolute epoch ms). This change adds a **visual** channel on top of the same data — no new state.

Render sites that show a collected variant's sprite:
- `routes/CollectionPage.tsx` → `VariantSlotCard` (dex grid, 64px sprite in a 78px wrap)
- the `/collection` family-`<section>` header (mini representative sprite)
- `components/VariantUnlockModal.tsx` (mint reveal)

Sprites are 384×384 16-color transparent PNGs registered in `packages/theme-pixel-neurons/src/sprites.ts` via per-subfolder `import.meta.glob('../sprites/<dir>/*.png', { eager, query:'?url' })`, each key defaulting to `TRANSPARENT_PIXEL` when absent.

## Goals

- Origin readable at a glance from the dex grid, **without occluding the neuron and without per-badge alignment**.
- Bounded asset cost (3 textures, not 200+ per-context sprites).
- Zero schema / sync change — derive everything at render from synced `provenance` + `rolledAt`.
- Keep the **science-accurate base sprite untouched**; context art is a separate cosmetic channel.

## Decisions

### D1 — Background-watermark model (context art BEHIND the neuron)
All context art renders as faint, full-bleed, semi-transparent layers **behind** the neuron, which always paints on top at full opacity. Nothing overlaps the soma; there are no positioned foreground badges to align.

This is a **design pivot (2026-06-02)** made during the live verify pass. The first cut used foreground decor overlays (ornate crown/ember/frame), then iconographic corner badges + a top-left EEG glyph — both crowded the soma and had placement/alignment problems the owner flagged. The owner's direction: "做成半透明背景圖，比較不會有對齊問題" (make it a semi-transparent background — fewer alignment problems). The background-watermark model is the result.

### D2 — Decor = 3 full-bleed neuro-field textures, mapped from provenance
| Condition (on `row.provenance`) | Narrative | `decor` key | Texture |
|---|---|---|---|
| `provenance === undefined` | 元老 / 傳承 | `decor:elder` | antique Cajal histology plate (neuron field) |
| `provenance.wasRedemption === true` | 攻下曾錯題 = 浴火重生 | `decor:redemption` | action-potential firing field (LTP re-firing) |
| `provenance.streakAtMint >= MILESTONE_STREAK_THRESHOLD` (7) | 連續苦讀 = 堅持 | `decor:milestone` | myelinated-axon field (nodes of Ranvier / saltatory) |
| has provenance, none of the above | 平凡的一天 | (none) | plain |

- The textures are designed as **edge-to-edge background fields** (not centered icons), composited `objectFit: cover` at low opacity (**0.11 single / 0.07 each when stacked**) behind the neuron.
- **Stacking**: 救贖 + 里程碑 → both fields layered faint. **Exclusivity**: `decor:elder` requires absent provenance, so it never co-occurs with the other two.
- `MILESTONE_STREAK_THRESHOLD` is reused from `@study-rpg/content-neurons-tw` (same constant as `variant-caption.ts`) — single source of truth.

### D3 — Brain-wave band (replaces the abandoned season tint)
A 4-band dimension derived from the variant's birth **hour-of-day**. `rolledAt` is read in a **fixed Asia/Taipei timezone** so the band is identical on every device (rolledAt is an absolute epoch; the tz is constant → cross-device deterministic). Every row gets a band (incl. elders — `rolledAt` always exists).

| Taipei hour | Circadian epoch | Band | Dominant state (canon) |
|---|---|---|---|
| 00–06 | 深夜 | **δ** | deep NREM slow-wave sleep |
| 06–12 | 上午 | **β** | active, alert, focused cognition |
| 12–18 | 午後 | **α** | relaxed wakefulness |
| 18–24 | 夜晚 | **θ** | drowsiness / light sleep / REM |

The band↔state mapping is **OpenEvidence-grounded** (2026-06-02): δ 0.5–4 Hz deep sleep, θ 4–8 Hz drowsy/REM, α 8–13 Hz relaxed eyes-closed, β 13–30 Hz alert focus — and amplitude falls as frequency rises (NEJM Brown 2010, `10.1056/NEJMra0808281`; Constant & Sabourdin 2012, `10.1111/j.1460-9592.2012.03883.x`). The hour→epoch buckets are a circadian flavour hook (the charming twist: a variant born at 深夜 carries the δ mark — you fired through the deep-sleep hours).

Rendered as a small **colour-coded Greek-letter watermark** (δ/θ/α/β) in the bottom-right corner (`BAND_META[band].color`, opacity 0.75 so it reads clearly above the faint texture). **No full-cell colour wash** — an earlier cut tinted the whole cell per band, but 4 different tints made the dex grid look inconsistent (owner flagged "不同顏色背景"), so the band's only colour accent is the corner letter and every card keeps a consistent neutral background.

### D4 — Shared `<VariantSprite>` component
`apps/neurons-tw/src/components/VariantSprite.tsx` (`{ row, size, alt, children }`) composes, in a `position: relative; overflow: hidden` square wrap: faint decor field layer(s) → Greek-letter band watermark → base sprite on top. Used at all 3 sites. `children` lets a caller pass an animated base (the modal hero evolve sheet / alive idle `<img>`) so existing reveal animation is preserved; default is a static `<img>`. Everything but the base is behind the neuron.

### D5 — Zero schema / sync change
Decor + band are a pure function of `provenance` and `rolledAt`, computed at render. Both already sync via the neurons R2 bundle. No Dexie `.version()` bump, no bundle `SCHEMA_VERSION` bump, no new adapter → also no upgrade-fixture-lint trigger. A second device with the same row computes identical art.

### D6 — Context channel orthogonal to rarity channel
Rarity (P1–P5) stays expressed by colour (rarity chip / reveal spin). Context uses neuro-field textures + a band letter. The elder Cajal field is a faint background, never confused with the rarity chip.

### D7 — Asset pipeline (3 full-bleed decor textures)
Per `image_gen_routing.md`: simple repeating motifs → Gemini-first. Each generated as an edge-to-edge field on a flat magenta key colour, then chroma-keyed transparent + resized 384 + 16-color quantized (kept full-bleed, no trim). New `sprites/decor/` subfolder + glob in `sprites.ts`; keys default to `TRANSPARENT_PIXEL` so a missing asset means "no visible field", never a broken image.

## Risks / Trade-offs

- **Milestone field is dense** (~93% coverage → reads as a soft gold haze rather than crisp segments at low opacity). Accepted for v1; a sparser regen is a cheap follow-up if wanted.
- **Decor fields are intentionally subtle** (low opacity) — they read as ambient context, not a loud badge. This is the owner-chosen trade (glanceability via the band letter + texture, prioritising "never covers the neuron").
- **Tiny sizes** (family-header mini, 28px): the Greek letter scales down and the field is faint; the representative is still recognisable.

## Migration

None. No data migration, no backfill, no schema/bundle version change. Existing players see context art computed from whatever `provenance` + `rolledAt` they already have.

## Open Questions

- Milestone field density (sparser regen?) — deferred.
- Per-NT-branch flavoured decor (12 assets) — deferred pending telemetry.
