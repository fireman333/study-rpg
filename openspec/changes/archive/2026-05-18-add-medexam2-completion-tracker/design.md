## Context

二階 medexam2-hospital-tw quiz 路徑目前架構：

- [QuizModal.tsx:54-93](apps/medexam2-hospital-tw/src/components/QuizModal.tsx:54) 的 `loadNextQuestion` 一定先 walk `getNextDueCardForSubject` due queue，cap 用完才 fall through 到 `pickRandomQuestion`
- [quiz.ts](apps/medexam2-hospital-tw/src/lib/quiz.ts) 透過 `_packPromise` cache `bySubject: Map<SubjectId, Question[]>`（playable pool 已扣 `hasOptionImages`）
- [RecruitmentBanner.tsx:52-56](apps/medexam2-hospital-tw/src/components/RecruitmentBanner.tsx:52) 已有 `🔴 N due` chip pattern + `.banner__due-chip` CSS（[styles.css:1139](apps/medexam2-hospital-tw/src/styles.css:1139)）
- HomePage 透過 `useLiveQuery` 拿 affinity / mastery / dueCountMap 餵 14 個 banner

Phase 1 設計約束：(a) 零 Dexie schema 變動；(b) 不動 cloud sync table；(c) 跟 Phase 2 mania mode 的經濟重設計解耦，方便獨立 ship 後 dogfood。

## Goals / Non-Goals

**Goals:**
- 玩家在 HomePage 一眼看到每科覆蓋率（`✅ X / Y` chip 在 banner 上）
- 玩家可在 QuizModal 內一鍵跳過 SRS due-first，純隨機刷新題
- 玩家把某科 unique 題庫掃完時收到一次性 toast，不打斷流程

**Non-Goals:**
- 不引入新經濟（不改 revenue / reputation / salary 公式）
- 不引入專屬 mania UI（不做題庫 grid / coverage heatmap）
- 不持久化 toggle 狀態（modal 開合一次重設）
- 不改 SRS scheduler 本體（`srs-scheduler.ts` 不動）
- 不調整 facility tier 升級條件

## Decisions

### D1: completion-map 走 live query + 一次性 batch

**選項**：
- (a) 每個 RecruitmentBanner 各自跑一次 `db.questionHistory.where('subjectId').equals(s).count()` → N+1 queries（14 次 IDB round-trip）
- (b) HomePage 跑一次 `db.questionHistory.toArray()` 然後在記憶體 groupBy → distinct by `questionId` per subject，配 `bySubject` size 做出 `Map<SubjectId, {answered, total}>` 餵 banner

**決策**：選 (b)。questionHistory 預期規模 ~hundreds–few-thousand 列，一次 toArray + Map.reduce 比 14 次 IDB count 快且 cache 友善。`useLiveQuery` 自動 invalidate on write，無須手動 subscribe。

### D2: distinct counting 取 `questionId` 不取 row count

每題可能多次作答（attempts > 1），但「覆蓋率」應是 unique question 觸及數，不是答題次數。helper 用 `new Set<string>()` 收 distinct `questionId` per subject。

**Edge case**：questionHistory 含 orphan row（content pack 升版後 questionId 不在 corpus）— 仍計入分子。理由：分子 cap 在分母（pool size）以內理論上不會超過，orphan 真的把分子撐爆才考慮反向過濾。Phase 1 先不過濾，dogfood 看實際發生率。

### D3: Skip SRS toggle 只在 modal 生命週期內

**選項**：
- (a) 寫進 `playerPreferences` Dexie table（持久化）
- (b) 只用 `useState`，每次開 modal 都重設成 `false`

**決策**：選 (b)。Phase 1 是探索期，不想為了 toggle 開新 table；玩家每次開 modal 預設先吃 SRS due（這是正常 learning loop），刻意要 grind 才手動勾。如果 dogfood 後玩家抱怨「每次都要重勾」再加持久化。

### D4: exhausted toast 用 component-level ref

**選項**：
- (a) Toast emit 跨 modal 開合都記住（寫 `sessionStorage`）
- (b) Toast 只在當前 modal session 內記，re-open modal 同科會再 emit 一次

**決策**：選 (b)。理由：玩家關了 modal 再開很可能是因為想換策略（例如改勾 toggle）— 再提醒一次「已掃完」反而 helpful。用 `useRef<Set<SubjectId>>` 在 QuizModal 內追蹤，state lifetime = modal mount lifetime。

### D5: chip 配色用既有 token

`.banner__due-chip` 用紅色系（提醒「待複習」）；completion chip 改用綠色系 `var(--color-success)` 或既有 mastery 達標色（看 styles.css token 命名）。Icon 用 ✅ 區隔 🔴。100% 完成時 chip 改用金色 + 🏆，讓玩家有「整科掃完」的成就感（純視覺，不發放獎勵）。

### D6: `getPoolSize` 暴露方式

quiz.ts 已 cache `bySubject`。新增 export `loadPoolSizeMap(): Promise<Map<SubjectId, number>>`，內部從 `bySubject` derive。HomePage `useEffect` 載入一次（pool size 在 runtime 不變），跟 `useLiveQuery(questionHistory)` 結果合併。

## Risks / Trade-offs

- **[questionHistory toArray 在大資料下慢]** → Mitigation：規模 ~3K row 上限（playable pool 大小），單次 toArray < 50 ms（Dexie benchmark 一般 < 10 ms / K rows）。Phase 1 先 ship，dogfood 量起來再 profile
- **[Skip SRS toggle 玩家誤勾長期不關，SRS due 累積]** → Mitigation：toggle 圖示旁加小字 `（不影響 SRS 排程，到期題仍會記）`。Toggle 影響的只是「下一題哪裡來」，不影響 due card 加入 backlog
- **[exhausted toast 反覆 fire 騷擾]** → Mitigation：用 `firedSubjectsRef.current.has(subjectId)` gate；只在當前 modal session 各科首次觸發
- **[100% chip 金色看起來像 cosmetic 解鎖]** → Mitigation：純 banner 內視覺，不發 toast / 不寫 monoCounters，不會跟 cosmetic milestone 系統混淆
- **[Phase 2 mania mode 上線後 toggle 設計過時]** → Acknowledged trade-off。Phase 2 propose 時若決定走「mania mode toggle 全域接管 quiz 流程」，本 toggle 可能被 replace；Phase 1 ship 完 dogfood 一週才動 Phase 2，contract 改動風險可控

## Migration Plan

- 無資料庫 migration、無 schema 變動
- Rollback strategy：revert 該 commit 即可；既存 questionHistory 不受影響
- Cloud sync：完成度純 derived value，不寫雲端；user 跨裝置看到的數字會在 push/pull 完 questionHistory 後自動正確

## Open Questions

- 100% chip 金色 → 是否 emit 一次性「整科掃完」toast（不發獎勵，純慶祝）？**預設 no**，避免跟 exhausted toast 重複；Phase 2 mania mode 可考慮接 reputation milestone
- exhausted toast 用詞要不要區分「真的掃完」vs「seenIds 滿 3 次 re-roll fall through」？**預設不區分**，玩家視角都是「在看重複題了」；技術上 `pickRandomQuestion` 已用 `seenIds.size >= pool.length` 判定，Phase 1 就靠這條
