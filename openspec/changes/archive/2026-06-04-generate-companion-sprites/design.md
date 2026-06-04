## Context

The companion marchers (per `add-neurons-living-companion-render`) resolve `companion:<id>` → `?? equipment:<id>` → `?? variant:default`. Today no `companion:<id>` key exists, so they fall back to the dex `equipment:<id>` art at squad size. This change ships the `companion:<id>` art + shrinks the marcher.

## Goals / Non-Goals

**Goals:** dedicated cute glial-cell marcher art (band-style, transparent); smaller marcher footprint; preserve the `equipment:<id>` fallback if art is ever absent.

**Non-Goals:** no per-frame animation (band is CSS-bob); no brain-map render; no change to the dex `equipment:<id>` art, acceleration math, or schema.

## Decisions

### Decision 1 — Register only *present* `companion/*.png` (no TRANSPARENT_PIXEL keylist)

Add a `companion/*.png` glob → `companion:<stem>` and spread **`Object.entries(companionSprites)`** (present files only) into `SPRITE_MAP` — NOT a hardcoded `COMPANION_ART_KEYS` mapped to `TRANSPARENT_PIXEL` like `EQUIPMENT_ART_KEYS`.

- **Why**: a hardcoded key → `TRANSPARENT_PIXEL` would make `SPRITE_MAP['companion:<id>']` *truthy* even when the PNG is missing, shadowing the band's `?? equipment:<id>` fallback (companions would vanish instead of showing the equipment art). Spreading present entries only keeps the key `undefined` when absent → fallback fires. This change ships both PNGs, so the keys resolve to real art.

### Decision 2 — One tunable size constant

`COMPANION_MARCHER_SCALE = 0.6` (dogfood-tunable) in `MazeExpedition.tsx`; companion marcher size = `Math.round(size * COMPANION_MARCHER_SCALE)`. Squad marchers unchanged.

### Decision 3 — Generation pipeline (Gemini-first, codex fallback)

Per `image_gen_routing.md` (single cute creature → Gemini-first): try `mcp__gemini__gemini_generate_image` for each glia (cute transparent pixel-art glial cell, band-marcher style). If Gemini returns `image_count: 0`, fall back to codex CLI (`codex exec -m gpt-5.5 --sandbox workspace-write --skip-git-repo-check "... $imagegen" < /dev/null`). Post-process with magick: trim → aspect-preserving resize → center on a 384×384 transparent canvas → 16-color quantize + chroma-key the corner (avoid the `-resize WxH!` stretch). Visual-QA each (main agent Read) for on-concept + clean transparency.

- **Anatomy anchors** (keep the neuroscience honest, per project rule — these are established textbook facts, no new OE query needed): oligodendrocyte = a cell body with several myelin-wrapping processes; astrocyte = a star-shaped cell with many radiating processes + a glycogen-granule hint.

## Risks / Trade-offs

- **Gemini proxy may return `image_count: 0`** (needs Claude Code restart per `image_gen_routing.md`) → fall back to codex; if codex content-gates (unlikely for "cell"), retry with plain wording.
- **Stretch artifact** if magick uses `-resize WxH!` on non-square output → use trim + aspect-resize + center-extent.
- **Missing-PNG fallback** → Decision 1 keeps the `equipment:<id>` fallback intact.

## Migration Plan

1. `MazeExpedition.tsx`: add `COMPANION_MARCHER_SCALE`, apply to companion marcher size.
2. Generate + post-process 2 sprites → `sprites/companion/`.
3. `sprites.ts`: companion glob + spread into `SPRITE_MAP`.
4. Verify (Chrome MCP): seed glia → smaller, dedicated companion art in the band; typecheck/tests/lint green.
- **Rollback**: delete the 2 PNGs + the glob/scale (band reverts to equipment-art at squad size).
