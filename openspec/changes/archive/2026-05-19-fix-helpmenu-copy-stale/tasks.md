## 1. Import constant + compute tier-upgrade body string

- [x] 1.1 In `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx`, add named import: `import { TIER_UPGRADE_THRESHOLDS } from '@study-rpg/content-medexam2-tw'` (alphabetical position next to existing content-pack imports if any; otherwise group with other workspace imports) — added at line 13
- [x] 1.2 Above the `SECTIONS` array, define a `tierUpgradeBody` template literal that interpolates `(TIER_UPGRADE_THRESHOLDS.診所! / 1000).toFixed(0)`, `(TIER_UPGRADE_THRESHOLDS.區域醫院! / 1000).toFixed(0)`, `(TIER_UPGRADE_THRESHOLDS.醫學中心! / 1000).toFixed(0)` respectively — `!` non-null assertion to satisfy `Record<HospitalTier, number | null>` typing
- [x] 1.3 In the `tier-upgrade` section of `SECTIONS`, replace the hard-coded body[0] string with `tierUpgradeBody`; keep body[1] (雙閘設計 sentence) separate for visual paragraph break (the 雙閘設計 sentence is opinionated commentary, not derived from a constant — keeping it static is fine)

## 2. Rewrite §retire body for AAD label

- [x] 2.1 In the `retire` section of `SECTIONS`, body[0] change to: `'在「進修」頁面點醫師卡片的「AAD」按鈕（自願離院 / 退休）→ 確認後該醫師永久移除，返還 powerMultiplier × 1000 💰 到營收。'`
- [x] 2.2 body[1] change to: `'24 小時內 AAD 的醫師仍計入升級多樣性門檻（grace period），避免短期 AAD 後被卡升級。'`

## 3. Typecheck + dev smoke

- [x] 3.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — zero errors (tsc --noEmit clean)
- [x] 3.2 Dev server on `localhost:5176/study-rpg/hospital/`, Chrome MCP: opened HelpMenu (10 sections listed), expanded 升級雙閘門 — body reads 「診所→區域醫院：**30k** 聲望 + 5 不同科別；區域→醫學中心：**80k** + 8 P3+ 不同科別；醫學中心→國家級：**150k** + 10 P2+ + 至少 1 位 P1」 ✓
- [x] 3.3 Same dev session, expanded 醫師退休與返還 — body reads 「點醫師卡片的「AAD」按鈕（自願離院 / 退休）→ ...」 + grace-period sentence reads 「24 小時內 AAD 的醫師仍計入...避免短期 AAD 後被卡升級」 ✓; console clean (only known react-router future-flag warnings)

## 4. Verify

- [x] 4.1 Run `/opsx:verify` to check completeness / correctness / coherence — passed: 0 critical / 0 warnings / 0 suggestions; design D1–D4 followed; all 4 scenarios cross-checked against code lines [HelpMenu.tsx:13](apps/medexam2-hospital-tw/src/components/HelpMenu.tsx:13), [HelpMenu.tsx:32-38](apps/medexam2-hospital-tw/src/components/HelpMenu.tsx:32), [HelpMenu.tsx:82-83](apps/medexam2-hospital-tw/src/components/HelpMenu.tsx:82) + Chrome MCP dev smoke captures
- [ ] 4.2 Chrome MCP smoke on prod **after** deploy: hard-reload `https://fireman333.github.io/study-rpg/hospital/`, open HelpMenu, expand 升級雙閘門 → verify 30k / 80k / 150k; expand 醫師退休與返還 → verify AAD label

## 5. Archive

- [x] 5.1 `openspec validate fix-helpmenu-copy-stale` — pass
- [x] 5.2 Run `/opsx:archive` to sync delta into `openspec/specs/hospital-tutorial/spec.md` and move folder to `archive/2026-05-19-fix-helpmenu-copy-stale/` — delta merged into existing Req block (copy-drift sub-clauses added, "all 8 sections" → "all 10 sections", 2 new Scenarios appended); folder moved
- [ ] 5.3 Commit (template: `spec(archive): merge fix-helpmenu-copy-stale — HelpMenu §tier-upgrade dynamic from constant + §retire AAD label`) — explicit user confirm before `git commit`; stage only `HelpMenu.tsx` + `openspec/specs/hospital-tutorial/spec.md` + `openspec/changes/archive/...` (exclude pre-existing dirty `meta.json` + old archive `tasks.md` modifications per `multi_agent_git_safety.md`)
