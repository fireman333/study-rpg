# Tasks — tidy-neurons-homepage-ui

## 1. 模考 → 題庫 tab + 純練習語意

- [x] 1.1 在 `QuizModal` 加 `practice`（exam/題庫）mode prop；answered 流程在 practice mode 下跳過 `recordCorrectAnswer` / `recordIncorrectAnswer` 的養成 side-effect（maze 能量、walker 推進、variant settle、connectome batch），保留 `recordQuestionResult`（questionHistory：coverage + everWrong）與 SRS `reviewCardBinary` 排程
- [x] 1.2 清點 `recordCorrectAnswer` 完整 side-effect → 確認只做養成（mastery / daily reset 衰減 / streak / AP / 能量 faucet）；study-tracking（everWrong / coverage / SRS）走 `recordQuestionResult` + `scheduleSrsForAnswer`，practice 仍跑，無誤殺
- [x] 1.3 把 `OverviewPage` 的 `examModeButton`（CTA）+ `expeditionMenu==='exam'` picker JSX + handlers（`openExamMode` / `chooseExamPaper` / `examPapers`+`examSetPool` memo / exam-exclusive styles）移除（共用的 `examMenu*` settlement styles 保留）
- [x] 1.4 在 `QuestionBankPage` 做放大的模考入口；選卷後以 `practice` 開 `QuizModal`（`preserveOrder`、**無 `onComplete`** ⇒ 不 credit DMN；per-冊 unanswered pool 複用 `listExamPapersWithCoverage` / `buildExamSetExpeditionPool`）
- [x] 1.5 首頁 CTA toolbar 收斂為 🎲 隨機 + ⚔️ 錯題出征 兩顆；移除 `examModeButtonStyle` / `examModeSubStyle` 等 dead style

## 2. 遠征動畫 toggle 清理

- [x] 2.1 移除 `MazeGrid.tsx` 常駐「🚀 顯示/隱藏遠征動畫」header chip（保留 `expeditionHidden` state + band 條件渲染 + `getExpeditionHidden` 持久化）
- [x] 2.2 `MazeExpedition.tsx` 帶子 × 快速隱藏保留；× 的 title 改提示「可於說明選單 ❓ 恢復」
- [x] 2.3 在 `HelpMenu.tsx` 出征模式 section 加 `ExpeditionAnimationHelpControl` 復原控制（讀寫同一 `getExpeditionHidden` 偏好）；順手修該 section stale 文案（模考已非出征、不再發 DMN）
- [x] 2.4 閱讀帶 caption 對齊「探索迷宮」敘事（神經元遠征隊・探索迷宮中…）；自動顯示時機不變（出征 + 閱讀）

## 3. 走迷宮可見度（optional）

- [ ] 3.1 （optional, SKIPPED）「正在前進」micro-cue；現況已有 EnergyFeedbackStrip walker-advance tween + MazeCompletionCelebration，dogfood 後再定

## 4. 驗證

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw test`（492/492）+ typecheck 全綠
- [x] 4.2 Chrome MCP 端到端（localhost:5175）：(a) ✓ 題庫 tab 模考 picker(46 卷) → 選卷答題；8 答(含 2 對) → **energyΔ=0 / variantΔ=0 / historyΔ=8**（答對不漲能量/不抽變體、答錯入 everWrong 錯題池）；(b) ✓ 首頁 CTA 只剩 🎲 + ⚔️、無 📋 模考、無遠征動畫 toggle chip（band × 保留）；(c) ✓ HelpMenu 復原控制翻 state（隱藏→顯示）+ 持久化 `expeditionHidden` 0→1；(d) ✓ band 在 QuizModal + 首頁渲染（自動顯示時機碼未動）；(e) ✓ /bank + / 直接 URL render、console 0 error
- [x] 4.3 `openspec validate tidy-neurons-homepage-ui --strict` clean
- [x] 4.4 `/simplify`：4 agents（reuse/simplify/efficiency/altitude）→ 全綠，套用 1 處 altitude 強化（handleClose 自我強制「練習 ⇒ 不 credit DMN」，不靠 caller 省略 onComplete）；typecheck 仍 clean。`/verify` 端到端＝上方 4.2 Chrome MCP
