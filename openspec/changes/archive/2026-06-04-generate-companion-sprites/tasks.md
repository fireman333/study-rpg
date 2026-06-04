> **Git discipline (shared `track-neurons` worktree).** Explicit per-file `git add` only;
> `git diff --cached --name-status` before commit; exclude `meta.json` churn.
> **Zero schema/sync** — assets + one render constant + one glob. No db/sync/content change.

## 1. Size — smaller companion marchers

- [x] 1.1 `apps/neurons-tw/src/components/MazeExpedition.tsx`: add `COMPANION_MARCHER_SCALE = 0.6` (tunable) const; companion marcher `<img>` size = `Math.round(size * COMPANION_MARCHER_SCALE)`. Squad marchers unchanged.

## 2. Generate the 2 companion sprites

- [x] 2.1 Preflight: `mcp__gemini__gemini_generate_image` loadable; `magick` + `codex` available (done — magick 7.1.2 / codex 0.128.0).
- [x] 2.2 Gemini-first (per `image_gen_routing.md`): generate `eq-oligodendrocyte-companion-p3` (cute oligodendrocyte = cell body + several myelin-wrapping processes) + `eq-astrocyte-glycogen-p3` (cute star-shaped astrocyte + glycogen-granule hint), transparent pixel-art band-marcher style. If Gemini returns `image_count:0`, fall back to codex CLI (`-m gpt-5.5 --sandbox workspace-write --skip-git-repo-check ... $imagegen < /dev/null`).
- [x] 2.3 magick post-process each → 384×384 transparent 16-color PNG: trim → aspect-preserving resize → center-extent on transparent canvas → quantize + chroma-key corner (NOT `-resize WxH!` — avoids stretch). Visual-QA each (main agent Read): on-concept, clean transparency, no chroma bites.
- [x] 2.4 Place at `packages/theme-pixel-neurons/sprites/companion/{eq-oligodendrocyte-companion-p3,eq-astrocyte-glycogen-p3}.png`.

## 3. Register `companion:<id>`

- [x] 3.1 `packages/theme-pixel-neurons/src/sprites.ts`: add `companionSpriteModules` glob `../sprites/companion/*.png` → `companionSprites` (`companion:<stem>` keys); spread `...Object.entries(companionSprites)` into `SPRITE_MAP` (present files only — NO hardcoded TRANSPARENT_PIXEL keylist, so the `equipment:<id>` fallback survives a missing PNG).

## 4. Verify

- [x] 4.1 `pnpm --filter @study-rpg/theme-pixel-neurons typecheck` + `pnpm --filter @study-rpg/neurons-tw typecheck` + `test` + `pnpm lint:dexie-fixtures` clean; `pnpm --filter @study-rpg/neurons-tw build` (companion PNGs emit as hashed assets, no orphan).
- [x] 4.2 Chrome MCP (localhost): seed glia → band shows the **dedicated** companion art (not the equipment dex sprite), **smaller** than squad marchers; structural-only → none; console clean. Screenshot for owner sign-off on size.

## 5. Docs

- [x] 5.1 Update the `## Neurons living companions` section in project root `CLAUDE.md` (dedicated `companion:<id>` art shipped + `COMPANION_MARCHER_SCALE`; supersede the placeholder-first note). Note the `generate-companion-animation-frames` follow-up is closed (single-frame is the band convention).
