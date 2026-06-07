## 1. Answer-feedback emitter wiring (D2 foundation)

- [x] 1.1 新增 `lib/maze/answer-feedback.ts`，mirror `lib/maze/maze-focus.ts` 的 house pattern（module-level `Set` + best-effort try/catch + 回傳 unsubscribe）：匯出 `emitAnswerCorrect(familyId)` / `onAnswerCorrect` + `emitAnswerWrong(familyId)` / `onAnswerWrong`（純 in-memory，不寫任何 store）
- [x] 1.2 在 `lib/services/connectome.ts` 的 `recordCorrectAnswer` 末尾 emit `emitAnswerCorrect(familyId)`、`recordIncorrectAnswer` 末尾 emit `emitAnswerWrong(familyId)`（emitter 自身已 per-listener try/catch；呼叫不阻斷答題主流程）
- [x] 1.3 確認 emit 不需任何 Dexie/R2 寫入；跑 `pnpm --filter @study-rpg/neurons-tw typecheck` 確認型別通過

## 2. DMN consumable activation burst (item 2)

- [x] 2.1 在 `components/BackpackPanel.tsx` 的 `activateConsumable` 成功路徑加一次性 burst overlay（`ParticleBurst`），用 component-local nonce 觸發，reduced-motion 由 ParticleBurst 自身 null
- [x] 2.2 失敗路徑（無 stock / pool 空）不播 burst；活化結果（stock 扣減 + buff）行為不變

## 3. Leaderboard rank-up feedback (item 3 + 併入 item 1 的 rank count-up)

- [x] 3.1 在 `routes/LeaderboardPage.tsx` 用 `useRef`（per-filter）記住上一次「我的排名」；snapshot refresh 時把 rank 數字改用 `NumberTickUp` 從 prevRank tween 到 newRank
- [x] 3.2 newRank < prevRank（名次進步）時疊一次 `CelebrationHalo`；首次載入（無 prevRank）不放煙火；切 tab 不誤觸（per-filter ref）

## 4. Route transition — 神經訊號 wipe (item 4)

- [x] 4.1 在 `App.tsx` 新增 `AnimatedRoutes`（`useLocation`），用 `AnimatePresence mode="wait"` + `motion.div` keyed by `location.pathname`，入場 opacity + 輕微 x slide（≤12px，duration 0.2s）
- [x] 4.2 reduced-motion（framer `useReducedMotion`）→ 降為純 opacity 短淡入（0.12s）
- [ ] 4.3 dev 跑 SPA 三件套（in-app nav + 直接 URL + F5）確認 route 結構沒壞（prod 驗證在 §9.5）

## 5. Wrong-answer synapse-decay cue on expedition band (item 5 二次重定向 → band)

- [x] 5.1 在 `components/MazeExpedition.tsx` subscribe `onAnswerWrong`，對 band 放一次 synapse-decay 微暗（`.exp-decay` overlay），animationDuration 複用 `SYNAPSE_TIMINGS.decay`；reduced-motion 略過（render-gate + @media）
- [x] 5.2 確認 cue 純視覺：不扣 energy / mastery / node-lit state；答對不觸發 decay；pointer-events none

## 6. Companion correct-answer reaction (item 6)

- [x] 6.1 在 `components/MazeExpedition.tsx` subscribe `onAnswerCorrect`，對 companion marcher 放一次 `.exp-comp-pulse` glow（與 `exp-bob` 不打架、絕對定位 overlay）
- [x] 6.2 無 companion 時 no-op（pulse 只 render 在 companion 分支）；reduced-motion 略過

## 7. Walker easing tween (item 7)

- [x] 7.1 在 `components/maze/MazeGrid.tsx` 加 `walkerRenderRef`，draw loop 用 MAZE-space 指數平滑（k=0.18）ease 到 `fam.walkerCell` 再套相機 transform（不在 screen-space 加 CSS transition，避免 walker 落後相機 pan/zoom）
- [x] 7.2 reduced-motion → k=1 瞬時定位；ease 在相機 transform 之前，zoom/pan 期間 walker 不落後

## 8. Reduced-motion + zero-schema discipline (D6)

- [x] 8.1 §2–§7 所有新動畫都經 reduced-motion gate（ParticleBurst/CelebrationHalo/NumberTickUp 自身 gate；band overlays render-gate by `useRespectsReducedMotion` + @media；route 用 framer `useReducedMotion`；walker k=1）
- [x] 8.2 `pnpm lint:dexie-fixtures` → `[lint:dexie] OK`（0 觸發，無 schema bump）
- [x] 8.3 `git status` 確認未碰 `db.ts` / `sync/` / `packages/` / `cloudflare/`（只 6 改 + 1 新檔）

## 9. Verify & QA

- [x] 9.1 `pnpm --filter @study-rpg/neurons-tw typecheck` 通過 + `test` 408 passed（含新 `answer-feedback.test.ts` 3 例）
- [ ] 9.2 （選配，skip）`/motion-demo` 加變體按鈕 — 既有 primitive 已在 demo，新接線靠 live smoke 驗
- [ ] 9.3 Chrome MCP dev end-to-end：答對 → 夥伴 pulse；答錯 → band decay；啟用消耗品 → burst；排名 tween（+halo）；walker easing；route wipe
- [ ] 9.4 跑 `/simplify`（code-touching）清理 + 確認無新增 orphan import/var
- [ ] 9.5 部署後（與 Pack 1 一起 merge→main）在 **prod** 重跑 SPA 三件套（in-app nav + 直接 URL + F5）+ 上述 end-to-end spot-check
