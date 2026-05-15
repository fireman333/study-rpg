## Why

M_2nd 8 planned changes 已 archive 7 個（hospital-mode-scaffold / medexam2-corpus-ingestion / doctor-sprite-roster / recruitment-gacha / hospital-tycoon-engine / clinic-level-up / hospital-reputation），剩最後一個 = 二階 medexam2-hospital-tw app 上線 deploy。一階 medexam-tw 已 live at `https://fireman333.github.io/study-rpg/`（M1 ✓ shipped 2026-05-15），但二階 vite base 暫設 `/study-rpg-m2/`（假設 sister-repo 但從未實際建），且 `.github/workflows/deploy.yml` 只 build 一階。沒有實際 live URL → 沒辦法 dogfood 二階 hospital mode、M_2nd track 卡在 staging。

## What Changes

- **Subpath co-location 部署**：兩 app 共用同一個 GH Pages site `https://fireman333.github.io/study-rpg/`
  - 一階 stays at site root `/study-rpg/`（URL 不變、零破壞）
  - 二階 移到 `/study-rpg/hospital/`
- **二階 vite base path 改名**：`/study-rpg-m2/` → `/study-rpg/hospital/`（vite.config.ts）
- **二階 router**：**HashRouter**（已存在）保留不動 — URL 形如 `/study-rpg/hospital/#/banner`。一階用 BrowserRouter + 404 fallback，二階用 HashRouter，兩 app 各自獨立、不強迫一致
- **二階 不需要 SPA 404 fallback**：HashRouter 的 hash-portion 永遠是 client-side 處理、伺服器只看 `/study-rpg/hospital/index.html`，GH Pages 直接 serve 即可。一階的 `404.html` + index.html `<head>` restore-script 模式對二階完全不適用、不要照抄
- **deploy.yml 擴充**：新增 build 二階 step、把 `apps/medexam2-hospital-tw/dist` 複製到 `apps/medexam-tw/dist/hospital/`，**單 artifact 上傳**（不分兩 job、不分兩 concurrency group）
- **README setup checklist**：補一行說明「二階 app 透過 subpath `/hospital/` 共用同一 GH Pages site」，fork 的人不會誤以為要開 sister repo

**Not Breaking**：一階 URL `https://fireman333.github.io/study-rpg/` 完全不變；二階 從未 live，無 URL 破壞。

## Capabilities

### New Capabilities

無（不開新 capability）。

### Modified Capabilities

- `deploy-pipeline`: 既有 6 個 requirements 中至少 3 個要 MODIFIED，可能新增 1–2 個
  - **MODIFIED** Requirement 1（Deploy workflow triggers...）— 加 build 二階 step + dist merge step；upload artifact 路徑（仍是 `apps/medexam-tw/dist`）內含合併後的二階 subdirectory
  - **MODIFIED** Requirement 2（Pre-built content artifacts）— 適用範圍擴及 `apps/medexam2-hospital-tw/public/content/medexam2-tw/`，避免 CI 跑 ~6066 題二階 content build
  - **MODIFIED** Requirement 6（SPA route fallback）— scope 加註「適用 BrowserRouter apps（一階 medexam-tw）」，新增 scenario「HashRouter apps（二階 medexam2-hospital-tw）不需要 404.html fallback、直接 GH Pages serve `index.html` 即可」
  - **ADDED** Requirement（subpath co-location architecture）— lock 「同 repo 兩 app 共用單一 GH Pages site、二階 deploy 到 site subpath、不開 sister repo」這個 architectural decision，方便 future 換成 multi-app 規格時有對照
- `hospital-management-mode`: 視 proposal/design 過程使用者確認後決定是否要加新 requirement 寫死「twoApp shells 共用同一個 deploy site」（這算 hospital-mode 對外契約的一部分）— 預設 **不動 hospital-management-mode**，避免 scope creep；若 owner 認為要紀錄則 design.md 階段加進

## Impact

**Affected files** (worktree: `~/coding-scratch/study-rpg-m2/`, branch: `track-m2`)

| 路徑 | 改動 |
|---|---|
| `apps/medexam2-hospital-tw/vite.config.ts` | `base: '/study-rpg-m2/'` → `base: '/study-rpg/hospital/'` |
| `apps/medexam2-hospital-tw/src/App.tsx` | `HashRouter` 保留**不動**（沒有 basename 要改、沒有 BrowserRouter 要切換） |
| `apps/medexam2-hospital-tw/public/404.html` | **不新增**（HashRouter 不需要） |
| `apps/medexam2-hospital-tw/index.html` | 維持原狀，**不加** rafgraph restore-script |
| `.github/workflows/deploy.yml` | 新增 `Build 二階 app` step + `Merge 二階 dist` step（`mkdir -p apps/medexam-tw/dist/hospital && cp -r apps/medexam2-hospital-tw/dist/* apps/medexam-tw/dist/hospital/`） |
| `apps/medexam2-hospital-tw/public/content/medexam2-tw/meta.json` | 已 committed；不在本 change 改動，但 deploy 時 CI 會把它 ship 上線 |
| `.github/workflows/README.md`（若存在）或 `README.md` | 補 subpath co-location 說明 |

**Worktree / branch impact**

- 改動全部在 track-m2 worktree 跑 propose → apply → archive
- Archive 後手動 `cd ~/coding-scratch/study-rpg && git merge track-m2`（依 project.md Dual-worktree Sync protocol）才觸發 deploy
- 不從 track-m2 branch 直接 push（依 deploy-pipeline 既有 Requirement: PR or non-main push does NOT deploy）

**Dev server impact**（小代價）

- track-m2 worktree 上 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` 跑出來的 URL 從 `http://localhost:5174/study-rpg-m2/` 變成 `http://localhost:5174/study-rpg/hospital/`
- 要 cold `pnpm install` 嗎？vite base 改動不影響 dependency tree，**不需要**；但 `pnpm --filter @study-rpg/medexam2-hospital-tw build` 後 dist 目錄結構會跟 base 對齊

**Verification**（依 CLAUDE.md import `chrome_mcp_preflight.md` 的 SPA route 驗證三件套）

Archive 前必須在 prod 跑：
1. **In-app navigation**：一階 home click → /skills；二階 home click → roster / hospital / 等 internal route
2. **Direct URL**：開新分頁打 `https://fireman333.github.io/study-rpg/hospital/` 與 `https://fireman333.github.io/study-rpg/hospital/#/<sub-route>` 都要 render
3. **F5 / Cmd-R**：一階 `/study-rpg/skills` 不能 404（既有 404 fallback 行為）；二階 `/study-rpg/hospital/#/<sub-route>` 永遠重 render（HashRouter 不會跳回 home）

三件套全綠才能 archive。**注意**：二階是 HashRouter，URL 直連永遠是 `.../hospital/` 後接 `#/<route>`，hash 之前是 static path、GH Pages 直接 serve 不會碰 404 fallback。

**Out-of-scope**（明確不做）

- Sister repo `fireman333/study-rpg-m2`（架構選擇已 confirm 不走）
- 一階 URL 改動 / 一階 base path 變更
- 從 track-m2 branch 直接 deploy（破壞 main = single deploy gate 政策）
- 一階 home 加 hospital entry card（可獨立 follow-up change `add-medexam-tw-hospital-entry`）
- 二階 content build 也跑 CI（依既有 Requirement: Pre-built content artifacts，保留 human gate）
- 自訂 domain / DNS / CDN 設定
