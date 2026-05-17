## 1. Codex sprite generation

- [ ] 1.1 Run codex `$imagegen` batch from `/tmp` (per `~/.claude/imports/codex_image_gen.md` recipe + `--skip-git-repo-check` for non-git workdir)
- [ ] 1.2 14 female P3 sprites generated: `doctor-{subject}-P3-female.png` for all 14 二階 subjects
- [ ] 1.3 1 hospital-tier4 scene generated: `hospital-tier4-national.png`
- [ ] 1.4 Visual QA — confirm pixel quality (16-color palette, 384×384 transparent bg for sprites; 768×384 for scene)
- [ ] 1.5 Move sprites to `packages/theme-pixel-hospital/sprites/` and scene to `packages/theme-pixel-hospital/sprites/scenes/`
- [ ] 1.6 Update `packages/theme-pixel-hospital/SPRITE_GENERATION.md` with row entries (prompts + timestamps + attempt counts)

## 2. Theme pack integration

- [ ] 2.1 `packages/theme-pixel-hospital/src/scenes.ts` — extend `HOSPITAL_SCENES` type to include `tier4: string`; update guard so it requires all 4 tier files present before exposing
- [ ] 2.2 `packages/theme-pixel-hospital` typecheck passes

## 3. Recruitment gacha update

- [ ] 3.1 `apps/medexam2-hospital-tw/src/services/recruitment.ts` — extract `resolveSpriteKey(subjectId, rarity, themeSprites)` helper that:
  - With 50% probability picks `doctor-{subjectId}-{rarity}-female` if it exists in theme sprites
  - Otherwise picks `doctor-{subjectId}-{rarity}`
- [ ] 3.2 Wire `attemptRoll` to use the new resolver
- [ ] 3.3 Starter pull SHALL NOT use random picker — keeps deterministic spriteKey for the 2 free starter doctors (per existing test contract)
- [ ] 3.4 Typecheck

## 4. Hospital scene wiring

- [ ] 4.1 `apps/medexam2-hospital-tw/src/components/HospitalScene.tsx` — `TIER_TO_KEY['國家級教學醫院'] = 'tier4'`
- [ ] 4.2 Type narrowing: TIER_TO_KEY value union extends to `'tier1' | 'tier2' | 'tier3' | 'tier4'`
- [ ] 4.3 Verify scene asset URL resolves at tier 4

## 5. Verification

- [ ] 5.1 `pnpm -r typecheck` zero errors
- [ ] 5.2 Chrome MCP smoke — gacha test: force a P3 roll under different RNG seeds, confirm half the runs produce `-female` spriteKey
- [ ] 5.3 Chrome MCP smoke — tier4 scene: force-set `tier = '國家級教學醫院'` in IDB, refresh, verify tier4 scene PNG renders in HospitalScene
- [ ] 5.4 Visual review — open 4 newly-rolled female P3 sprites side-by-side and confirm consistent style with male sprites

## 6. Archive

- [ ] 6.1 `openspec validate expand-doctor-roster-dei-and-tier4-scene` passes
- [ ] 6.2 `/opsx:verify` — all tasks ticked
- [ ] 6.3 `/opsx:archive` (Curator gate — explicit user confirm)
