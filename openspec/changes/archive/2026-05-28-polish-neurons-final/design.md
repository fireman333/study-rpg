## Context

neurons-tw 在 2026-05-25 ship 11 個 capability、2026-05-28 補 4 個 polish change（artwork / quiz-modal / reading-timer / empty-state callout）後，validate 60/60 全綠、4 surface 全 wired，**功能上完整**。但 owner 親自試玩時直覺「半成品感」強烈，read-only audit 對齊發現 6 個具體 surface：

| # | Symptom | File | 性質 |
|---|---|---|---|
| 1 | `total_study_min: 0` 硬寫 | `neurons-leaderboard.ts:107` | Functional bug |
| 2 | `<ConnectomeDebugPanel>` 在 prod | `ConnectomePage.tsx:175` | Dev artifact 殘留 |
| 3 | `/motion-demo` 在 prod navbar | `App.tsx:111-115` | Dev artifact 殘留 |
| 4 | 「⚡ 觸發傳遞」demo button | `ConnectomeTreeSvg.tsx:414-422` | Dev artifact 殘留 |
| 5 | Footer 文案 stale | `OverviewPage.tsx:228` | Scaffold-phase 殘留 |
| 6 | Reveal modal 動畫太短 / 沒分 rarity | `VariantUnlockModal` + `DmnCardReveal` | UX 質感不足 |

加上 family-level subject picker 缺席（玩家無法像二階「我今天只想刷藥理學」），合計形成 ship 後最後一輪 polish。Owner 已給「全授權變動、Chrome MCP verify 完才交付」執行授權。

**Constraints**：
- 一個 change 收掉全部（不拆 — owner 明確要求）
- 不改 Dexie schema、不改 R2 bundle schema、不改 D1 leaderboard schema（D1 已有 `total_study_min` 欄位）
- 不影響 rewards / SRS / DMN trigger 等下游機制（family picker 走純 filter）
- 不動 connectome SVG 主結構（只拔 demo button）
- 不引入新 npm 套件
- 已 ship 用戶不會看到 regression — 純 additive feature + cosmetic cleanup

## Goals / Non-Goals

**Goals**:

1. 玩家可從 Overview 直接選 family 進 quiz pool（按 11 個 family chip 過濾），保留「全部」隨機 default
2. RarityRevealModal 5 rarity 全部 ≥ 1000ms baseline；P1 走 3 圈旋轉 1500ms ease-out cubic（Pokémon GO catch animation 等級）
3. Leaderboard「總閱讀分鐘」欄反映真實 `meta['totalStudyMinutes']` 累積（不再永遠 0）
4. 拔除 3 處 dev artifact 讓 prod UI 乾淨（motion-demo nav / ConnectomeDebugPanel / cascade demo button）
5. Refresh stale 文案讓 user 不會看到「下一步：sprite + gacha + leaderboard + achievement + deploy」這類 scaffold 殘留
6. 4 surface（Overview / Quiz Modal / Connectome / DMN）視覺與資訊層次重整成真正能 ship、能對外推 Threads 介紹貼文的成品

**Non-Goals**:

- **Dedicated family mode with mastery progress UI**（純 filter，不引入 per-family quiz mode 或 progress dashboard）— grill 已確認
- **Cascade 教學動畫保留**（拔除 demo button 後 connectome 是否補 first-visit-only 教學動畫，apply 階段視重整後是否仍有教學價值決定，不另開 change）
- **Quiz polish follow-up**：SRS due-bias、「太簡單 / 我亂猜的」 quality modifiers、bookmarks、from-connectome-node quiz 啟動、inline bug-report sheet — 這些是下個 change（`polish-neurons-quiz-followup` 之類）
- **Reading-timer polish**：`pause-now` vs `stop` 分開、cross-tab BroadcastChannel、per-content-type counters — 下個 change
- **Achievement / Leaderboard UI re-skin**：本次只 fix functional bug（total_study_min），不重排這兩頁
- **Nav 改回 5 個 tab 之外的結構**：合併 / 移除 nav tab 在授權範圍內，但增加 new nav route 不在本次（保留 5 個 tab 上限作為簡潔約束）

## Decisions

### D1. Family picker = optional `familyId` filter on quiz-pool helper

**Choice**: 新增 `apps/neurons-tw/src/lib/services/quiz-pool.ts`（若不存在）或擴展現有 random picker，接受 `familyId?: NeuronFamilyId` optional 參數。Null/undefined → 全 pool 隨機（現有行為）；給定 id → 限縮為該 family 的題目子集。

**Alternative considered**:
- 獨立 `family-quiz-mode` state machine 進入 Dexie，每次 quiz session 記住「現在綁定哪 family」 → 拒：grill 明確選純 filter，不要 dedicated mode；加 state 等於 over-engineer
- 在 QuizModal props 接受 family filter，自己重新 query 題庫 → 拒：QuizModal 不該知道 content-pack 內部結構；應由 quiz-pool helper 抽象掉

**Rationale**: 純 filter 是最小擴大化改動。下游機制（rewards / SRS / DMN trigger / family mastery）對「這題從哪個 family 抽出來」原本就會走題目自己的 `subjectId`，filter 只是縮 picker 的 candidate set，不影響任何 downstream。可逆性極高，未來想加 dedicated mode 也不會被本次決定 block。

### D2. Family chip data source = content-neurons-tw 的 family list（不另定）

**Choice**: 從 `content-neurons-tw` 已 export 的 family roster（11 個 family 含 displayName / NT branch / sprite key）讀取，做為 chip grid 的 data source。Chip UI 顯示 family sprite（已有 atlas） + family name + family-specific accent color（從 NT branch 推導）。

**Rationale**: 不複製常數、不另開 family registry。content pack 改 family 名 / 加 family → chip 自動跟。

### D3. RarityRevealModal 動畫 timing = motion library 集中設定

**Choice**: 在 `apps/neurons-tw/src/lib/motion.ts`（neurons-motion-library）新增 `RARITY_REVEAL_TIMINGS` 常數對照表：

```ts
export const RARITY_REVEAL_TIMINGS = {
  P5: { durationMs: 1000, spinTurns: 0 },
  P4: { durationMs: 1000, spinTurns: 0 },
  P3: { durationMs: 1100, spinTurns: 0 },
  P2: { durationMs: 1200, spinTurns: 0 },
  P1: { durationMs: 1500, spinTurns: 3 },  // 3 圈 / ease-out cubic
} as const
```

`VariantUnlockModal` / `DmnCardReveal` / 任何 reveal UI 從這支來源讀，**禁止 inline literal**（mirror 既有 `TOAST_AUTO_DISMISS_MS` 慣例）。

**Alternative considered**:
- Per-component 寫死 timing → 拒：違反現有「motion timing 集中管理」原則（`neuron-variant-gacha` Req 已經明文禁止 inline 8000 / 0.3 literal）
- 用 Framer Motion `transition` API 動態算 → 拒：spin animation 需要 CSS keyframe 跟 transition 都校準，集中常數最直接

**Rationale**: 動畫節奏在 ship 後最容易回頭微調（owner 試玩可能 want「P1 再慢一點」），集中常數讓 tune 只改一個檔。

### D4. P1 spin animation = CSS keyframes via Framer Motion variant

**Choice**: P1 reveal modal 在 mount 時跑 `<motion.div>` 配自定 variant，包：
- `rotate: [0, 360 * 3]`（3 圈）
- `transition: { duration: 1.5, ease: [0.16, 1, 0.3, 1] }`（ease-out cubic，類似 `cubic-bezier(.16,1,.3,1)`）
- 同時播放 scale `[0.6, 1.1, 1]`（彈跳定位）跟 opacity `[0, 1, 1]`

**Reduced-motion fallback**: `useRespectsReducedMotion()` 回 `true` 時降為純 opacity fade-in 1000ms，**不轉**（accessibility 不可破）。

**Alternative considered**:
- CSS-only `@keyframes` + `animation` property → 拒：跟既有 Framer Motion 寫法不一致，且 keyframe + reduced-motion 分支較難維護
- Lottie / 3rd-party 動畫 → 拒：不引入新 dep（CLAUDE.md `coding_principles.md` 原則 2）

**Rationale**: 跟 `VariantUnlockModal` 既有 motion 寫法一致，code review 跟 maintenance 路徑統一。

### D5. ConnectomeDebugPanel 整個檔案刪除（不保留為 DEV-only gate）

**Choice**: `ConnectomeDebugPanel.tsx` 整個檔案刪除 + `ConnectomePage.tsx:175` 移除 import。**不**改成 `{import.meta.env.DEV && <ConnectomeDebugPanel />}` 之類的 gate。

**Alternative considered**:
- `{import.meta.env.DEV && ...}` 條件 render → 拒：DEV mode debug 工具應在 React DevTools / DEV-only `globalThis.__debug` handle 提供，不該長期掛在 production component tree（dead code 累積）
- 改造成 keyboard-shortcut-only opened modal（隱形入口） → 拒：本次 polish scope 不擴大

**Rationale**: 已經 ship 過 quiz-modal-mvp 之後，debug panel 的「+1 答對」「時間 +1 天」這些 nuke 用按鈕的功能對 dev 已沒實際幫助（QuizModal 走真實 reward path 更接近 prod）。整個檔刪除最簡。

`重設存檔` 功能可用 Dexie devtools / DEV-only `globalThis.__db` handle 達成（這個 handle 已在 `add-r2-cloud-sync-migration` 階段 stripped from prod）。

### D6. motion-demo route 保留、navbar entry 拔除

**Choice**: `App.tsx` 移除 motion-demo 在 navbar 的 `<Link>`，但保留 `<Route path="/motion-demo" ... />`。Dev 可直接打 URL 進去 self-verify。

**Rationale**: motion library 的 self-verify 還有用，整個 route 拔太狠；只拔 navbar 入口讓 user 看不到，已足夠。

### D7. Cascade demo button = 整段拔除，不替代

**Choice**: `ConnectomeTreeSvg.tsx:414-422` 整個 `fireRandomCascade` 函數 + button + title 都拔。

**Cascade 教學動畫保留與否的開放問題**: empty-state callout（`ConnectomePage:80-91`）目前指引 user 去點 ConnectomeDebugPanel — debug panel 拔除後這指引也跟著失效。Apply 階段視重整後是否仍需要「示範動畫」教學決定：
- 選項 a（默認）：拔光 → empty-state callout 文案改成「答對題目開始長 synapse」，不主動 demo
- 選項 b：補一段「first-visit only」的自動 pulse 動畫，user 第一次進 ConnectomePage 時播一次教用
- 選項 c：cascade demo button 換個更 minimal 的「教學模式」按鈕（不在 SVG 上、放 sidebar）

Apply 期間優先試選項 a；若 verify 階段看 connectome 頁面靜得太死、user discovery 不足，再開選項 b（純 UI add，不改機制）。

### D8. Leaderboard fix = 1-line 修在 picker function

**Choice**: `neurons-leaderboard.ts:107` `total_study_min: 0` 改成 `total_study_min: await readTotalStudyMinutes()`（`readTotalStudyMinutes` 已存在於 reading-timer.ts，OverviewPage 已 import）。

**Alternative considered**:
- 新增 `pushLeaderboardFromReadingTimer()` hook 在 reading-timer service 內 → 拒：違反「最小擴大化」原則；現有 leaderboard sync 已在 `onPushComplete` 觸發，picker 改成讀真值即可

**Rationale**: 接通 1 行解決 functional bug，不需要新 push pathway。已 ship 的 reading-timer-accrue → meta key write → 下次 leaderboard push 自然吃到。

### D9. 4 surface deep polish — surface-by-surface 自主決，verify 端到端

**Choice**: 4 surface（Overview / Quiz Modal / Connectome / DMN）依此優先序處理：

1. **Overview** 重排：reading-timer card + quiz CTA card + family picker card + today's stats + DMN draw indicator 排成 dashboard grid。Footer 文案 refresh。
2. **Quiz Modal** polish：family chip 來自 picker context（顯示「現在練習：藥理學」chip） + reward feedback micro-animation + 解析顯示 spacing
3. **Connectome** polish：拔 debug panel 後重整 layout；sidebar 收緊；empty-state callout 文案調整（去掉指向 debug panel 的舊指引）
4. **DMN** polish：20 卡 grid 排版 / locked silhouette 視覺 / reveal modal 整體（與 D3 / D4 一起做）

每個 surface 收完跑 Chrome MCP smoke 對該頁；4 個全收完跑 prod-equivalent F5 + direct URL（若新增 route）+ network smoke。

**Nav 重排授權範圍**: 5 個 tab 順序可動（例：DMN 移到第 2 個突出剛 ship 的 fate-card） / 命名可動 / 合併可動（例：成就 + 排名 → 社群 tab）。新增 nav tab 不在本次（保留 5 個 tab 上限）。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Family picker 改 quiz-pool 簽名可能影響現有呼叫者 | 用 optional param，現有呼叫者不傳 family 行為不變；TypeScript strict 抓 caller |
| RarityRevealModal 動畫變長 1000ms 在連抽場景累積感變慢 | 本次不做連抽（無 batch reveal queue），單抽即可接受；未來如有連抽，需另 design batch-skip 機制 |
| ConnectomeDebugPanel 拔除後 dev 沒了 quick-reset 入口 | DEV-only `globalThis.__db.delete()` 仍可用（Dexie 內建）；Settings 頁也有「重設存檔」入口（待確認 — verify 階段補 audit） |
| motion-demo URL 仍 reachable 可能被 user 發現 | 不在 navbar 顯示已過 90% 篩；直接打 URL 進的 user 屬 power user，看 demo 不算 bug |
| Cascade demo button 拔除影響 user 對 connectome 機制的理解 | empty-state callout 文案調整補強；Threads 公開介紹文用 GIF 演示 cascade |
| Nav 重排可能讓既有 user 短期找不到 tab | 5 個 tab 都是頂層大字，user 重新導向成本低；不上 redirect / migration banner |
| Verify 階段發現 polish 太深、deploy 風險高 | 隨時可拆出 `polish-neurons-final-batch2` 把 4 surface deep polish 移到下個 change；本次保 A-E 必做 |

## Migration Plan

無 data migration、無 schema bump。純 code 改動：

1. Implement 階段：A → B → C → D → E → F 順序（feature add 先做，再做 polish；polish 出 bug 比 feature 易救）
2. 每組改動完跑 `pnpm --filter @study-rpg/neurons-tw typecheck`
3. 全部完成跑 `pnpm --filter @study-rpg/neurons-tw test`（Vitest 套件含 reading-timer + dmn-* 等既有 27 test）
4. Chrome MCP preflight + smoke：quiz / reading / DMN / connectome / leaderboard / family-picker filter 6 件套
5. Prod-equivalent verify：F5 on each route + direct URL navigation + network smoke
6. `pnpm deploy:cf` + GH Pages 兩 deploy 都綠
7. Manual prod smoke：開 `https://med-study-rpg.com/neurons/` sign in 跑全流程

**Rollback strategy**: 若 deploy 後發現 regression，git revert 整個 polish-neurons-final commit；不留 partial state（純 cosmetic + 1 個 bug fix，revert 安全）。

## Open Questions

- (D7) Cascade 教學動畫拔除後是否補 first-visit-only 自動 demo？Apply 階段視 connectome 頁面是否「靜得太死」決定。
- (D9 nav) 5 個 tab 順序 / 命名 / 合併具體怎麼動？Apply 階段邊做邊判斷；Chrome MCP smoke 期間 user 若同步看可即時反饋。
- Reading-timer 自動跑時 leaderboard push 時機 — 是 next `onPushComplete` 自然推、還是 reading-timer 內部到時 (`accrueMinute` → `pushLeaderboardSnapshot`) 直接觸發？選後者更即時但多一條 push path；前者最小擴大化但延遲到下次 sync 才更新。**默認最小擴大化（前者）**，verify 階段看 leaderboard 排行更新延遲若超過 5 min owner 抱怨再切後者。
