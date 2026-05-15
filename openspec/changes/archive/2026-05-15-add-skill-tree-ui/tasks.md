## 1. Core types & topology

- [x] 1.1 Create `packages/core/src/skill-tree/types.ts` with `SkillNode`, `SkillBranch`, `SkillTreeContent` interfaces per design.md
- [x] 1.2 Add `skillTree?: SkillTreeContent` field to `ThemePack` interface in `packages/core/src/types.ts` (optional — fallback handles missing case)
- [x] 1.3 Export skill-tree types from `packages/core/src/index.ts`

## 2. Engine fallback content

- [x] 2.1 Create `packages/core/src/skill-tree/fallback.ts` with `engineFallbackSkillTree: SkillTreeContent` covering all 36 nodes (placeholder names like `Knowledge Node 1`, generic flavor lines, sprite key fallback `skill-placeholder-<stat>-<n>`)
- [x] 2.2 Add `resolveSkillTree(theme: ThemePack): SkillTreeContent` helper that returns theme.skillTree when complete, falls back to engine defaults per missing branch/node, and emits one `console.warn` per missing key

## 3. Unlock evaluator + change detector

- [x] 3.1 Create `packages/core/src/skill-tree/unlock.ts` with `unlockedCount(statValue: number, branch: SkillBranch): number` implementing `min(floor(stat/100)+1, 9)`
- [x] 3.2 Add `detectUnlocks(prevStats, nextStats, content): SkillNode[]` returning newly unlocked nodes across all 4 branches when stats transition (sorted by branch order then index)
- [x] 3.3 Add Vitest test file `packages/core/src/skill-tree/unlock.test.ts` covering: stat=0 unlocks 1 node, stat=350 unlocks 4, stat=800+ unlocks 9, single-threshold crossing returns 1 node, multi-threshold crossing returns multiple nodes sorted

## 4. Theme pack content

- [x] 4.1 Create `packages/theme-pixel-medical/src/skillTree.ts` exporting 36 medical-themed nodes (9 per stat); use existing wlk-writing tone (短句、像 RPG 招式名 + 心情 flavor)
- [x] 4.2 Add 36 placeholder sprite files at `packages/theme-pixel-medical/src/sprites/skill-<stat>-<1..9>.png` (reuse one existing sprite × 36 copies — real codex generation comes in a follow-up change)
- [x] 4.3 Register all 36 sprite keys in the theme's `sprites` map (theme manifest / sprite-loader file)
- [x] 4.4 Wire `skillTree` export into the theme's `index.ts` so `ThemePack.skillTree` is populated when this theme is active

## 5. UI components

- [x] 5.1 Create `apps/medexam-tw/src/components/SkillTreeNode.tsx` rendering one node tile with two visual states: unlocked (full-color sprite + name visible) vs locked (dimmed sprite + threshold number visible, name + flavor hidden)
- [x] 5.2 Create `apps/medexam-tw/src/components/SkillTreeBranch.tsx` rendering one vertical column of 9 nodes with stat name + current value header
- [x] 5.3 Create `apps/medexam-tw/src/components/SkillTreeFlavorPanel.tsx` for inline flavor reveal when a node is clicked (popover or panel — pick whichever fits existing CSS pattern in app)
- [x] 5.4 Create `apps/medexam-tw/src/routes/SkillTreeRoute.tsx` that lays out 4 `SkillTreeBranch` columns side-by-side; CSS uses `overflow-x: auto` + `overscroll-behavior-x: contain` so the same JSX works on mobile via horizontal scroll

## 6. App integration

- [x] 6.1 Register `/skills` route in `apps/medexam-tw/src/App.tsx` under react-router v6
- [x] 6.2 Add "技能樹" button to `CharacterCard.tsx`, styled consistent with other character-card buttons; clicking navigates via `useNavigate()` to `/skills`
- [x] 6.3 Hook `detectUnlocks` into the single state-write point where `Player.stats` changes (zustand store action or setter); push returned nodes into the existing toast queue (reuse loot-reveal toast component or its underlying queue)
- [x] 6.4 Ensure toast queue surfaces at most 1 skill-unlock toast at a time, gap ≥ 1.5s between queued toasts (extend existing queue config if needed)

## 7. Verify

- [x] 7.1 `pnpm -r typecheck` passes
- [x] 7.2 `pnpm --filter @study-rpg/medexam-tw dev` starts; navigate http://localhost:5173/study-rpg/skills via Chrome MCP and confirm: 4 columns render, locked nodes show threshold numbers, character-card button navigates correctly
- [x] 7.3 In Chrome MCP devtools, mutate `Player.stats.knowledge` from 0 → 250 via store action; confirm 2 toasts queue and appear sequentially with skill node names
- [x] 7.4 Resize browser to <768px width; confirm columns become horizontally scrollable and swipe inside container does NOT trigger browser back
- [x] 7.5 `/simplify` pass on touched files
- [x] 7.6 `/opsx:verify` against this change before archive
