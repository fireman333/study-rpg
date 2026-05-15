## Context

study-rpg 的 deploy 架構在 M1 階段（2026-05-15）已成型：一階 medexam-tw 透過 `.github/workflows/deploy.yml` 推到 GH Pages `https://fireman333.github.io/study-rpg/`，build artifact 來源 `apps/medexam-tw/dist`。M_2nd track 加了第二個 app `apps/medexam2-hospital-tw`（二階國考 + hospital tycoon mode），共用同一 monorepo 但走獨立的 React 18 + Vite 5 + Dexie 技術 stack。

當前狀態：
- 二階 app codebase 完成、本地 dev server (`pnpm --filter @study-rpg/medexam2-hospital-tw dev`, port 5174) 可跑
- 二階 vite base `'/study-rpg-m2/'` 暫設假設 sister-repo 部署，但從未真實建 `fireman333/study-rpg-m2`
- M_2nd 8 planned changes 中 7 已 archive，剩此 deploy 收尾
- GH Pages 一個 GitHub repo **只能 host 一個 site**（不接受多 site / 多 environment），所以「兩 app live」必須在 single site 內 subpath 分流

關鍵約束：
- 一階 URL `https://fireman333.github.io/study-rpg/` **不能變**（M1 已 live，可能有 bookmark / external link）
- 二階 從未 live → URL 可任意選
- Dual-worktree (project.md `## Development Workflow`)：所有 二階 changes 在 `track-m2` branch 跑，merge 到 main 才觸發 deploy
- Single deploy gate：deploy.yml 既有 Requirement「PR or non-main push does NOT deploy」必須維持

Stakeholder：owner（WLK，dogfood user）。沒有外部 team。

## Goals / Non-Goals

**Goals:**

- 二階 medexam2-hospital-tw app 在 `https://fireman333.github.io/study-rpg/hospital/` 真實 live
- 一階 deploy 行為 0 變動（URL、artifact 路徑、build step 都不破壞既有 contract）
- 單一 GH Actions workflow、單一 artifact upload、單一 concurrency group（不分裂 deploy pipeline）
- 完成 M_2nd 8 planned changes 收尾，roadmap row 從 🚧 進行中 → ✓ shipped

**Non-Goals:**

- Sister repo `fireman333/study-rpg-m2`（架構選擇已 confirm 不走）
- 二階 從 HashRouter 改 BrowserRouter（獨立 UX 決策、超出 deploy 範圍）
- 一階 加 hospital entry card / cross-app navigation（獨立 follow-up change）
- 自訂 domain / DNS / CDN（M4+ 才考慮）
- 二階 content build CI 化（依既有 Requirement 2，human gate 保留）
- Track-m2 branch 直接 deploy（破壞 main 為 single-gate 政策）

## Decisions

### D1. Subpath co-location（two apps share single GH Pages site）

**Decision**: 兩 app 共用 `https://fireman333.github.io/study-rpg/` 同一 site；一階 在 site root、二階 在 `/hospital/` subpath。

**Alternatives considered**:

| 方案 | 優點 | 缺點 | 結論 |
|---|---|---|---|
| **A. Subpath co-location**（採用） | 一階 URL 零破壞；單 artifact；單 deploy concurrency；同 repo issue/PR/release 不分裂 | 二階 vite base 要改名一次（從 staging-only path → live path） | ✓ |
| B. Sister repo `study-rpg-m2` | 兩 track 完全獨立；vite base 不用改 | 兩 repo issue/PR/star 分裂；merge 政策複雜化；fork 第三方要分別 clone | ✗ |
| C. Landing portal at root + 一階 改 `/m1/` + 二階 `/m2/` | URL 對稱、語意清楚 | **破壞一階既有 URL**；要做 portal 頁；無此價值 | ✗ |

**Rationale**: A 是唯一同時滿足「一階零破壞 + 單 deploy pipeline + monorepo 不分裂」的方案。代價（二階 base 改名）非常小，因為二階從未 live、沒有 URL bookmark 風險。

### D2. Single artifact via dist merge（not multi-artifact）

**Decision**: build 兩 app 後，把 `apps/medexam2-hospital-tw/dist/*` 整顆複製到 `apps/medexam-tw/dist/hospital/`，仍用單一 `actions/upload-pages-artifact` 上傳 `apps/medexam-tw/dist`。

**Alternatives considered**:

| 方案 | 優點 | 缺點 | 結論 |
|---|---|---|---|
| **A. Dist merge**（採用） | 單 artifact / 單 upload step / 單 deploy；既有 deploy job 結構幾乎不動 | build script 多 1 個 cp step；要明示 `dist/hospital` 是 deploy output 的子目錄 | ✓ |
| B. Multi-artifact upload | 結構整齊 | `actions/deploy-pages` 一次只接受 1 artifact；要做兩 job + 額外 merge step；複雜化 concurrency 設計 | ✗ |
| C. 在 GitHub UI 設 multi-environment | — | GH Pages 不支援單 repo 多 environment；技術上不可行 | ✗（infeasible） |

**Rationale**: A 是 GH Pages 唯一原生支援的「subpath co-location」實作模式。`apps/medexam-tw/dist` 仍是 single source of truth、artifact path 跟既有 spec Requirement 一致，只是內容含子目錄。

### D3. 二階 keep HashRouter（不切到 BrowserRouter）

**Decision**: 二階 `App.tsx` 既有的 `HashRouter` 保留不動。

**Why HashRouter is good for deployed apps without server-side routing**: URL 形如 `/study-rpg/hospital/#/banner`，`#` 前是 static asset path，瀏覽器只 request `/study-rpg/hospital/index.html` 後 hash 部分純 client-side 解析；GH Pages 永遠 serve `index.html` → 零 404 風險、零需要 fallback。

**Trade-off**: URL 視覺較醜（有 `#`），不利 SEO / OG meta（但這專案不靠搜尋引擎 / 不發 social card → 不關鍵）。一階用 BrowserRouter（無 hash）是另一個選擇，當時為了「未來上 SEO」保留，但目前一階也沒做 SEO，差異實作層面而已。

**Alternatives considered**:

| 方案 | 優點 | 缺點 | 結論 |
|---|---|---|---|
| **A. Keep HashRouter**（採用） | 零 404 fallback 工作量；零 routing migration 風險；deploy scope 純化 | URL 有 `#` | ✓ |
| B. 切到 BrowserRouter + 加 `404.html` | URL 較乾淨 | 要寫第二份 `pathSegmentsToKeep = 2` 的 404.html + index.html restore-script；破壞二階已穩定的 routing；scope 膨脹 | ✗ |

**Rationale**: D3 是 deploy 階段的最小 surgical 改動（principle 3 surgical changes）。BrowserRouter migration 跟 deploy 無 functional dependency，scope 該分開。

### D4. Vite base path 命名 `/study-rpg/hospital/` 而非其他選項

**Decision**: 二階 `vite.config.ts` `base: '/study-rpg/hospital/'`。

**Alternatives considered**:

- `/study-rpg/m2/` — 太抽象（m2 對外是 jargon、不易記）
- `/study-rpg/medexam2/` — 跟 monorepo package 名 `@study-rpg/medexam2-hospital-tw` 一致但太長且 deploy 跟 content pack 命名耦合
- `/study-rpg/hospital/` — 對使用者最明示（這是 hospital mode）、跟 game mode 名稱（hospital management mode）對齊 ✓

**Rationale**: D4 從 UX 取捨。`/hospital/` 把「game mode 名稱」直接 expose 給使用者。

### D5. Deploy spec delta 採 MODIFIED + ADDED 混合

**Decision**:

- **MODIFIED** 既有 Requirement「Deploy workflow triggers on main push and manual dispatch」— 加 build 二階 + dist merge 兩個 step + 二階 live URL
- **MODIFIED** 既有 Requirement「Deploy uses pre-built content artifacts」— scope 擴及 `medexam2-tw/` content pack
- **MODIFIED** 既有 Requirement「SPA route fallback works on GitHub Pages」— title 加註 BrowserRouter scope + 新增 scenario「HashRouter app 不需要」
- **ADDED** 新 Requirement「Subpath co-location architecture」— lock 「同 repo 兩 app subpath 共用 single site」這個 architectural decision

**Alternatives considered**:

- 純 MODIFIED（不加 ADDED）— 缺乏 subpath architecture 的 single source of truth，未來 reader 不知道「為什麼是 subpath 而不是 sister repo」
- 純 ADDED（不 MODIFIED）— 既有 6 個 requirement 變陳舊、跟新 requirement 重複

混合方案讓既有 requirement 跟新 requirement 各自單純、互不冗餘。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| [二階 vite base 改名後 dev / build cache 殘留 `/study-rpg-m2/` 連結] | Apply 階段跑 `pnpm --filter @study-rpg/medexam2-hospital-tw build` 後 `grep -r "study-rpg-m2" apps/medexam2-hospital-tw/dist/` 確認 0 hit；dev server 必跑一次 cold start |
| [Deploy merge step `cp -r` 路徑寫死、未來 base 再改要記得改 deploy.yml] | tasks.md 補一個 invariant scenario：deploy.yml 的 `cp` source 必須跟 二階 vite base 對齊；spec MODIFIED requirement 加 scenario 強制檢查 |
| [Track-m2 branch deploy.yml 改動 merge 進 main 時跟一階 deploy.yml 既有改動衝突] | Merge 前 `git fetch origin main && git diff main..track-m2 -- .github/workflows/deploy.yml` 預檢；衝突時手動 rebase track-m2 上面 |
| [HashRouter URL 含 `#` 在分享時 OG meta 不抓 sub-page] | 已知、可接受（dogfood 主，不靠 social referral）；M_2nd post-ship 可開 follow-up change 切到 BrowserRouter |
| [GH Pages cache 對既有 `/study-rpg/` site 投遞新 artifact 時、二階子目錄第一次 cold fetch 慢] | 第一次 deploy 後手動 `curl -I https://fireman333.github.io/study-rpg/hospital/` warm-up；後續正常 CDN cache |
| [build 二階 失敗時整個 deploy job 失敗、一階 deploy 也被 block] | 接受。一階跟二階是同 monorepo 同 source-of-truth、任一 broken 都應 block deploy（catch issue 比 ship broken state 好） |
| [URL `/study-rpg/hospital/` 跟未來其他 mode subpath 衝突] | 未來開 mode 用 `/study-rpg/<mode>/` 統一模式；hospital 是首例，後續沿用即可。Subpath naming convention 寫進 deploy-pipeline ADDED requirement |
| [二階 content pack `medexam2-tw/` size > 一階 medexam-tw size、artifact 接近 GH Pages 1 GB 上限] | 當前 二階 questions.json ~6066 Q 估 < 5 MB；一階 ~3291 Q ~3 MB；單 artifact 預估 < 20 MB（含字型 / asset）；遠低於 1 GB 上限；不擔心 |

## Migration Plan

### 階段 1（Propose / Apply — track-m2 worktree）

1. 在 `~/coding-scratch/study-rpg-m2/`（track-m2 worktree）跑 `/opsx:apply`
2. 改 `apps/medexam2-hospital-tw/vite.config.ts` base path
3. 改 `.github/workflows/deploy.yml` 加 build 二階 + dist merge step
4. Local sanity：`pnpm --filter @study-rpg/medexam2-hospital-tw build && ls apps/medexam2-hospital-tw/dist/`
5. Local merge sanity：`pnpm --filter @study-rpg/medexam-tw build && cp -r apps/medexam2-hospital-tw/dist apps/medexam-tw/dist/hospital && ls apps/medexam-tw/dist/hospital/`
6. README setup checklist 補一行 subpath 說明

### 階段 2（Verify pre-archive — track-m2 worktree dev server）

依 CLAUDE.md import `chrome_mcp_preflight.md`：

1. `pnpm --filter @study-rpg/medexam2-hospital-tw dev` 開 `http://localhost:5174/study-rpg/hospital/`
2. Chrome MCP `list_connected_browsers` → preflight
3. `navigate` 到 dev URL → 確認 boot OK、HashRouter 切 sub-route OK
4. 切 `#/<sub-route>` 後 F5 → 不跳回 home
5. Console clean、no error

### 階段 3（Archive）

1. `/opsx:archive wire-medexam2-deploy-subpath`（透過 slash workflow 而非 raw CLI — 詳 spec skill「失敗模式」表）
2. Archive 動作會 sync `openspec/specs/deploy-pipeline/` delta + 移 change 到 `openspec/changes/archive/`
3. Commit message: `spec(archive): merge wire-medexam2-deploy-subpath — 二階 deploy subpath co-location (3 modified + 1 added req)`

### 階段 4（Merge → main → live deploy）

1. `cd ~/coding-scratch/study-rpg`（main worktree）
2. `git fetch && git status`（確認 main worktree clean）
3. `git merge track-m2`
4. Push 前用 `git diff origin/main..HEAD -- .github/workflows/deploy.yml` review
5. `git push origin main` → 觸發 GH Actions deploy
6. `gh run watch <run-id> --exit-status`（仿 `decisions/2026-05-15.md` 00:21 pattern）

### 階段 5（Post-deploy verification — prod URL）

依 CLAUDE.md import `chrome_mcp_preflight.md` SPA 三件套：

1. `https://fireman333.github.io/study-rpg/` → 一階 boot OK（regression check）
2. `https://fireman333.github.io/study-rpg/skills`（一階 BrowserRouter sub-route）→ React app render，不噴 404
3. `https://fireman333.github.io/study-rpg/hospital/` → 二階 boot OK
4. `https://fireman333.github.io/study-rpg/hospital/#/<sub-route>` → React app render
5. F5 on 二階 sub-route → 仍 render

5 件全綠 → 整個 change closed、roadmap row M_2nd 從 🚧 → ✓ shipped。

### Rollback

若 prod verification 失敗（任一件 404 / boot error / regression）：

1. 立即 `git revert` track-m2 merge commit 並 push（恢復一階獨立 deploy 狀態）
2. 二階 dev 環境繼續可用
3. 開新 change `fix-medexam2-deploy-<symptom>` 對症修
4. `openspec/decisions/<date>.md` 紀錄 root cause + fix path

## Open Questions

1. **README setup checklist 寫一份 vs 散在各 app**：目前 `.github/workflows/README.md` 應是 deploy 中心、一階 / 二階 各自 README 不重複；如果 owner 偏好分別寫、apply 階段 confirm
2. **deploy.yml 是否該把 build 兩 app 用 `pnpm -r build` 取代各別 filter**：`pnpm -r build` topo-sort 自動依 dependency graph build；但 build 多餘 package（theme / content）會略慢。建議 apply 階段保留各別 filter（精準控制）
3. **未來第三個 game mode 的 subpath naming**：本 change 開 hospital 先例 `/study-rpg/hospital/`；下次新 mode（例如 surgery rotation simulator）走 `/study-rpg/<mode>/` 應該寫進 deploy-pipeline ADDED requirement 的 scenario，鎖死 convention
