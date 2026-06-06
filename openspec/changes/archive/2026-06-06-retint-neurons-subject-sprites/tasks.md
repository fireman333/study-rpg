## 1. Re-tint the 7 sprites

- [x] 1.1 Copy the 7 owner-approved recolored PNGs (`/tmp/neurons-palette/retint/<id>.png`, magick hue-shifted) over `packages/theme-pixel-neurons/sprites/subjects/{胚胎學,生理學,微生物學,免疫學,寄生蟲學,公共衛生學,病理學}.png`.
- [x] 1.2 Confirm the 4 anchor sprites (解剖學 / 組織學 / 生物化學 / 藥理學) are untouched (`git status` shows exactly 7 modified PNGs).

## 2. Verify

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw exec vite build` clean (sprites bundle as hashed assets; skip the copy-content prehook to protect the maze session's `meta.json`).
- [x] 2.2 Chrome MCP (dev): on `/`, the 7 re-tinted family cards show sprite tint ≈ card accent; no broken images; console clean.
- [x] 2.3 `pnpm -r typecheck` clean (no code change → expected no-op).

## 3. Spec + archive + commit

- [x] 3.1 Sync the `neurons-mode` delta into the main spec; `openspec validate --strict`.
- [x] 3.2 Archive the change.
- [x] 3.3 Commit: explicit per-file `git add` of the 7 PNGs + `neurons-mode` main spec + the archived change folder; `git diff --cached --name-status` confirms no maze-owned file staged.
