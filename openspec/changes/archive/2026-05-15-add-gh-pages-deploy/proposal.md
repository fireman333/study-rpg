## Why

M1 roadmap 最後一格「GH Pages 上架」還沒做。已有條件：

- `vite.config.ts` 已設 `base: '/study-rpg/'`
- `apps/medexam-tw/package.json` 已有 `build` script (`tsc --noEmit && vite build`)
- Content 已 commit 進 `apps/medexam-tw/public/content/medexam-tw/`，CI 不需要重 build content（source `.md` 在使用者本機 Desktop）
- README 已寫好專案介紹

差 GitHub Actions workflow — push to main 自動 build + deploy 到 GitHub Pages，讓使用者跟潛在 fork 開發者 zero-install 就能玩。

本 change 把這塊補上，M1 才能 close。

## What Changes

- 新增 `.github/workflows/deploy.yml`：
  - Triggers: `push` to `main` + `workflow_dispatch`（讓使用者可手動觸發 deploy）
  - Steps: checkout → setup pnpm + node 20 → pnpm install --frozen-lockfile → `pnpm --filter @study-rpg/medexam-tw build` → upload `apps/medexam-tw/dist/` artifact → `actions/deploy-pages@v4` 部署
  - Permissions: `pages: write`、`id-token: write`（Pages 官方 action 需要）
  - Concurrency group: `pages` + `cancel-in-progress: false`（避免兩個 deploy 撞）
- 新增 `.github/workflows/README.md`：說明手動 GitHub repo 設定步驟（Pages source = GitHub Actions、Actions permissions = read+write）。CI 本身無法設定 repo settings，必須一次性人工開
- README.md 加 "Live demo" 章節 link 到 `https://fireman333.github.io/study-rpg/`（placeholder — 首次 deploy 後才生效）
- `openspec/project.md` M1 row「GH Pages 上架」改成 ✓（M1 close ready，pending first successful deploy run）

**Out of scope**:

- Custom domain（CNAME 設定，留給 future change）
- Multi-OS matrix（macOS / Ubuntu）
- Deploy preview per-PR（GH Pages 不支援多版本同存）
- Re-build content from upstream source（source 不在 repo、有 CC-BY-NC 不能 ship）
- Pages source = `gh-pages` branch（用更新的 `actions/deploy-pages` 直接從 artifact 部署，不需要中間 branch）

## Capabilities

### New Capabilities

- `deploy-pipeline`: 定義 CI 部署契約 — 何時跑、跑什麼、靜態 artifact 來自哪、為何不重 build content

### Modified Capabilities

（無）

## Impact

- **Files**:
  - `.github/workflows/deploy.yml`（新檔）
  - `.github/workflows/README.md`（新檔，手動 Pages 設定步驟）
  - `README.md`（加 Live demo 區段）
  - `openspec/project.md`（M1 row ✓）
- **Dependencies**: no new — `actions/checkout@v4`、`pnpm/action-setup@v4`、`actions/setup-node@v4`、`actions/upload-pages-artifact@v3`、`actions/deploy-pages@v4` 都是官方 actions（無 third-party 依賴需要 audit）
- **Repo settings 需手動開**（CI 無法自動）：
  1. Settings → Pages → Source 設成 "GitHub Actions"
  2. Settings → Actions → General → Workflow permissions 設成 "Read and write"
  3. Push 上 GitHub 後 workflow 才會自動跑
- **首次 deploy 預期**: build artifact ~3.5 MB（含 questions.json 5.7 MB + theme sprites + app bundle），gzip 後 transfer ~2.5 MB
- **Performance budget alignment**: project.md NFR「首屏 < 3s」依賴 GH Pages 自帶 gzip + CDN edge cache，本 change 不額外做 perf 優化
