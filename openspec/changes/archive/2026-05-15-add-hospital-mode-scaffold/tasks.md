## 1. Spec — define hospital-management-mode capability

- [x] 1.1 Write `specs/hospital-management-mode/spec.md` — game loop overview + 5 high-level requirements (game loop / progression / doctor card / rarity / affinity / visual / formula-deferred)
- [x] 1.2 Cross-reference Decision 1–7 in `design.md` from spec narrative
- [x] 1.3 Verify spec includes `WHEN/THEN/AND` scenario blocks for each requirement (per OpenSpec convention)

## 2. Scaffold packages — empty but typecheck-clean

- [x] 2.1 Create `packages/content-medexam2-tw/{package.json, tsconfig.json, src/index.ts, README.md, LICENSE.md}`
  - `package.json` name = `@study-rpg/content-medexam2-tw`, version `0.0.1`, private true
  - `src/index.ts` exports placeholder `getContentPack()` returning `{ meta: {...}, subjects: [], questions: [] }` conforming to `content-pack-contract`
  - `LICENSE.md` = `TBD-after-ingest` placeholder per Decision 7
  - depend on `@study-rpg/core@workspace:*`
- [x] 2.2 Create `packages/theme-pixel-hospital/{package.json, tsconfig.json, src/index.ts, README.md, LICENSE.md}`
  - `package.json` name = `@study-rpg/theme-pixel-hospital`, version `0.0.1`, private true, license AGPL-3.0-or-later
  - `src/index.ts` exports placeholder `theme` conforming to `theme-pack-contract` — minimal palette + 1 placeholder sprite for 院長 character
  - Fork structure (file layout / export shape) from `packages/theme-pixel-medical/`
  - depend on `@study-rpg/core@workspace:*`
- [x] 2.3 Create `apps/medexam2-hospital-tw/{package.json, tsconfig.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx, src/styles.css, README.md}`
  - `package.json` name = `@study-rpg/medexam2-hospital-tw`, private true
  - `vite.config.ts` base path `/study-rpg-m2/`, port 5174 (一階 5173 不衝突)
  - `src/App.tsx` 純 placeholder：`<div><h1>二階國考經營 RPG (M_2nd scaffold)</h1><p>WIP - scaffold change 1/9</p></div>`
  - depend on `@study-rpg/core@workspace:*`, `@study-rpg/content-medexam2-tw@workspace:*`, `@study-rpg/theme-pixel-hospital@workspace:*`
- [x] 2.4 Verify `pnpm-workspace.yaml` `packages: ['packages/*', 'apps/*']` 已涵蓋新 packages（無需編輯）
- [x] 2.5 Root `package.json` 加 script alias：`dev:m2` → `pnpm --filter @study-rpg/medexam2-hospital-tw dev`、`build:m2` → `pnpm --filter @study-rpg/medexam2-hospital-tw build`（一階 `dev` / `build` 保留不動）

## 3. Roadmap update

- [x] 3.1 Edit `openspec/project.md` Roadmap table，加 `M_2nd — 二階國考 hospital management mode` 列：
  - 範圍：`scaffold + ingest 12k Q + tycoon engine + 抽卡 + 三階段升級`
  - 狀態：`🚧 進行中 (scaffold 階段)`
  - 註明 M_2nd 跟 M2 平行（不擋 M2 一階全科開放）、M3 npm publish 是兩 track 合流點
- [x] 3.2 在 project.md 「Purpose」section 末尾加一段：「M_2nd track 為 fork-flow dogfood — 同一 owner、不同 game mode、共用 core engine。詳見 `openspec/specs/hospital-management-mode/spec.md`。」

## 4. Verify

- [x] 4.1 `pnpm install` — workspace 認到 7 個 package（既有 4 + 新 3：content-medexam2-tw / theme-pixel-hospital / medexam2-hospital-tw）；無 error / warning（除既有的）
- [x] 4.2 `pnpm -r typecheck` 全綠（5 個 typecheck target 全過：core + theme-medical + theme-hospital + content-medexam-tw + content-medexam2-tw；2 個 app typecheck 也過）
- [x] 4.3 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` Vite boot 在 http://localhost:5174/study-rpg-m2/，瀏覽器看到 placeholder title「二階國考經營 RPG (M_2nd scaffold)」；console 0 error
- [x] 4.4 `pnpm --filter @study-rpg/medexam-tw dev` 一階 app regression check：仍在 http://localhost:5173/study-rpg/ 正常 boot；console 0 error；隨機抽 5 題答題流程通過（regression smoke）
- [x] 4.5 `openspec validate add-hospital-mode-scaffold` — passes

## 5. Verify + handoff

- [x] 5.1 `/opsx:verify` — 3-dim check（completeness / correctness / coherence）；0 CRITICAL / 0 WARNING acceptable threshold
- [x] 5.2 `/verify` (or Chrome MCP manual smoke) — 兩 app 都 boot、無 console error、placeholder UI 正確顯示
- [ ] 5.3 Confirm spec wording with user, then `/opsx:archive add-hospital-mode-scaffold`（sync delta into `openspec/specs/hospital-management-mode/spec.md`）
- [ ] 5.4 auto-git commit (message template: `spec(archive): merge add-hospital-mode-scaffold — 3 packages + 1 app for 二階國考 hospital management mode dogfood`)
