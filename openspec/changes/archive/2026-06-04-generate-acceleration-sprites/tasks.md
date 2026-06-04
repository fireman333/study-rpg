## 1. Setup

- [x] 1.1 Verify Gemini MCP loadable + working (`select:mcp__gemini__gemini_generate_image`; test call returned `image_count: 1` — server fix live)
- [x] 1.2 Verify `magick` available (ImageMagick 7.1.2)
- [x] 1.3 Confirm `sprites.ts` globs `../sprites/equipment/*.png` + `../sprites/cards/*.png` already wired with `?? TRANSPARENT_PIXEL` fallback (no edit needed)
- [x] 1.4 Read `EQUIPMENT_CATALOG` (12 ids + displayName + description + rarity + lane) + the 6 surge/bolus ids from `DMN_CARD_CATALOG`
- [x] 1.5 Identify the 4 orphaned streak-shield card PNGs no longer in `DMN_CARD_IDS`
- [x] 1.6 session-bus claim sent (shared `track-neurons` worktree; explicit per-file `git add` discipline)
- [x] 1.7 `mkdir -p /tmp/accel-sprites-raw/{equipment,cards}`

## 2. Generate raw sprites via Gemini (~3 min wallclock)

- [x] 2.1 12 equipment prompts (per design Decision 3: anchor × rarity-aura ladder × lane palette × "collectible item NOT a creature with a face", except oligodendrocyte/astrocyte = cute cell companions) → `/tmp/accel-sprites-raw/equipment/<id>/`
- [x] 2.2 6 surge/bolus card prompts (per design Decision 4: DMN card template + rarity frame + surge-cool/bolus-warm + "ABSOLUTELY NO TEXT") → `/tmp/accel-sprites-raw/cards/<id>/`
- [x] 2.3 Confirm all 18 raw files landed with real image content (`image_count: 1` each)

## 3. Post-process via ImageMagick (~1 min)

- [x] 3.1 12 equipment → `packages/theme-pixel-neurons/sprites/equipment/<id>.png` (chroma-key white corner + nearest-neighbor 384×384 + 16-color quantize; 7–38 KB each)
- [x] 3.2 6 cards → `packages/theme-pixel-neurons/sprites/cards/<id>.png` (chroma-key dark-purple corner + same recipe; 24–65 KB each)
- [x] 3.3 Visual QA every final PNG (main agent Read each): on-concept, clean transparency, rarity reads at a glance, no chroma-key bites
- [x] 3.4 Re-roll 2 cards that came back with unwanted text (`dmn-glycogen-burst-p4` caption + `dmn-astrocyte-fuel-p3` "P3" badge) with explicit no-text constraint → both clean on v2

## 4. Cleanup orphaned streak-shield card sprites

- [x] 4.1 `git rm` 4 orphaned PNGs: `dmn-pcc-pulse-p2.png`, `dmn-temporal-pole-anchor-p3.png`, `dmn-micro-context-guard-p4.png`, `dmn-small-circuit-immunity-p4.png` (not referenced by any catalog entry / `DMN_CARD_IDS` key)

## 5. Documentation

- [x] 5.1 Write `packages/theme-pixel-neurons/EQUIPMENT_SPRITE_GENERATION.md` (12 prompts verbatim + magick recipe + regen procedure + codex fallback)
- [x] 5.2 Append the 6 surge/bolus prompts + the no-text lesson to `CARD_SPRITE_GENERATION.md`; update its inventory table (20→22 individual cards, note 4 streak-shield removed)
- [x] 5.3 `sprites.ts` doc comments already accurate (22 cards / 12 equipment) — no code change needed

## 6. Verify

- [x] 6.1 `pnpm --filter @study-rpg/theme-pixel-neurons typecheck` ✅
- [x] 6.2 `pnpm --filter @study-rpg/neurons-tw typecheck` ✅
- [x] 6.3 `pnpm --filter @study-rpg/neurons-tw build` ✅ — 12 `equipment:*` + 6 surge/bolus `dmn-*` hashed assets emitted; 0 orphan assets
- [x] 6.4 `pnpm --filter @study-rpg/neurons-tw test` ✅ — 342/342 green
- [x] 6.5 Chrome MCP smoke on `/dmn` ✅ — all 12 equipment + 6 surge/bolus sprites load at `naturalWidth 384` (real, not placeholder); 4 orphan PNGs confirmed deleted (load error); 2 owned sprites render in dex; dex renders on direct-URL + F5 (no 404); console clean
- [x] 6.6 `openspec validate generate-acceleration-sprites --strict` ✅

## 7. Archive (owner-gated)

- [ ] 7.1 `/opsx:archive generate-acceleration-sprites` — syncs the ADDED + MODIFIED requirements into main specs
- [ ] 7.2 `openspec validate --all --strict`
- [ ] 7.3 Commit (explicit per-file `git add`; exclude `meta.json` builtAt churn) — owner confirmation required per curator rules
- [ ] 7.4 Merge `track-neurons` → `main` + deploy — owner-pending batch (with the other queued neurons changes)

## Acceptance criteria

- [x] 12 equipment PNGs at `packages/theme-pixel-neurons/sprites/equipment/` (one per `EQUIPMENT_CATALOG.equipmentId`), 384×384, 16-color, transparent bg
- [x] 6 surge/bolus card PNGs at `packages/theme-pixel-neurons/sprites/cards/`, 384×384, 16-color, transparent bg, correct rarity frame (P2 gold / P3 silver / P4 bronze), NO text
- [x] 4 orphaned streak-shield card PNGs removed
- [x] Each equipment sprite communicates lane (speed gold/cyan vs energy warm-amber) + rarity (P1 radiant aura → P5 plain)
- [x] `sprites.ts` unchanged (globs auto-register the new files)
- [x] `typecheck` (theme + neurons) + `build` + `test` pass
- [x] `/dmn` dev smoke shows real equipment + surge/bolus card art (not empty rectangles); prod smoke is owner-pending post-deploy
- [x] `openspec validate generate-acceleration-sprites --strict` passes
- [x] `EQUIPMENT_SPRITE_GENERATION.md` + appended `CARD_SPRITE_GENERATION.md` document all prompts + recipes
