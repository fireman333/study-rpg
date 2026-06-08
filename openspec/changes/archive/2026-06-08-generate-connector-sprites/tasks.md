## 1. Generate art

- [x] 1.1 Generate distinct neutral "bridge hub neuron" variants via codex `gpt-image-2` (`-m gpt-5.5 --sandbox workspace-write --skip-git-repo-check`, run from `/tmp`); confirm real outputs (~1 MB, not raster duds)
- [x] 1.2 Recover the gpt-image-2 ServerError / dedup shortfall by regenerating serially (concurrency 1) → 14 distinct on-model variants

## 2. Post-process

- [x] 2.1 Process each raw variant: chroma-key off-white corner → fit 384 → pad to 384² transparent → 16-color quantize (PNG32); alpha-verified
- [x] 2.2 Drop sub-100 KB duds and md5-dedupe to the unique variant set

## 3. Assign + place

- [x] 3.1 Build the 55-filename manifest from the canonical pairkeys (`<familyA>__<familyB>.png`); verify all round-trip to the sorted `connector:<a|b>` key (0 mismatch)
- [x] 3.2 Cyclically assign the 14 variants across the 55 pairkeys (13×4 + 1×3) → `packages/theme-pixel-neurons/sprites/connectors/*.png` (55 files)

## 4. Verify

- [x] 4.1 Chrome MCP on localhost `/collection`: all 55 connector imgs load at 384×384, 0 broken images
- [x] 4.2 Force-unlock a sample of connectors → confirm the real sprite renders inside the split-color frame (distinct variants visible); console clean
