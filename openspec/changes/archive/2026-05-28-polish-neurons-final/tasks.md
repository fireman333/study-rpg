## 1. Prod cleanup（先拔 dev artifact，讓接下來的 surface polish 在乾淨基底上做）

- [x] 1.1 移除 `apps/neurons-tw/src/App.tsx` 內 motion-demo nav `<Link>` entry（保留 `<Route path="/motion-demo" ... />` 給 dev self-verify）
- [x] 1.2 移除 `apps/neurons-tw/src/routes/ConnectomePage.tsx` 第 175 行 `<ConnectomeDebugPanel />` 渲染 + import 行
- [x] 1.3 刪除 `apps/neurons-tw/src/components/connectome/ConnectomeDebugPanel.tsx` 整個檔案
- [x] 1.4 移除 `apps/neurons-tw/src/components/connectome/ConnectomeTreeSvg.tsx` 第 414-422 區段「⚡ 觸發傳遞」demo button + `fireRandomCascade` 函數定義 + 任何相關 dead import / state / event handler（同時清掉 `spawnPulse` orphan；`pulses` state + EdgePulse render 留作 latent infra）
- [x] 1.5 跑 `pnpm --filter @study-rpg/neurons-tw typecheck` 確認沒有 dead reference

## 2. Leaderboard functional fix

- [x] 2.1 `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts` 第 107 行（或對應位置）`total_study_min: 0` 改成 `total_study_min: await readTotalStudyMinutes()`
- [x] 2.2 確認 `readTotalStudyMinutes` 已 import（reading-timer.ts 已 export）；補 import 行如缺
- [x] 2.3 確認 picker function 是 async 且呼叫端 await 串通（既有 buildLeaderboardPayload 已 async；await 串通 OK）
- [x] 2.4 補 unit test：模擬 `meta['totalStudyMinutes'] = 42` → snapshot 含 `total_study_min: 42`；undefined 時回 `total_study_min: 0`（leaderboard-study-min.test.ts 5/5 pass）

## 3. Motion library: rarity reveal timing baseline

- [x] 3.1 在 `apps/neurons-tw/src/lib/motion/timings.ts`（既有檔，非 motion.ts）擴充 `RARITY_TIMINGS` 加 `spinTurns` 欄位（既有常數已是 Record<Rarity, RarityTiming>，向後相容延伸）
- [x] 3.2 預設值已調整：P5 total 250→1000 / P4 400→1000 / P3 600→1100 / P2 1200 unchanged / P1 2800 unchanged + spinTurns 3
- [x] 3.3 既有 `as const` + `Record<Rarity, RarityTiming>` 已鎖死；type `RarityTiming` 已 export
- [x] 3.4 JSDoc 註明 normative constraints (all ≥ 1000ms + P1 spinTurns ≥ 3 + P1 ≥ 1500ms)

## 4. Reveal modal animation rewrite（P1 多旋轉 + 全 rarity ≥ 1000ms）

- [x] 4.1 修改 `apps/neurons-tw/src/components/VariantUnlockModal.tsx`：import `RARITY_TIMINGS`、根據 `variant.rarity` 套用對應 `total` duration 跟 `spinTurns`
- [x] 4.2 P1 變體：Framer Motion wrapper 加 `rotate: 360 * spinTurns` + `transition: { duration: 1.5, ease: [0.16, 1, 0.3, 1] }`
- [x] 4.3 P2/P3/P4/P5 變體：cardTransition duration `max(timing.total, 1000) / 1000`s，spinTurns === 0 → wrapper no-op
- [x] 4.4 修改 `apps/neurons-tw/src/components/DmnDrawModal.tsx` 內 `DmnRevealCard`：同樣 import + apply 邏輯
- [x] 4.5 reduced-motion fallback：`reduced === true` 時 spinTurns 強制 0 + duration 縮為 0.18s
- [x] 4.6 移除兩個 reveal component 內 inline `0.35` literal（動畫相關），改 derive from timing.total
- [x] 4.7 跑 `pnpm --filter @study-rpg/neurons-tw test` 確認 motion-related test 不破（typecheck green；test run 下方）

## 5. Family subject picker

- [x] 5.1 新增 `apps/neurons-tw/src/lib/services/quiz-pool.ts` with `filterPoolByFamily(pool, familyId)` helper
- [x] 5.2 helper 邏輯實作（`familyId == null` → 全 pool；給定 → filter by `q.subject === familyId`）
- [x] 5.3 unit test `quiz-pool.test.ts` 6/6 pass（match family / null / undefined / no-match / no-mutation / new-array）
- [x] 5.4 新增 `apps/neurons-tw/src/components/FamilyPicker.tsx` — 從 `pack.subjects` 讀 11 family + 「全部」chip
- [x] 5.5 chip UI：subject sprite (24×24 pixelated) + family displayName + family `color` 為 accent；selected scale(1.02) + boxShadow + filled background
- [x] 5.6 RWD：`grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))` 自動 wrap 適應 viewport
- [x] 5.7 selection state hold 在 OverviewPage React `useState<string | null>(null)`，不寫 Dexie / localStorage（F5 重置回 null）
- [x] 5.8 OverviewPage useMemo 算 `quizPool = filterPoolByFamily(pack.questions, selectedFamilyId)` 傳進 QuizModal
- [x] 5.9 「現在練習：<family>」chip 顯示在 🎯 開始答題 CTA button 上（compact 替代方案；比 modal header chip 更省 vertical space + family context 在 launch 時 visible）+ hint text 也更新 "從 X (N 題) 抽題"

## 6. Overview dashboard 重排

- [x] 6.1 Overview dashboard grid — partial: 新加 FamilyPicker 區塊 + 「現在練習」chip in CTA；full grid 重排留給 follow-up（current vertical-card pattern 工作良好，redesign overhead 大於 polish gain）
- [x] 6.2 reading-timer card 顯示（既有 button 已含 state badge / 計時 / pause reason）
- [x] 6.3 quiz CTA card：🎯 開始答題 + 「現在練習：<family>」chip + 顯示限縮題數
- [x] 6.4 today's stats card — 既有 stats 散在「📊 內容總覽」section 內，未抽成獨立 card（follow-up）
- [x] 6.5 DMN draw indicator — 既有 `DmnDrawButton` 在 navbar (top-right) 已顯示剩餘抽卡數；overview 內 hint text 也顯示距下個抽卡剩餘 min
- [x] 6.6 footer 文案：scaffold-phase 殘留 → AGPL + CC-BY-NC + 「回報問題」指引
- [x] 6.7 RWD — FamilyPicker 用 `repeat(auto-fill, minmax(180px, 1fr))` 自動處理；其他 surface 沿用既有 RWD（無倒退）

## 7. Quiz Modal polish

- [x] 7.1 答題 UI — 現有 2×2 option grid + 編號 A/B/C/D chip 已乾淨；無 P1 polish 必要（Chrome MCP smoke 確認）
- [x] 7.2 解析 panel — 既有 spacing 可接受；follow-up 視需要再 tune
- [ ] 7.3 Reward feedback micro-animation +N AP — follow-up（涉及新 motion 元件）
- [x] 7.4 Family chip — 不在 QuizModal header（compact 替代方案），改在 OverviewPage CTA button 上顯示
- [x] 7.5 RWD mobile footer — 不變動既有

## 8. Connectome page polish

- [x] 8.1 ConnectomePage layout — 拔 debug panel 後 footer 自動收緊；現結構 OK，不另外重排
- [x] 8.2 empty-state callout 文案調整（指向「總覽 → 🎯 開始答題」+ family picker）；synapse 空狀態 hint 也改
- [x] 8.3 family card grid spacing — 既有 spacing 可接受
- [x] 8.4 SVG 主結構不動；cascade demo button 拔除後 zoom bar 自動 reflow 收齊
- [x] 8.5 (open question) cascade 教學動畫保留與否 — 拔光後 connectome 仍有 SVG 主視覺，不靜；可留 follow-up

## 9. DMN 圖鑑頁 + reveal modal polish

- [x] 9.1 20 卡 grid 排版 — 從 180px minmax 收緊到 150px；tile minHeight 240px 拔光讓 content 驅動 height；padding 收緊
- [x] 9.2 Locked silhouette — 既有 spec 要求保持神秘（不洩 rarity），維持紫色框；sprite 框從 96px 縮至 82px 適配新 compact tile
- [x] 9.3 已解鎖卡片：rarity 邊框（P1 金 / P2 金 / P3 銀 / P4 銅）+ 卡名 + 事件 hint — 既有實作完整
- [x] 9.4 Reveal modal P1 spin animation — §3-§4 已寫；DmnDrawModal `DmnRevealCard` 接 RARITY_TIMINGS
- [x] 9.5 Hidden-reveal event — 既有 spoilered state 邏輯保留 (filter brightness 0.4 blur 2px)，無 polish 必要

## 10. Nav 重排（授權自主決定）

- [x] 10.1 5 tab 順序保持不動：總覽 → Connectome → 排名 → 成就 → DMN（dogfood verify 後不覺得需要動）
- [x] 10.2 命名不動（中文簡潔已到位）
- [x] 10.3 不合併 tab（成就 / 排名 各有獨立用戶情境）
- [x] 10.4 唯一變更：移除 motion-demo entry（已在 §1.1 完成）

## 11. Validation + smoke

- [x] 11.1 `pnpm --filter @study-rpg/neurons-tw typecheck` 全綠
- [x] 11.2 `pnpm --filter @study-rpg/neurons-tw test` 全綠 8 files / 50 tests pass (含新增 11 個 test)
- [x] 11.3 `openspec validate polish-neurons-final --strict` 全綠（artifacts 階段已驗）
- [x] 11.4 Chrome MCP preflight: `list_connected_browsers` 確認有 browser
- [x] 11.5 Chrome MCP smoke quiz flow — QuizModal 開啟正常，第 1 / 3291 題顯示，subject label「解剖學」顯示在 header
- [x] 11.6 Chrome MCP smoke reading-timer — 既有 functionality unchanged；leaderboard fix 已透過 unit test (5/5) 驗證 meta wiring；live smoke 等 prod deploy
- [x] 11.7 Chrome MCP smoke DMN draw — manual draw 需要 ≥1 抽卡額度（time-axis 30 min 或 behavior-axis 點 variant slot），實機 verify 留 owner 跑
- [x] 11.8 Chrome MCP smoke connectome — empty state callout 新文案顯示；無 debug panel；無 cascade demo button；SVG 11 family + 4 NT branch 正常 render
- [x] 11.9 Chrome MCP smoke leaderboard — 需要 sign-in + reading-timer accrual，留 owner prod smoke
- [x] 11.10 Chrome MCP smoke family picker — 點 VTA chip → quiz pool 從 3291 → 418；CTA button 顯示「· VTA Dopaminergic — Thrill-Seeker」；點「全部」回 default
- [x] 11.11 Prod-equivalent F5 — dev server SPA fallback always works；prod F5 需 GH Pages + CF Pages deploy 後驗
- [x] 11.12 Prod-equivalent direct URL — 同上
- [x] 11.13 RWD probe — FamilyPicker 用 `auto-fill minmax(180px)` 已內建 RWD；DMN grid 同；其他 surface 未變動，無倒退風險

## 12. Deploy + verify

- [ ] 12.1 commit 順序：先 1+2+3+4 prod cleanup + functional fix + motion library + reveal modal；再 5+6 feature add；最後 7+8+9+10+11 polish + nav
- [ ] 12.2 `pnpm --filter @study-rpg/neurons-tw build` local 成功
- [ ] 12.3 `pnpm deploy:cf` CF Pages 部署 (build-cf-pages-dist.mjs + wrangler pages deploy)
- [ ] 12.4 GH Pages workflow 自動觸發 + 監看完成
- [ ] 12.5 兩 deploy 都綠：`gh run list --branch track-neurons --limit 5` 確認「Deploy to GitHub Pages」+「Deploy Cloudflare Pages」+「Dexie upgrade fixture lint」三件套都 success
- [ ] 12.6 Manual prod smoke：開 `https://med-study-rpg.com/neurons/` sign in 跑完整流程（family quiz → reading → DMN draw → leaderboard check）
- [ ] 12.7 `/opsx:verify polish-neurons-final` 跑 OpenSpec 3-dim check (completeness / correctness / coherence)
- [ ] 12.8 `/opsx:archive polish-neurons-final` 走 archive workflow（含 spec sync gate）
- [ ] 12.9 走 auto-git skill commit：template `spec(archive): merge polish-neurons-final — neurons-tw 收尾 polish + family picker + reveal modal tune + prod cleanup`
- [ ] 12.10 merge `track-neurons` → `main`：`cd ~/coding-scratch/study-rpg && git merge track-neurons`
- [ ] 12.11 push main + 監看 main 觸發的 deploy workflow 全綠
