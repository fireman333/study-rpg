## 1. Service — 修補池重定義（讀 flags）

- [x] 1.1 在 `apps/neurons-tw/src/lib/services/prescription.ts` 為 `buildPlan` 新增純入參 `flagsByQuestion: Map<string, { easyMarked: boolean; guessedMarked: boolean }>`（mirror 現有 `history` 餵法，不在 `buildPlan` 內做 I/O）
- [x] 1.2 修補池計算改為 `( lastResult==='wrong' ∪ guessedMarked ) − easyMarked`：`wrongIds` 併入 `guessedMarked` 為 true 的 questionId、再剔除 `easyMarked` 為 true 的；`computeWrongTarget` 吃這個修補池大小
- [x] 1.3 開發線 unseen pool 剔除 `easyMarked`（`unseenByFamily` 建構時排除已標 easy 的題）
- [x] 1.4 impure `getOrCreateTodayPlan` 多抓 `db.questionFlags.toArray()` → 組 `flagsByQuestion` map，傳入 `buildPlan`

## 2. Service — 年份聯動 + fallback + plan 快照

- [x] 2.1 `buildPlan` 新增純入參 `yearSet: Set<number>`；對 `pool` 依 `q.meta.year ∈ yearSet` 過濾後再算 unseen/total/coverage（開發線完全 scoped）
- [x] 2.2 修補線 scoped-first：先取 `yearSet` 內修補題；範圍內為空才 fallback 全年份（`repairIds = repairScoped.length ? repairScoped : [...repairAll]`；fallback 由測試以 ids 驗證，無需持久旗標）
- [x] 2.3 `PrescriptionPlan` 型別新增 `yearScope: number[] | null`（`null`＝全選）；`buildPlan` 快照當下 effective set（等於 `ALL_YEARS` 時存 `null`）
- [x] 2.4 impure 層用 `effectiveYearSet(await getYearFilter())`（`apps/neurons-tw/src/lib/services/year-filter.ts`）取得 `yearSet` 傳入；讀舊 plan 缺 `yearScope` 時視為 `null`（reader tolerance）

## 3. UI — DailyPrescriptionCard reframe + range chip + copy-softening

- [x] 3.1 `apps/neurons-tw/src/components/DailyPrescriptionCard.tsx`：訂正線 label 改「修補連結（今日無待修補連結）」framing
- [x] 3.2 開發線 UI label「盲區」→「開發新連結」（變數名維持 `breadth`）
- [x] 3.3 新增低調 range chip：`plan.yearScope` 為 strict subset 才顯示（「依目前年份範圍穩定練習 · 113–114」）；全選/`null` 不顯示
- [x] 3.4 飢餓 fallback 文案：範圍內盲區抽完→「範圍內連結已巡過 ✓」；兩池皆空→completed 態改「範圍內今日已巡過 · 可於上方放寬年份，或今日到此為止」（絕不「沒題目可做」）
- [x] 3.5 copy-softening：不外露修補/錯題池原始總數（只顯示 done/target）；accuracy 低導致 N 縮減無歸因文案；無 snapshot/鎖定/防作弊字樣與 missed-day calendar

## 4. UI — QuizModal 訂正回饋 reframe

- [x] 4.1 `apps/neurons-tw/src/components/QuizModal.tsx`：處方箋修補題答對當下顯示 scoped「🩹 連結已固化」note（`recordPrescriptionAnswer` 回傳 `repairConsolidated`；僅處方修補命中才顯示，不動 mock/題庫 共用的「答對/答錯」verdict）
- [x] 4.2 保留共用 verdict 誠實（mock realism）；「修補中/已固化」framing 走處方箋卡 + scoped note，純 derived、無新持久狀態

## 5. Tests（Vitest）

- [x] 5.1 修補池集合運算：`(wrong ∪ guessed) − easy`（guessed-correct 進池、easy 出池、wrong∩easy 出池）
- [x] 5.2 N-scaling 吃修補池大小（含 guessed 併入後 N=2）
- [x] 5.3 year-scope：開發線 unseen/total 只在 `yearSet` 內計算；修補線 scoped-first + 空則 fallback 全年份（以 out-of-scope id 出現在 repair pool 驗證）
- [x] 5.4 plan 快照 `yearScope`（subset 存值、全選存 `null`）；`getOrCreateTodayPlan` 整合年份 filter
- [x] 5.5 first-access 凍結在新 pool 定義下仍成立（既有 freeze 測試綠）
- [x] 5.6 飢餓 fallback 分支：scoped 無新連結家族→`breadthTarget 0`（line 顯示滿足、CTA 不 route 到 null family）

## 6. Verify

- [x] 6.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` 全綠（803 tests / 105 files）
- [x] 6.2 Chrome MCP smoke（real browser, localhost dev）：boot 無 console error；卡片顯示「修補連結」+「開發新連結」（0「開發盲區」）；全選年份→無 range chip；設 [114,113]→`plan.yearScope=[114,113]`、range chip「依目前年份範圍穩定練習 · 113–114」、盲區家族 scoped、修補 target scoped。（「已固化」note trigger 由 `repairConsolidated` 單元測試覆蓋；dead-state fallback 由 breadthTarget=0 單元測試覆蓋。測試後已還原 dev DB 為 all-years。）
- [x] 6.3 確認無 Dexie `.version()` bump、無 R2 `SCHEMA_VERSION`/`SYNCED_META_KEYS` 改動（grep 驗證：0 additions）
