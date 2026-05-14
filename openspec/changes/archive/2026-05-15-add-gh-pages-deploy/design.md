## Context

`apps/medexam-tw` 是純 CSR Vite SPA，build 完只有靜態 `dist/`（index.html + JS/CSS bundle + assets/）。Content（questions.json / subjects.json / meta.json）在 `apps/medexam-tw/public/content/medexam-tw/`，Vite build 會把 public/ 直接複製進 dist/。GitHub Pages 對這種靜態 SPA 是天然 fit。

當前阻塞：

1. 沒 GitHub Actions workflow — push 後沒人 build
2. 沒 GitHub remote（`git remote -v` 為空）— 使用者尚未 push 上 GitHub
3. Repo Pages 設定（Pages source = Actions、Actions permissions）一定要人工開，CI 無法 self-bootstrap

本 change 處理 #1，文件記載 #2 #3 留給使用者一次性操作。

## Goals / Non-Goals

**Goals:**

- 一個 deploy workflow YAML，使用者 push 到 main 後 GitHub 自動跑、deploy 完站點上線
- 使用者 push 之前 actionlint / 純人工 review 能 catch yaml syntax 錯
- 文件清楚記載手動 repo settings 步驟，使用者開 GitHub 帳號當天就能搞定
- README 加 live URL 區段，吸引 fork / 玩家

**Non-Goals:**

- 不寫 e2e 測試 in CI（沒 test infra 在 repo）
- 不做 release / version tagging
- 不做 deploy preview per-PR
- 不做 lighthouse / perf budget gate
- 不做 visual regression / Chromatic
- 不上 npm（M1 不發 npm，per project.md）
- 不重 build content from upstream（陽明小組 source 在使用者本機 Desktop、有 CC-BY-NC 不能進 repo）

## Decisions

### Decision 1: Pages source = GitHub Actions（不是 gh-pages branch）

**選擇**: 用 `actions/deploy-pages@v4` 直接從 build artifact deploy，不寫 gh-pages branch。
**理由**:
- 官方推薦做法（2022+）— 比 `peaceiris/actions-gh-pages` 老牌但需要 push to branch 的方式更乾淨
- 不會在 git history 留一條 binary-heavy 的 gh-pages branch（首次 build artifact ~3.5 MB × N deploys，clone 會變慢）
- artifact 自動回收（GitHub 預設 90 天保留），不污染 repo
- Pages settings 設一次後不用再管 branch protection
**Alternative considered**:
- `peaceiris/actions-gh-pages` — 否決，需要 push permissions、要設 deploy key 或 PAT、又會有 binary 在 git history

### Decision 2: Node 20 + pnpm 9 / 10（不鎖 latest）

**選擇**: Workflow 用 `node-version: '20'` + `pnpm/action-setup@v4`（會讀 `package.json` 的 `packageManager` field）。
**理由**:
- Node 20 是當前 LTS，明年才換 Node 22
- pnpm version 跟 local 對齊（讀 packageManager field），避免 lockfile 版本錯亂
**Alternative considered**:
- Pin `pnpm-version: 9.0.0` 寫死 — 否決，跟 local development drift 風險

### Decision 3: Frozen lockfile（`pnpm install --frozen-lockfile`）

**選擇**: CI 用 `--frozen-lockfile` 跑 install。
**理由**:
- 確保 CI 跟 local 安裝同一份 lockfile，hash mismatch 立刻 fail（fail fast）
- 不會偷偷 update lockfile 造成 deploy 跟 local 環境 drift
**Alternative considered**: 預設 `pnpm install` — 否決，CI 不該 mutate lockfile

### Decision 4: Build artifact 路徑 = `apps/medexam-tw/dist/`

**選擇**: `actions/upload-pages-artifact@v3` 上傳 `apps/medexam-tw/dist/`。
**理由**: Vite build 的 output 預設就是 dist/，且 vite.config 的 `base: '/study-rpg/'` 已對齊 GH Pages 子路徑。
**No alternative** — 單純沿用 Vite 預設。

### Decision 5: 不在 CI 跑 content build

**選擇**: workflow 只跑 `pnpm --filter @study-rpg/medexam-tw build`，**不** 跑 `pnpm --filter @study-rpg/content-medexam-tw build`。
**理由**:
- Content source `.md` 在使用者本機 `~/Desktop/國考/.../`，不在 repo
- Content 已 build 完 commit 進 `apps/medexam-tw/public/content/medexam-tw/`
- 試圖在 CI 重 build 會立刻 fail（`MEDEXAM_SOURCE_ROOT` 不存在）
- 使用者本機 build content + commit 是現有 flow（per 上一個 change）
**Alternative considered**:
- 把 `__extracted/` 同步進 repo — 否決，CC-BY-NC license 不能 ship 詳解、且 ~50 MB 太大

### Decision 6: workflow_dispatch 開啟（手動 trigger）

**選擇**: triggers 同時有 `push: branches: [main]` 跟 `workflow_dispatch`。
**理由**:
- 使用者可以在 GitHub UI 「Run workflow」按鈕手動 trigger，不需要假 commit
- Useful 當 deploy 因為 cache miss / external service 偶發失敗時，re-run 不用 push 新 commit
**Cost**: 微乎其微，YAML 多兩行。

## Risks / Trade-offs

- **[Risk] 使用者忘記設 Pages source = GitHub Actions** → Mitigation: `.github/workflows/README.md` 寫明步驟 + 在 main README 加「Setup checklist」。Workflow 跑了但 Pages 沒 deploy 會在 Actions tab 看到 deploy step warning，使用者反查就知道。
- **[Risk] questions.json (5.7 MB raw / 2.09 MB gzip) 接近 GH Pages 100 MB 單檔上限的 17%，未來加圖題會超** → Mitigation: 本 change 不解，下次 content size 超出時走 lazy-load split per design.md (上一個 change Decision 4 已紀錄 ceiling 2.5 MB rationale)
- **[Risk] 首次 deploy 失敗找不到原因** → Mitigation: workflow 加 `actionlint` 不是 CI 本身的事，使用者本機跑 `actionlint .github/workflows/deploy.yml` 一次先看；workflow 內 step 有清楚 name 容易在 Actions log 對應
- **[Trade-off] 18+ commits 一次推進 main 然後立刻 deploy** → 接受，每個 commit 都是 spec(archive)，main 第一次 deploy 等於「M1 milestone deploy」是 narrative-correct
- **[Trade-off] 沒寫 e2e test 在 CI** → 接受，dogfood 階段使用者自己當 e2e；M2 之後可以加 playwright skeleton 在新 change

## Migration Plan

無 code migration。使用者首次 deploy 流程：

1. **Local**: 跑完本 change（artifact 寫好）後，commit
2. **GitHub**: 開 repo `fireman333/study-rpg`（public）→ push `claude/elegant-shirley-43663a` branch + push main
3. **Settings 一次性**: Pages → Source = GitHub Actions；Actions → General → Workflow permissions = Read and write
4. **First deploy**: push 任意 commit 到 main 觸發、或在 Actions tab 手動 dispatch
5. **Verify**: 開 `https://fireman333.github.io/study-rpg/` 確認載入、quiz 可開
6. **Rollback**: 如果 deploy 出問題，Revert 對應 commit + push 即可（GH Pages 自動跟著 redeploy 上一個 successful build）
