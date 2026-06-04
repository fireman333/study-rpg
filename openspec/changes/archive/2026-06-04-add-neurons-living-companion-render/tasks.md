> **Git discipline (shared `track-neurons` worktree).** Parallel sessions fly here.
> NEVER `git add -A` / `git add .`. Stage explicit files only; run
> `git diff --cached --name-status` before every commit to confirm the staging set
> is ONLY this change's files. Exclude the `meta.json` builtAt churn. Per
> `multi_agent_git_safety`.
>
> **Zero schema claim.** This change makes NO Dexie `.version()` bump, NO R2 bundle
> `SCHEMA_VERSION` bump, NO new adapter, NO `SYNCED_META_KEYS` change. If you find
> yourself touching `db.ts` / `bundles.ts` / `tables.ts`, stop — it's out of scope.

## 0. Coordination

- [x] 0.1 `/inbox` + `/msg` to claim the file scope (catalog `companion` flag + new `CompanionLayer.tsx` + `MazeBrainMap.tsx` mount). Confirm no parallel session is editing `equipment-catalog.ts` / `equipment-types.ts` / `MazeBrainMap.tsx` / `OverviewPage.tsx`; re-confirm no schema bump is needed. **(done — inbox all old/shipped; claim sent; target files idle hours; zero-schema confirmed.)**

## 1. Content — catalog companion flag

- [x] 1.1 `packages/content-neurons-tw/src/equipment-types.ts`: add optional `companion?: boolean` to `EquipmentDef` (additive; document "living-cell companion → renders as following sprite").
- [x] 1.2 `packages/content-neurons-tw/src/equipment-catalog.ts`: set `companion: true` on `eq-oligodendrocyte-companion-p3` + `eq-astrocyte-glycogen-p3` only (via optional `make()` 6th param). Leave all 10 structural/molecular items without the flag.
- [x] 1.3 Add pure helper `livingCompanionDefs()` (catalog filter, rarest-first) + `livingCompanions(ownedIds)` (owned ∩ companion) in `equipment-catalog.ts`; re-export both from `index.ts`. Content typecheck clean.
- [x] 1.4 Confirmed the equipment validator (no key-exhaustiveness check), `EquipmentDexPanel`, and the acceleration passive sum (lane/bonus only) are unaffected by the new optional field.

## 2. Render — expedition-band companion marchers

> **PIVOT (owner, live verify): companions march in the EXPEDITION BAND, not a brain-map overlay.**
> The original `CompanionLayer` brain-map overlay + `companion-bob` keyframe were reverted/deleted.

- [x] 2.1 `apps/neurons-tw/src/components/MazeExpedition.tsx`: `useOwnedCompanions()` liveQuery hook (`db.equipment` → `livingCompanions`) + append companion marchers to the band's `members` parade (after the squad; index continues so depth-stagger + bob offsets stay coherent).
- [x] 2.2 Sprite resolution placeholder-first: `companionSpriteUrl(def)` = `SPRITE_MAP['companion:'+id] ?? SPRITE_MAP[def.artworkId] ?? SPRITE_MAP['variant:default'] ?? ''` — animated-frame follow-up swaps with no code change.
- [x] 2.3 Companion marchers reuse the band's existing `exp-bob` + depth-stagger + paused/hidden + reduced-motion treatment (no separate keyframe/gate). Render branch gives them a cyan-glia glow distinct from the variant marchers' white aura.

## 3. Wiring — single integration point (the band)

- [x] 3.1 Companions render only through `MazeExpedition` — which already mounts in BOTH band contexts (homepage reading band via `MazeBrainMap`, compact QuizModal 出征 band). No brain-map SVG overlay, no separate mount.
- [x] 3.2 Reverted the interim brain-map approach: removed the `CompanionLayer` import + mount from `MazeBrainMap.tsx`, deleted `components/CompanionLayer.tsx`, removed the unused `companion-bob` keyframe from `styles.css`. `grep CompanionLayer` clean.

## 4. Tests

- [x] 4.1 Unit: `livingCompanions` predicate — owned glia ∈ set; owned structural/molecular ∉ set; empty owned → empty; rarest-first ordering; array/Set equivalence.
- [x] 4.2 Unit (db data-path, no RTL in suite): seed `db.equipment` with glia + structural → `livingCompanions(ids)` (the band's marcher-derivation) yields only glia, rarest-first; structural-only → empty; both glia → both. Live band render covered by §5.1 Chrome MCP.
- [x] 4.3 `pnpm --filter @study-rpg/neurons-tw test` (53 files / 351 tests) + `pnpm --filter @study-rpg/neurons-tw typecheck` + content typecheck + `pnpm lint:dexie-fixtures` all clean. `grep CompanionLayer` + `grep companion-bob` clean (no orphans).

## 5. Verify (/verify stage)

- [x] 5.1 Chrome MCP end-to-end (localhost:5175): seed glia → both companions appear as marchers in the 神經元遠征隊 expedition band (6 marchers = 4 squad + 2 glia at the back; sprites resolved to real 384px `equipment:<id>` art, cyan-glia glow); structural-only → NO companion marcher; **NOT on the brain SVG** (overlay reverted); band hidden/paused state carries them; console clean (0 errors). Screenshot confirms glia marching with the squad.
- [x] 5.2 Owner sign-off — RESOLVED: owner rejected the brain-map overlay live ("夥伴不放 brain-map，出征動畫才顯示"); re-implemented into the expedition band + re-verified green. Habitat = expedition band squad parade.

## 6. Docs + follow-up

- [x] 6.1 Added a `## Neurons living companions` section to project root `CLAUDE.md` (companion = catalog `companion:true` subset, overlay over the brain-map, zero-schema, placeholder sprite + follow-up).
- [x] 6.2 Flagged the follow-up `generate-companion-animation-frames` (Gemini/codex multi-frame idle sheet for the 2 glia; swaps `companion:<id>` asset; mirror `generate-acceleration-sprites`) in CLAUDE.md + design. No art generated in this change.
