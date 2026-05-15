# `.github/workflows/` — CI 設定說明

## `deploy.yml` — Push to main → GitHub Pages

Static SPA deploy via official `actions/deploy-pages@v4`. Triggers:

- 任何 `push` 到 `main` branch
- 在 GitHub Actions UI 手動 `workflow_dispatch`

PR / 其他 branch push **不會** 觸發 deploy。

### Subpath co-location（多 app single-site 部署）

本 repo 兩個 app shell 共用同一個 GH Pages site：

| App | URL | vite base |
|---|---|---|
| 一階 `apps/medexam-tw` | `https://<owner>.github.io/study-rpg/` | `/study-rpg/` |
| 二階 `apps/medexam2-hospital-tw` | `https://<owner>.github.io/study-rpg/hospital/` | `/study-rpg/hospital/` |

部署機制：CI build 兩 app 後把二階 `dist/` 整顆複製進一階 `dist/hospital/`，**單 artifact** 上傳（GH Pages 一個 repo 只 host 一個 site，這是唯一方式）。

**未來新 game mode 沿用 `/study-rpg/<mode>/` convention**（例：`/study-rpg/surgery/`），不開 sister repo。對應的 `vite.config.ts` `base` 跟 deploy.yml 的 `cp` 目標子目錄必須對齊（spec 內 `deploy-pipeline` capability 鎖死此契約）。

## 首次使用前的一次性 repo settings（必做）

新 fork 或剛 push 上 GitHub 後，workflow 會跑但 **不會實際 deploy**，除非完成以下 3 步：

### 1. Pages source 設成 GitHub Actions

`Settings → Pages → Build and deployment → Source` 選 **"GitHub Actions"**（不是 "Deploy from a branch"）。

[GitHub 官方教學 — Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

### 2. Actions 寫入權限

`Settings → Actions → General → Workflow permissions` 選 **"Read and write permissions"**。Pages deploy 需要 `pages: write` + `id-token: write`，預設的 "Read repository contents" 不夠。

[GitHub 官方教學 — Setting the GITHUB_TOKEN permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token)

### 3. （選用）Custom domain

預設 URL 是 `https://<owner>.github.io/study-rpg/`。要綁自有網域走 `Settings → Pages → Custom domain` + DNS CNAME。本 change 不涵蓋，留給後續。

## 預期行為

| 觸發 | 預計耗時 | Notes |
|---|---|---|
| 首次 deploy | ~2 min | pnpm cache cold + GH Pages 初始化 propagation |
| 後續 deploy | ~30 s | pnpm cache hit + 增量上傳 |
| 撞 `--frozen-lockfile` fail | — | 本機 lockfile 沒同步 commit 上去 |
| 撞 build typecheck fail | — | 本機 typecheck 沒過卻 push 上來 |

CI 失敗時不會 deploy，舊版本繼續活著。**Rollback** = revert 該 commit + push 即可。

## 什麼 CI 不做

- ❌ **不 build content pack**（`@study-rpg/content-medexam-tw` build script 需要 source `.md` 在 `~/Desktop/國考/.../`，不在 repo 也不該在 repo 因 CC-BY-NC license）。Content 改動 flow：developer 本機跑 build → copy `dist/*.json` 進 `apps/medexam-tw/public/content/medexam-tw/` → commit → push → CI deploy 既有 committed JSON
- ❌ **不跑 e2e tests**（dogfood 階段 user 是 e2e）
- ❌ **不跑 lint / format gate**（沒 ESLint 設定）

未來 M2+ 若加 test infra，再開新 change 把 test step 寫進 CI。
