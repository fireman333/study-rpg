## Context

`/maze-beta` (`apps/neurons-tw`) renders the brain-maze exploration. This change adds a self-contained decorative animation band above the maze stage. It was built as a prototype spike (owner-approved during dogfood) and is formalized here spec-after-prototype. Most code is already committed on `track-neurons` under the sibling change `expand-neurons-brain-maze-all-branches` (the prototype was swept into that commit because `MazeBetaPage.tsx` imports `MazeExpedition`); this change carries the remaining refinements and the capability spec.

## Goals / Non-Goals

**Goals:**
- A delightful, readable, opt-in expedition animation that reuses collected-variant art.
- Zero gameplay/schema/sync impact — purely cosmetic.
- A clear show/hide that persists and respects accessibility (`prefers-reduced-motion`).

**Non-Goals:**
- No real "expedition" game mechanic (no start/stop/pause of an activity — the journey always runs per `neurons-brain-maze` D11).
- No new Dexie version/table, no R2 sync, no maze SVG/graph changes.
- No change to `VariantSprite` (dex cards keep their context-art decor).

## Decisions

- **Pure CSS scroll over canvas/rAF.** Each layer loops by animating `background-position-x` by exactly one tile width (`background-repeat: repeat-x`), so the loop is seamless regardless of band width. Chosen because compositor-driven CSS animation stays 60fps, is battery-friendly, and — unlike `requestAnimationFrame` — is **not** throttled when the tab is backgrounded (a real constraint observed in this repo's Chrome-MCP verification notes). Alternative (canvas + rAF) rejected: heavier, throttled in background tabs, harder to verify.
- **Three layers at distinct speeds.** Far sulci sky (~34s) / tissue ground (~17s, top edge `mask-image` faded into the sky) / synapse particles (~6.5s). The speed gradient is what sells depth; one layer would read flat.
- **Squad bypasses `VariantSprite`.** Marchers render the raw `SPRITE_MAP[spriteKey]` transparent image, NOT `VariantSprite`. `VariantSprite` composes a context-art backdrop (decor field + brain-wave band letter) that is meaningful on a dex card but becomes visual noise over the busy parallax. A soft `drop-shadow` + faint white halo separates each marcher from the background instead. `VariantSprite` is left untouched so the dex card is unaffected.
- **Squad = up to 5 rarest collected (P0 first).** Reuses existing art (zero new sprite generation), ties the visual to progression, and stays a small, readable group. Empty collection falls back to growth-cone glyphs so the band is never empty.
- **One persisted visibility state, two entry points.** `localStorage['neurons:maze:expeditionShown']` is the single source of truth; the header chip and the on-band "−" minimize button both write it. Two affordances, one concept — the "−" is the contextual quick-hide right where the distraction is; the header chip is the discoverable toggle. Default hidden (opt-in).
- **Show/hide wording, not start/stop.** Labels are "顯示/隱藏遠征動畫" and the "−" is a minimize, deliberately avoiding "出發/暫停遠征" — the maze journey is always running and cannot be paused, so start/stop wording would mislead.
- **`prefers-reduced-motion` freezes all animations** via a `@media` block injected with the component's keyframes.
- **Assets.** Two 64-color-quantized PNGs (codex cute tissue ~187K + Gemini sulci sky ~97K), tiled horizontally; minor edge seams are acceptable for an organic, slow-scrolling decorative texture.

## Risks / Trade-offs

- **Tiled-image seam** → background images are not guaranteed perfectly horizontally tileable, so a faint seam can pass once per loop. Mitigation: organic textures + slow far-layer speed make it near-invisible; acceptable for decoration.
- **`localStorage` unavailable (private mode / disabled)** → reads/writes are wrapped in try/catch and degrade to in-memory default (hidden); no crash.
- **Prototype already committed under a sibling change** → the spec/commit boundary is fuzzy. Mitigation: this change documents the capability and carries only the remaining refinement diff; the archive commit stages files explicitly (no `git add -A`) to avoid sweeping unrelated dirty files.

## Migration Plan

Additive and reversible. Rollback = remove the `MazeExpedition` import + render + the persisted-state code from `MazeBetaPage.tsx` and delete the component + two assets. No data migration.
