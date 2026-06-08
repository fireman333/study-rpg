## Why

`add-neurons-connector-neuron-family` (#2) shipped the 55-card 連結神經元 closed-set collection with **procedural placeholder art** — each card renders a split-color frame derived from its two subject colors plus a shared bridge silhouette and glow. The registry was wired to accept real per-key sprites (`connector:<pairKey>`) with a present-files-only glob, but no PNGs shipped. The owner wants real pixel-art so the connector cards read as charming collectible creatures rather than abstract frames.

## What Changes

- Ship **55 connector sprite assets** at `packages/theme-pixel-neurons/sprites/connectors/<familyA>__<familyB>.png` (384×384, transparent, 16-color), one per closed-set pairkey, so every connector card upgrades from the procedural placeholder to a rendered sprite.
- The art is a **shared set of 14 distinct generic "bridge hub neuron" variants distributed across the 55 pairkeys** (13 variants used ×4, 1 used ×3) — NOT per-pair-themed. Subject identity stays carried by the card's split-color frame; the sprite only provides 造型 charm (two kawaii soma + axon bridge + cyan synaptic spark + star-burst dendrites, neutral palette: soft greys / teal / ivory / cyan glow). This matches the owner's locked art direction (generic, frame carries identity).
- **No code change**: the theme registry glob (`../sprites/connectors/*.png` → `connector:<a|b>`, present-only) was already wired by #2. Dropping the PNGs in is sufficient; the collection page's existing "sprite override when present" path resolves them automatically.
- The procedural split-color card remains the **fallback** for any pairkey without a registered sprite (a missing PNG never produces a broken image).

## Capabilities

### Modified Capabilities
- `neurons-connector-family`: the connector visual requirement no longer states per-pair art is deferred / that no image asset is required. Connector art now **ships** as a shared generic-variety sprite set distributed across the closed set (frame carries subject identity); the procedural split-color card is demoted to the fallback for any pairkey lacking a registered sprite. The existing "Sprite override when present" and "Procedural placeholder when no sprite present" scenarios stay valid — both are now exercised.

## Impact

- **Assets (new)**: 55 × `packages/theme-pixel-neurons/sprites/connectors/<familyA>__<familyB>.png` (~1.2 MB total). Generated via codex `gpt-image-2` (Gemini MCP auth was a dead-end; codex is the working path), post-processed with `magick` (chroma-key off-white → fit 384 → pad square transparent → 16-color quantize).
- **Code**: none. Registry glob pre-existing; no Dexie `.version` bump, no R2 `SCHEMA_VERSION` bump, no sync adapter, no Worker/D1, no content-pack change.
- **Owner dashboard**: none.
- **Worktree**: `track-neurons`. Precedent: `generate-companion-sprites` / `generate-neuron-variant-sprites` / `generate-dmn-card-artworks`.
- **Out of scope**: per-pair-themed unique art (intentionally generic); connector unlock mechanics (unchanged from #2); brain-map rendering.
