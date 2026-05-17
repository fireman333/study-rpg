## 1. Codex sprite generation

- [x] 1.1 Run codex `$imagegen` batch from `/tmp` (per `~/.claude/imports/codex_image_gen.md` recipe + `--skip-git-repo-check` for non-git workdir)
- [x] 1.2 14 female P3 sprites generated: `doctor-{subject}-P3-female.png` for all 14 二階 subjects
- [x] 1.3 1 hospital-tier4 scene generated: `hospital-tier4-national.png`
- [x] 1.4 Visual QA — confirm pixel quality (16-color palette, 384×384 transparent bg for sprites; 768×384 for scene)
- [x] 1.5 Move sprites to `packages/theme-pixel-hospital/sprites/` and scene to `packages/theme-pixel-hospital/sprites/scenes/`
- [x] 1.6 Update `packages/theme-pixel-hospital/SPRITE_GENERATION.md` with row entries (prompts + timestamps + attempt counts)

## 2. Theme pack integration

- [x] 2.1 `packages/theme-pixel-hospital/src/scenes.ts` — extend `HOSPITAL_SCENES` type to include `tier4: string`; update guard so it requires all 4 tier files present before exposing
- [x] 2.2 `packages/theme-pixel-hospital` typecheck passes

## 3. Recruitment gacha update

- [x] 3.1 `apps/medexam2-hospital-tw/src/services/recruitment.ts` — extract `resolveSpriteKey(subjectId, rarity, themeSprites)` helper that:
  - With 50% probability picks `doctor-{subjectId}-{rarity}-female` if it exists in theme sprites
  - Otherwise picks `doctor-{subjectId}-{rarity}`
- [x] 3.2 Wire `attemptRoll` to use the new resolver — `recruitment.ts:76` calls `resolveSpriteKey(subject.id, rarity, THEME_PIXEL_HOSPITAL.sprites)`
- [x] 3.3 Starter pull SHALL NOT use random picker — `db/schema.ts:346` `makeStarterDoctor` hardcodes `doctor-${subjectId}-P5`, bypasses resolver
- [x] 3.4 Typecheck — `pnpm -r typecheck` zero errors across 7 packages

## 4. Hospital scene wiring

- [x] 4.1 `apps/medexam2-hospital-tw/src/components/HospitalScene.tsx` — `TIER_TO_KEY['國家級教學醫院'] = 'tier4'`
- [x] 4.2 Type narrowing: TIER_TO_KEY value union extends to `'tier1' | 'tier2' | 'tier3' | 'tier4'` — `HospitalScene.tsx:9`
- [x] 4.3 Verify scene asset URL resolves at tier 4 — confirmed via Smoke A (force `tier = 國家級教學醫院` → `<img src=".../hospital-tier4-national.png" />` rendered)

## 5. Verification

- [x] 5.1 `pnpm -r typecheck` zero errors — confirmed 2026-05-17 21:23
- [x] 5.2 Statistical gacha test — pure-function smoke on `resolveSpriteKey` with mulberry32-seeded RNG (10000 rolls): 4940 female / 5060 male (ratio 0.494 — within ±0.01 of 0.500 statistical target); female-missing fallback (100 rolls @ rng=0.1, female key absent): 100/100 fell back to male key ✓
- [x] 5.3 Chrome MCP smoke — tier4 scene render verified (Smoke A in 2026-05-17 decision log §19:08): `<img alt="Hospital scene: 國家級教學醫院" src=".../sprites/scenes/hospital-tier4-national.png" />` rendered after force-injecting `tier = '國家級教學醫院'` + reputation 2.5M
- [x] 5.4 Visual review — 4 newly-rolled female P3 sprites (內科 / 外科 / 神經內科 / 麻醉科) opened side-by-side in Preview, confirmed consistent GBA pixel style with male sprites (16-color palette, 384×384, transparent bg, shoulder-length hair + subject-specific props)

## 6. Archive

- [x] 6.1 `openspec validate expand-doctor-roster-dei-and-tier4-scene` passes — confirmed 2026-05-17 21:23 (`✓ change/expand-doctor-roster-dei-and-tier4-scene`)
- [ ] 6.2 `/opsx:verify` — all tasks ticked (this PR backfills the tick state; verify gate next)
- [ ] 6.3 `/opsx:archive` (Curator gate — explicit user confirm)
