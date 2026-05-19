## Context

二階 (`apps/medexam2-hospital-tw`) 已上線 M4 雲端同步 + M4.5 bug report，玩家持續累積對戰紀錄。已存在的 surface：

- **手動收藏**：`/bookmarks` 頁、`question_bookmarks` 表（Supabase + IndexedDB `bookmarks` store）、`BookmarkButton` 在 `QuizModal` 內 toggle
- **SRS due queue**：演算法主動推送「該複習什麼」，由 `srs_cards` 表 + due-date 排程
- **Attempt history**：`hospital_question_history` 表完整保存每次 quiz attempt（含 result）

玩家回報 gap：「答錯的題我不總是會記得按 ★，但又想回頭翻」。新功能要填這個 gap 但**不能跟 SRS 重複**（SRS 已在做主動複習排程），所以定位是「被動瀏覽清單」、跟 SRS 雙軌。

二階是 dogfood-the-fork track，本 change 只做二階；一階沒手動收藏 infra，待二階驗收後另開 change port 一階。

完整需求釐清軌跡見 `~/.claude/scratch/grilled-錯題功能設計-融入收藏題目-2026-05-19.md`。

## Goals / Non-Goals

**Goals:**
- 自動追蹤玩家在二階 hospital quiz 中**最近一次答錯**的題（答對即離開）
- 在 `/bookmarks` 頁加 tab `[手動收藏 | 錯題]`，預設 landing tab 為「手動收藏」
- 兩 tab 共用既有 `ExplanationMarkdown` render 邏輯 + Markdown 匯出 + 「題目不在題庫」stub 行為（不重複造輪）
- 在錯題 tab 頂部固定 helper 一行，揭露 ephemeral 性質 + 引導 promote
- 在 `QuizModal` 答錯回饋區加 inline ★ 按鈕，讓玩家當下決定永久收藏
- 在 `SettingsPanel` 加「匯入過往答錯」按鈕，從 `hospital_question_history` backfill
- 走既有 cloud-sync LWW + RLS infra，不引入新 sync pattern

**Non-Goals:**
- 一階 `medexam-tw` 的錯題功能（先 dogfood 二階）
- 把 SRS due queue 跟錯題清單合併（兩者刻意分軌）
- 累積式錯題（「歷史所有答錯」）— 設計就是 ephemeral 自動進出
- 錯題清單的演算法排序 / 重要性權重（純按 `last_wrong_at` 倒序）
- 跨 question version / corpus 變動的 migration 邏輯（沿用既有 bookmarks 處理 `題目已不在題庫` stub 的做法）

## Decisions

### Decision 1: 錯題狀態 = 最近一次 attempt 結果，自動進出

**選**: 玩家答錯 → 加入錯題清單；下次答對同一題 → 自動從錯題清單移除。狀態 = 最近一次 attempt result。

**為什麼**:
- 跟 SRS mastery 演算法解耦（不需要等 SRS 算出「掌握了」才移除）
- 玩家心智模型直觀：「我最近答錯的」= 此刻 ephemeral 狀態
- 資料模型最簡：一筆 row = `(user_id, question_id, last_wrong_at)`，沒 `attempt_count` / `consecutive_correct` 等延伸欄位

**Alternatives 考慮過**:
- A. 累積式（答錯就永遠在）→ 否決，清單會爆量 (上百題)，且跟「ephemeral」UX 衝突
- B. 跟 SRS mastery 連動（演算法判定掌握才移除）→ 否決，過度耦合 + 玩家不直覺
- C. 答錯次數 > 答對次數才算錯題 → 否決，計算成本高 + 玩家難解釋

### Decision 2: Schema 選 C 變體（local-only derived view over hospital_question_history）

**選**: 不新增任何 cloud table。「錯題」清單是 `hospital_question_history` 的 derived view (`WHERE lastResult = 'wrong'`)，UI 直接讀 history 並 filter。Dexie 端只加 `[lastResult+lastAnsweredAt]` compound index 讓 read-time filter 用 index、不走 full scan。

**為什麼 (apply 階段 spike 後 pivot)**:
- 初次 spike B 變體（獨立 `question_wrong_answers` table）撞到 **現有 sync engine 的 delete-not-synced limitation** (`engine.ts:95-99` — "Deletes aren't synced yet (Postgres would need a tombstone column)"). 意味著：
  - Device A 答錯 Q_W → push 到 cloud ✓
  - Device B 答對 Q_W → local delete 但 **cloud row 不被刪**
  - Device A pull → 又看到 Q_W 在錯題清單（false positive）
- 「答對自動移除」是錯題功能最核心的 UX 契約，cross-device 失效會讓功能感受破碎
- **質疑「為何需要單獨 cloud table」**：wrongAnswers 本質是 hospital_question_history 的 materialized view。history 已 sync via LWW，從 history derive 等於自動繼承 cross-device consistency
- Pivot 後架構：
  - 無新 cloud table（無 migration 0010/0011）
  - 無新 Dexie store
  - Quiz trigger 不變（既有 `recordCorrectAnswer` / `recordWrongAnswer` 在 mastery.ts 已寫 `lastResult` 進 history）
  - 「錯題」tab = `useLiveQuery(() => db.questionHistory.where('[lastResult+lastAnsweredAt]').between(['wrong', minKey], ['wrong', maxKey]).reverse().toArray())`
  - Cross-device：device B 答對 → history `lastResult = 'correct'` push 到 cloud → device A pull history → device A 的 derived 錯題清單自動 filter 掉 Q_W ✓
- **Backfill 不需要** — 任何時候 wrongAnswers 已是 history 的即時投影，沒「過往 vs 新」之分

**Trade-offs**:
- ✅ 架構最乾淨：source of truth 唯一（hospital_question_history）
- ✅ Cross-device consistency 免費
- ✅ 完全無 schema migration（DB + 0 SQL files）
- ✅ 新裝置 sign in 一 pull history 就有完整錯題清單（自動 hydrate via history sync）
- ❌ 失去獨立 sort key `last_wrong_at`（要靠 `lastAnsweredAt` 排序 — 但 lastResult = wrong 時 lastAnsweredAt 就是 last wrong at，等價）
- ❌ Compound index 約增加 IDB 儲存 ~5%，可接受

**Alternatives 考慮過 (其中兩個原本是主選)**:
- A 變體（共用 `question_bookmarks` + `is_manual` flag）→ 否決：composite PK 動到 + trigger case-by-case
- B 變體（獨立 `question_wrong_answers` table）→ apply 階段 spike 後否決：delete-not-synced limitation
- D 變體（B + tombstoned bool flag 軟刪除）→ 否決：增加 schema 複雜度為 sync engine 設計缺陷打補丁，stale tombstone row 長期累積

**遺留改動**：原本寫好的 `supabase/migrations/0010_question_wrong_answers.sql` + `0011_upsert_lww_wrong_answers.sql` + `supabase/sanity/question_wrong_answers_rls.sql` 在 pivot 時刪除（git history 仍可 trace 設計演進）。

### Decision 3: Quiz answer trigger — 不需新 trigger（既有 history 寫入即足）

**選**: 沿用既有 `recordCorrectAnswer` / `recordWrongAnswer` (`apps/medexam2-hospital-tw/src/lib/mastery.ts`) 寫 `lastResult` 進 `hospital_question_history` 的行為。**不加任何新副作用**。錯題狀態由 history `lastResult` 唯一決定，UI 在 read time derive。

**為什麼**:
- Pivot 為 derived view 後，錯題清單不是獨立 storage、是 query view
- 既有 `upsertHistory(record, wasCorrect)` 已寫 `lastResult: 'correct' | 'wrong'` → 自動驅動 UI live query
- 0 行 quiz logic 改動，全部 surface 在 read 端

**Alternatives 考慮過**:
- 加 `db.wrongAnswers.put / delete` trigger → pivot 前的設計，廢棄
- Dexie hook 自動同步 wrongAnswers ↔ history → 過度複雜，read-time filter 已夠快

### Decision 4: UI — 雙 tab 而非子分類 filter

**選**: `/bookmarks` 頁 top-level 雙 tab `[手動收藏 | 錯題]`，預設 landing tab = 手動收藏。tab 切換用 query string (`?tab=wrong` / `?tab=manual`) 以支援深 link 跟 F5 reload。

**為什麼**:
- 數量級不同：手動收藏 ~ 0–20 題、錯題 ~ 0–數百題。混顯會讓手動精選被淹沒
- 操作 affordance 不同：手動可一鍵移除、錯題自動進出
- 心智模型清楚：tab = 「兩種不同來源」、子分類 filter = 「同池打標籤」；前者貼近現實
- 共用一個 page route (`/bookmarks`)，玩家不需要記兩個 URL
- query string tab 讓深 link 可分享：`/bookmarks?tab=wrong` 可從 Discord 等外部點進

**Default landing 為什麼是手動收藏不是錯題**:
- 手動收藏是玩家「主動意圖」的清單，打開 `/bookmarks` 最常見的意圖
- 錯題清單若 default landing，第一次裝 app 的新用戶看到空狀態會困惑
- 玩家想看錯題會明確點 tab — 一次點擊成本可接受

### Decision 5: Promote 路徑 — 兩個 surface 互補

**選**: 同時做兩個 surface 讓玩家把錯題 promote 成手動收藏：
- **A. 錯題 tab 頂部 helper text**（固定一行 banner）：
  > 📌 錯題 = 你最近一次答錯的題。下次答對會自動離開此清單。  
  > 想永久保留？點任一題的 ★ 加入手動收藏。
- **B. 錯題 tab 內每筆 item 加 ★ toggle**（跟手動收藏 tab 內的 ★ 視覺一致）
- **C. `QuizModal` 答錯回饋區 inline ★ 按鈕**：當下決定要不要也加進手動收藏

**為什麼**:
- A 解釋「為什麼這題會消失」的 ephemeral 性質（防止玩家以為 bug）
- B 是 tab 內 in-place promote，瀏覽 to 收藏一鍵化
- C 是 quiz 進行中的 ahead-of-time promote，避免「答對後想反悔但已消失」

**Alternatives 考慮過**:
- 只做 A + B（沒 C）→ 否決，玩家答完該題後可能不會回 /bookmarks 翻，永遠失去 promote 時機
- 只做 C（沒 A + B）→ 否決，沒解釋 ephemeral 行為，且錯過 quiz 當下就沒第二次機會
- toast/snackbar 取代 helper text → 否決，toast 會消失，helper 要常駐才達成「揭露定義」目的

### Decision 6: Backfill — 不需要（derived view 自然涵蓋所有歷史）

**選**: 不做 backfill button。

**為什麼 (pivot 後)**:
- 錯題清單 = `history.lastResult === 'wrong'` 即時查詢，不存「現在開始才追蹤 vs 過去」之分
- 任何曾經答錯且最新一次仍為 wrong 的題，**自動**出現在錯題清單
- 新裝置 sign in pull cloud history → 錯題清單自動 hydrate
- 原本「opt-in backfill」是為了 fresh-add table 後同步歷史；現在無新 table，這個動作不存在

**遺留改動**：原本規劃的 `SettingsPanel` 「匯入過往答錯記錄」按鈕從 tasks.md 移除。

### Decision 7: 跟 SRS due queue 的邊界

**選**: 兩者完全獨立，UI 不互相連結。SRS due 是「演算法說該複習」、錯題是「玩家最近答錯」。一題可能同時在兩個 list（最近答錯 + SRS 排到 due）也可能只在一個 list（答錯但 SRS 未到 due / SRS due 但最近答對）。

**為什麼**:
- 演算法 vs 玩家瀏覽是兩種不同 UX 模式 (push vs pull)
- 合併會讓 SRS 演算法被「玩家行為清單」污染、影響排程準確性
- 玩家若想知道兩者交集，未來可加 chip / badge 顯示「⚠ 此錯題今天也 SRS due」(本 change 不做)

## Risks / Trade-offs

- **Risk: 錯題清單爆量** → 玩家初期答錯率高（學習階段），可能累積上百題；UI scroll performance 受壓 → Mitigation: 預先用 react-window / virtualization；list 預設 sort `lastAnsweredAt desc` 讓最新答錯在頂

- **Risk: 同題在 quiz 同 session 內反覆答錯/答對 → 寫入過頻** → Mitigation: 既有 history sync 已走 3s debounce，無新 trigger 不增加負擔

- **Risk: 玩家以為錯題 = 不會的題 (其實是 careless mistake)** → 文案要說清楚 → Mitigation: helper text 措辭「最近一次答錯」而非「不會的題」；FAQ 補 Q

- **Risk: 答對自動移除讓玩家覺得「我還沒搞懂為何錯」就消失** → Mitigation: 由「★ promote 進手動收藏」decision 5 提供 escape hatch；helper text 主動引導玩家用 ★

- **Risk: Schema 走 B 變體之後若要支援 cross-list 操作（e.g. 「把所有錯題 batch promote 成手動收藏」）要 query 兩 table** → Mitigation: 該功能不在本 change scope；未來需要時加 service helper、不改 schema

## Migration Plan

1. **Dexie schema bump v11**（apps/medexam2-hospital-tw/src/db/schema.ts）
   - 加 compound index `[lastResult+lastAnsweredAt]` 到 `questionHistory` store
   - 無新 store、無 upgrade hook、純 index 加法
2. **Service layer**（`apps/medexam2-hospital-tw/src/services/wrong-answers.ts` 新檔）
   - `useWrongAnswers(): QuestionHistoryRow[] | undefined` — useLiveQuery filter history
   - 內部走 `db.questionHistory.where('[lastResult+lastAnsweredAt]').between(['wrong', minKey], ['wrong', maxKey]).reverse().toArray()`
3. **Quiz trigger 整合** — **沒有**，既有 `recordCorrectAnswer` / `recordWrongAnswer` 已寫 `lastResult` 進 history，自動驅動 live query
4. **UI tab 結構**（`apps/medexam2-hospital-tw/src/pages/BookmarksPage.tsx`）
   - 拆成 `BookmarksTabManual` + `BookmarksTabWrong` 兩 sub-component
   - URL query string `?tab=wrong` / `?tab=manual` (default = manual)
   - 錯題 tab 頂部 helper text 固定 banner
5. **Inline ★ 按鈕**（`apps/medexam2-hospital-tw/src/components/QuizModal.tsx`）
   - 答案揭曉區加 inline manual bookmark toggle (跟既有 corner toggle 共用 state)
6. **Smoke test**（Chrome MCP）
   - Full 4-step path（answer wrong → tab + helper → ★ → manual tab → answer right → wrong tab 消失 + manual 仍在）
   - F5 reload on `?tab=wrong` URL 不噴 404

**Rollback strategy**: 
- Code rollback：revert commit chain；Dexie schema 留新 index 不刪（IndexedDB rollback 不影響舊版讀取）
- 無 DB rollback 需要（無 Supabase schema 動）

## Open Questions

- **Tab 預設文案**：「手動收藏」/「錯題」是否最直觀？「我的收藏」/「答錯記錄」是 alternative；apply 階段最後 UI polish 確認
- **錯題 tab 空狀態文案**：「還沒答錯過任何題 🎉」+ CTA 引導去做 quiz？apply 階段補
- **Backfill UI 位置**：直接在 `SettingsPanel` 還是在 `/bookmarks` 錯題 tab 的設定 icon？apply 階段定
- **錯題 tab item 上的 ★ 視覺**：右上角 / 卡片底部 / 跟手動 tab 一致？apply 階段 UI polish
- **Quiz inline ★ 按鈕位置**：詳解區之前 / 之後？答錯時才顯示還是答對也顯示（答對也可手動收藏）？apply 階段定
