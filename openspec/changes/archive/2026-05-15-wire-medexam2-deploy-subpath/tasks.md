## 1. Preflight (track-m2 worktree, before any code change)

- [x] 1.1 確認 cwd = `~/coding-scratch/study-rpg-m2/`、git branch = `track-m2`
- [x] 1.2 `git status` 確認 working tree 乾淨（`apps/medexam2-hospital-tw/public/content/medexam2-tw/meta.json` 的 builtAt timestamp diff 是已知無害的 rebuild artifact — 視需要 stash 或忽略）
- [x] 1.3 `gh auth status` 確認登入；`gh run list --workflow=deploy.yml --limit=3` 看一階既有 deploy 狀態
- [x] 1.4 `git log main..track-m2 --oneline` 對照 track-m2 領先 main 的 commit；確認沒有殘留未 merge 的非本 change 改動

## 2. 二階 vite base path 改名

- [x] 2.1 修改 `apps/medexam2-hospital-tw/vite.config.ts`：`base: '/study-rpg-m2/'` → `base: '/study-rpg/hospital/'`
- [x] 2.2 全文搜尋 `grep -rn "study-rpg-m2" apps/medexam2-hospital-tw/src/ apps/medexam2-hospital-tw/public/ 2>/dev/null` — 確認沒有 hard-coded `/study-rpg-m2/` 路徑（asset import / fetch URL）；有的話一起改成 `/study-rpg/hospital/`
- [x] 2.3 確認 `App.tsx` 的 `HashRouter` **未變更** — 不切到 BrowserRouter、不加 basename
- [x] 2.4 確認 `apps/medexam2-hospital-tw/public/404.html` **不存在**（HashRouter 不需要）；若殘留 stub 檔刪掉

## 3. Deploy workflow 擴充

- [x] 3.1 修改 `.github/workflows/deploy.yml`：在「Build app」step 後增加「Build 二階 app」step（`pnpm --filter @study-rpg/medexam2-hospital-tw build`）
- [x] 3.2 在 build 二階 step 後增加「Merge 二階 dist」step：`mkdir -p apps/medexam-tw/dist/hospital && cp -r apps/medexam2-hospital-tw/dist/. apps/medexam-tw/dist/hospital/`（用 `dist/.` 帶 trailing dot 比 `dist/*` 更穩，含潛在 dotfile）
- [x] 3.3 確認 `Upload Pages artifact` step `path: apps/medexam-tw/dist` **不變**（artifact root 仍是一階 dist，二階是子目錄）
- [x] 3.4 確認 `permissions:` / `concurrency:` 區塊未改動（沿用 deploy-pipeline 既有 requirements）

## 4. README setup checklist 更新

- [x] 4.1 找 deploy workflow 的 setup checklist 文件（`.github/workflows/README.md` 或 main `README.md`）→ 用 `.github/workflows/README.md`（既有 deploy 中心）
- [x] 4.2 補一段「Subpath co-location」說明：兩 app 共用 single GH Pages site；一階 at `/study-rpg/`、二階 at `/study-rpg/hospital/`；fork 不需要開 sister repo
- [x] 4.3 補一行：未來新 game mode 走 `/study-rpg/<mode>/` 命名 convention（呼應 deploy-pipeline ADDED requirement）

## 5. Local sanity build

- [x] 5.1 `pnpm --filter @study-rpg/medexam-tw build` — 確認一階 build 仍 pass（regression check）→ 442 modules / 925ms
- [x] 5.2 `pnpm --filter @study-rpg/medexam2-hospital-tw build` — 確認二階 build pass → 435 modules / 893ms
- [x] 5.3 `ls apps/medexam2-hospital-tw/dist/` — 確認 index.html / assets 路徑使用 `/study-rpg/hospital/` 為 base
- [x] 5.4 `grep -r "study-rpg-m2" apps/medexam2-hospital-tw/dist/` — 應為 0 hit（舊 base path 完全清除）
- [x] 5.5 Local merge dry-run：`rm -rf apps/medexam-tw/dist/hospital && mkdir -p apps/medexam-tw/dist/hospital && cp -r apps/medexam2-hospital-tw/dist/. apps/medexam-tw/dist/hospital/ && ls apps/medexam-tw/dist/hospital/` → `assets/ content/ index.html` 都在；index.html script src 為 `/study-rpg/hospital/assets/index-BaqPg2rG.js`

## 6. Dev server smoke test (Chrome MCP)

- [x] 6.1 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` 啟動 dev server（port 5174 / 5175 被占用、實際走 5176）
- [x] 6.2 Chrome MCP `list_connected_browsers` preflight → 1 browser connected
- [x] 6.3 `navigate` 到 `http://localhost:5176/study-rpg/hospital/` — 確認二階 home 渲染、無 console error
- [x] 6.4 In-app navigation：programmatic click `<Link>` → URL hash 變 `#/hospital`（Hospital page render）、`#/roster`（DoctorRoster page render）。**Note**: Chrome MCP `computer.left_click ref=...` 沒觸發 React-router 攔截（synthetic event 跟 trusted event 差異），但 `a.click()` JS 觸發 OK；真實使用者點擊一定走 trusted event path、不會踩這 quirk
- [x] 6.5 F5 / location.reload on sub-route — `#/roster` reload 後仍 render DoctorRoster
- [x] 6.6 開新分頁直接打 `http://localhost:5176/study-rpg/hospital/#/<route>` — 直接落在 sub-route
- [x] 6.7 停 dev server（TaskStop bsu7tam6n）

## 7. 一階 regression check（worktree 切換）

- [x] 7.1 ~~cd 到一階 main worktree~~ → **Deviation**: track-m2 worktree 跟 main 同 commit（preflight 1.4 verified），且本 change 0 改動 `apps/medexam-tw/` source，所以直接從 m2 worktree 跑 一階 dev 等同 main worktree dev（regression check 仍有效）
- [x] 7.2 `pnpm --filter @study-rpg/medexam-tw dev` 啟動一階 dev（port 5173/5174/5175 被占用、實際走 5176）
- [x] 7.3 Chrome MCP `navigate` `http://localhost:5176/study-rpg/` — 確認一階 boot OK（一階國考 RPG / character / stats / 技能樹 button render）
- [x] 7.4 `http://localhost:5176/study-rpg/skills` direct URL — render 技能樹 page（dev vite SPA fallback 包；prod 404.html 行為留給 Task 11.2 驗）
- [x] 7.5 F5 on `/skills` — 仍 render `/skills`，不跳回 home
- [x] 7.6 停一階 dev server（TaskStop bl92j3b3k）
- [x] 7.7 ~~cd 回 track-m2 worktree~~（沒切過去、不用切回）

## 8. Pre-archive validation

- [x] 8.1 `openspec validate --strict wire-medexam2-deploy-subpath` → valid
- [x] 8.2 `openspec list` — 確認 in-progress changes 只剩本 change
- [x] 8.3 review proposal.md / design.md / specs/deploy-pipeline/spec.md / tasks.md 四檔；確認 owner 認可所有 requirements / scenarios 措辭（owner pre-approved at `/opsx:propose` completion）
- [x] 8.4 確認本 change folder 內無孤兒檔（沒有半成品 `*.bak` / `*.tmp`）

## 9. Archive

- [ ] 9.1 跑 `/opsx:archive wire-medexam2-deploy-subpath`（用 slash workflow，不要用 raw `openspec archive --yes` — 後者跳過 sync gate）
- [ ] 9.2 Slash workflow 提示 sync delta → confirm
- [ ] 9.3 Archive 完成後 `openspec list --specs` 確認 `deploy-pipeline` requirements 從 6 → 至少 7（含新 ADDED requirement）、其中 3 個 MODIFIED 內容反映兩 app 建構
- [ ] 9.4 `git status` 看 archive 動作改動哪些檔案
- [ ] 9.5 Commit：用 auto-git skill，template `spec(archive): merge wire-medexam2-deploy-subpath — 二階 deploy subpath co-location (3 modified + 1 added req)`

## 10. Merge → main → live deploy

- [ ] 10.1 cd 到一階 main worktree：`cd ~/coding-scratch/study-rpg`
- [ ] 10.2 `git fetch origin && git status` — 確認 main worktree clean、跟 origin/main 同步
- [ ] 10.3 預檢 deploy.yml merge 衝突：`git diff main..track-m2 -- .github/workflows/deploy.yml`
- [ ] 10.4 `git merge track-m2`（依 project.md Dual-worktree Sync protocol，需 user confirm — destructive caliber）
- [ ] 10.5 `git diff origin/main..HEAD -- .github/workflows/deploy.yml apps/medexam2-hospital-tw/vite.config.ts` final review
- [ ] 10.6 `git push origin main`（user confirm）
- [ ] 10.7 `gh run list --workflow=deploy.yml --limit=1 --json databaseId,status` 取最新 run ID
- [ ] 10.8 `gh run watch <run-id> --exit-status` 等 GH Actions 跑完
- [ ] 10.9 確認 deploy job 全綠（build 一階 ✓ build 二階 ✓ merge dist ✓ upload artifact ✓ deploy ✓）

## 11. Prod verification (Chrome MCP SPA 三件套)

- [ ] 11.1 Chrome MCP `navigate` `https://fireman333.github.io/study-rpg/` — 一階 regression：home render、console clean
- [ ] 11.2 `https://fireman333.github.io/study-rpg/skills` direct URL — 一階 404 fallback：skill tree render，不噴 GitHub 404
- [ ] 11.3 F5 on `https://fireman333.github.io/study-rpg/skills` — 仍 render，不跳 home
- [ ] 11.4 `https://fireman333.github.io/study-rpg/hospital/` direct URL — 二階 home render、console clean
- [ ] 11.5 `https://fireman333.github.io/study-rpg/hospital/#/<sub-route>` direct URL — 二階 sub-route render
- [ ] 11.6 F5 on 二階 sub-route — 仍 render
- [ ] 11.7 In-app navigation in 二階 — 切 sub-route 不刷整頁
- [ ] 11.8 IndexedDB 永續性檢查（optional but nice）：在二階 home 玩 1 輪 → close tab → re-open → 確認 progress 保留

## 12. Sync 二階 worktree 跟 main（catch up post-merge）

- [ ] 12.1 cd 回 track-m2 worktree：`cd ~/coding-scratch/study-rpg-m2`
- [ ] 12.2 `git fetch origin && git status` — 看 origin/main 是否比 track-m2 領先（merge commit）
- [ ] 12.3 `git merge main`（讓 track-m2 跟上 archive commit）
- [ ] 12.4 `pnpm install` 對齊 lockfile（即使無 dep 變動、避免 worktree drift）

## 13. Roadmap update + decisions log

- [ ] 13.1 編輯 `openspec/project.md` M_2nd Roadmap row：狀態從 🚧 進行中（scaffold）→ ✓ shipped (2026-05-15 或 archive 當天)
- [ ] 13.2 Append 一條到 `openspec/decisions/<archive-date>.md` 紀錄：「M_2nd 8 planned changes 全部 archive、二階 live at /study-rpg/hospital/、未來新 mode 沿用 subpath convention」
- [ ] 13.3 Commit roadmap + decisions update（auto-git，template `docs(roadmap): mark M_2nd ✓ shipped + decisions log entry`）
