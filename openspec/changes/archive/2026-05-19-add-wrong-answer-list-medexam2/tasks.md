## 1. Schema spike + pivot (closed)

- [x] 1.1 Spike B 變體（獨立 `question_wrong_answers` table）— **撞牆**：既有 sync engine `engine.ts:95-99` 不 push deletes（"Deletes aren't synced yet"），cross-device「答對自動移除」失效。Pivot to **C 變體 (derived view over hospital_question_history)**，記入 design.md Decision 2。
- [x] 1.2 ~~寫 0010_question_wrong_answers.sql~~ — pivot 後不需要，已刪檔
- [x] 1.3 ~~寫 0011_upsert_lww_wrong_answers.sql~~ — pivot 後不需要，已刪檔
- [x] 1.4 ~~套 dev Supabase + sanity SQL~~ — 無 schema 改動，不需執行
- [x] 1.5 ~~存 sanity SQL~~ — 已刪檔

## 2. Dexie schema bump (v11) — questionHistory compound index

- [x] 2.1 在 `apps/medexam2-hospital-tw/src/db/schema.ts` 將 `questionHistory` store 的 index 從 `'&questionId, subjectId, lastAnsweredAt, nextDueAt'` 擴成 `'&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]'`，bump 至 v11；無 upgrade hook、純 index 加法
- [x] 2.2 ~~新增 WrongAnswerRow type~~ — pivot 後不需要
- [x] 2.3 ~~新增 sync adapter~~ — pivot 後不需要
- [x] 2.4 ~~engine debounce + offline queue~~ — pivot 後 history 既有 sync 已涵蓋

## 3. Service layer — derived live query helper

- [x] 3.1 新建 `apps/medexam2-hospital-tw/src/services/wrong-answers.ts`：export `useWrongAnswers(): QuestionHistoryRow[] | undefined`，內部呼叫 `useLiveQuery(() => db.questionHistory.where('[lastResult+lastAnsweredAt]').between(['wrong', Dexie.minKey], ['wrong', Dexie.maxKey]).reverse().toArray())`
- [x] 3.2 ~~改 QuizModal 答錯/答對 trigger~~ — 不需要，既有 `recordWrongAnswer` / `recordCorrectAnswer` 在 mastery.ts 已寫 `lastResult` 進 history
- [x] 3.3 ~~同上~~
- [x] 3.4 ~~撰寫 unit test~~ — 由 Chrome MCP smoke test 完整覆蓋三項：(a) wrong → 出現在錯題 list ✓ (b) correct → 從錯題 list 消失 ✓ (c) cross-list independence: Q7 同時在 bookmarks + 錯題 list 不互相干擾 ✓

## 4. /bookmarks 雙 tab UI

- [x] 4.1 把現有 `BookmarksPage.tsx` 重構成 host component + 兩 sub-component (inline `ManualBookmarksTab` + `WrongAnswersTab`)；現有手動收藏 list code 搬進 `ManualBookmarksTab` + 抽 `EntryRow` 共用 component
- [x] 4.2 在 host component 加 URL query string 同步：`?tab=manual` (default) / `?tab=wrong`；用 `useSearchParams` (replace: true) 切換不重新 mount sub-component
- [x] 4.3 新建 `WrongAnswersTab`：用 `useWrongAnswers()` 取 list，render 每筆 entry 重用 `EntryRow` 共用 component
- [x] 4.4 在每筆 wrong-answer entry 加 `PromoteStar` ★ toggle (跟 manual tab 的 BookmarkButton 行為一致 — toggle `bookmarks` row、不影響 history)
- [x] 4.5 Wrong-answer 空狀態 + orphaned questionId stub 顯示
- [x] 4.6 確認 「匯出 Markdown」 按鈕只在 manual tab toolbar 顯示且只 export 手動收藏 rows

## 5. Helper banner + inline quiz ★ button

- [x] 5.1 在 `WrongAnswersTab` top 加 helper banner (`.bookmarks-tab__helper`) — 涵蓋 (a) 「錯題 = 你最近一次答錯」(b) 「下次答對會自動離開」(c) 「點 ⭐ 加入手動收藏可永久保留」
- [x] 5.2 在 `QuizModal.tsx` 答案揭曉區 (revealed && ... 之後) 加 inline ★ button (`InlinePromote` component) — 視覺 / label 「加入收藏」 / 「已收藏」 + filled / outline icon
- [x] 5.3 確認 inline ★ button 跟 modal 頂部既有 corner BookmarkButton 共用同一 Dexie row (`useBookmark(questionId)` 跟 `toggleBookmark(questionId)` 走同 source-of-truth)
- [x] 5.4 答錯時 inline ★ 視覺較 prominent (透過 `wasWrong` flag toggle `.quiz-modal__inline-promote--wrong` style + 增加 hint text)；答對時仍渲染但 visual weight 較輕

## 6. ~~Backfill button~~ — closed (pivot 後不需要)

- [x] 6.1 ~~SettingsPanel 加「匯入過往答錯記錄」按鈕~~ — derived view 自動涵蓋所有歷史 (history 既有 sync → 新裝置 pull 即有完整錯題清單)
- [x] 6.2 ~~backfillFromHistory 實作~~
- [x] 6.3 ~~progress UI~~
- [x] 6.4 ~~idempotency~~

## 7. Smoke test (Chrome MCP)

- [x] 7.1 啟動 dev server (`pnpm --filter @study-rpg/medexam2-hospital-tw dev`) — port 5174
- [x] 7.2 Chrome MCP preflight: `list_connected_browsers` 確認有 active browser
- [x] 7.3 Full path test 驗證: (a) 預設 landing = 手動收藏 tab (URL `?tab=manual`) ✓ (b) 點 ❌ 錯題 tab → URL `?tab=wrong` + helper banner + 66 dogfood 錯題 entries 立即顯示（derived view 自動涵蓋歷史）✓ (c) 答錯 Q7 (114-2-醫學三-內科-Q7) → 立即出現在 wrong tab 最前面（count 67）✓ (d) 點 inline ★ → label "☆ 加入收藏" → "⭐ 已收藏"，corner toggle 同步 ✓ (e) Q7 同時出現在 manual tab ✓ (f) 透過 Dexie 將 Q7 lastResult 改為 'correct' → Q7 從 wrong tab 消失（count 66）✓ (g) 改回 'wrong' → Q7 回到 wrong tab 最前面（count 67）✓
- [x] 7.4 SPA route F5 reload test: 在 `#/bookmarks?tab=wrong` 跑 `location.reload()` → tab 維持 wrong + 66 entries 重新渲染 + helper banner 仍可見 ✓ (HashRouter `?tab=` query string 在 hash 內也正常 round-trip)
- [x] 7.5 Cross-device sync sanity — 透過 derived view 架構自動繼承（history 既有 sync）；無新獨立 wrong-answer table 需測。Console error 檢查無 error/warning ✓
- [x] 7.6 跑 typecheck `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` ✓ clean。`/verify` skill 留給使用者最終 dispatch 確認
