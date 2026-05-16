## Context

二階 hospital mode 已有完整的 quiz pipeline（archived: `wire-hospital-quiz-ui`）：subject banner → quiz modal → answer → mastery + affinity 累積 + questionHistory 寫入。在 v4 schema migration 時就預留了 SRS 三個欄位 `nextDueAt: number | null / interval: number / easeFactor: number` 並在每次答題 stub-write `(null, 0, 2.5)`，但**沒有 scheduler 真正算這三個值**，也沒有任何 UI 把「該複習了」訊號 surface 給 user。

一階（apps/medexam-tw）有 `srs-queue` capability + `packages/core/src/lib/srs.ts`（0-5 quality input、harsh reset on lapse）。二階 quiz 是 binary correct/wrong input、要 partial reset、要跨 subject 跑 daily cap — 行為差異大到值得 new capability，但程式碼層共用 SM-2 純函式 OK。

**Stakeholders**: dogfood 是作者本人（醫五 / 2026 H2 一階國考考生）；二階主要 user 是 RA 期間或 PGY 期間想 prep 二階國考的 cohort。對非 CS 背景使用者，retention surface 設計要直觀（不像 Anki 介面那樣 intimidating）。

## Goals / Non-Goals

**Goals:**
- 接 binary-input SM-2 scheduler，每次答題依結果更新 `interval / easeFactor / nextDueAt`
- 在 subject banner 加「🔴 N due」chip，把複習壓力 surface 給 user
- 點 banner 進 quiz modal 時優先吐 due card（due 用盡才轉新題）
- 全 subject 加總 daily cap = 20，overflow carry forward
- 答對走 standard SM-2 (1d → 6d → ×EF)；答錯走 partial reset (interval ×0.5、EF ×0.85)
- Mastery / SRS 維持 independent metric，UI 並列顯示

**Non-Goals:**
- 不做 standalone `/#/review` route（夠 backlog 才升 hybrid）
- 不做 specialty match 1.5× reward（另一個 change 處理）
- 不做 mastery-aware SM-2 adaption（保持 standard SM-2）
- 不破壞既有一階 `srs-queue` capability 或 core `reviewCard()` API
- 不 schema migration（v4 預留欄位 sufficient）
- 不做 multi-step quality rating（純 binary correct/wrong）

## Decisions

### Decision 1: 新 `hospital-srs` capability vs extend 一階 `srs-queue`

**選**：new capability `hospital-srs`。

**Why**: 一階 `srs-queue` archived spec 8 reqs 已穩定，input model 是 0-5 quality + harsh reset；二階是 binary input + partial reset + daily cap + banner badge surface — 4 個維度都不同。Extend 會讓 spec 在大量 "if hospital mode then X else Y" 條件分支中失去 normative clarity。

**Alternative considered**: Shared lib + 2 capability（grill Q1 第三選項）— 用 SM-2 純函式在 core，spec 各自描述。其實 Decision 1 跟這個 alternative 一致（程式碼共用 + spec 分離），只是命名 angle 不同。最終選 "new capability" 框架，code 共用 lib 是 Decision 2 的問題。

### Decision 2: Code 重用 — extend core/srs.ts 還是 hospital 內建 SM-2

**選**：extend `packages/core/src/lib/srs.ts` 加新 export `reviewCardBinary({ correct, prev, now? })`。

**Why**:
- SM-2 公式是 engine-level pure function，未來 M3 npm publish `@study-rpg/core` 給 contributor fork 也用得到 binary SM-2 variant（不是所有考試 UI 都要 0-5 quality）
- 不動 existing `reviewCard()`、不 break 一階契約
- 二階 service 層只負責 daily cap + queue 組裝，不重寫 SM-2 公式

**API draft**:
```typescript
// packages/core/src/lib/srs.ts (additive)
export interface BinaryReviewInput {
  correct: boolean
  prev: { interval: number; easeFactor: number; nextDueAt: number | null }
  now?: number  // defaults to Date.now()
}
export interface BinaryReviewResult {
  interval: number       // days
  easeFactor: number
  nextDueAt: number      // ms epoch
}
export function reviewCardBinary(input: BinaryReviewInput): BinaryReviewResult
```

**Alternative**: 二階 內建 `apps/medexam2-hospital-tw/src/lib/srs-engine.ts` 完全寫死。Rejected：npm publish 後 third-party fork 的 hospital-style content pack 也得重寫一份 SM-2。

### Decision 3: Wrong-answer reset rule — partial 而非 harsh

**選**：partial reset
- `interval = max(1, prev.interval × 0.5)`
- `easeFactor = max(1.3, prev.easeFactor × 0.85)`
- `nextDueAt = now + newInterval × DAY`

**Why**: 養成型 RPG 的 game feel 跟 evidence-based Anki SRS 取捨。答錯一題就 interval 歸 0 對醫學生考前壓力下會有挫敗感（國考內容海量、錯題不可避免）；partial reset 保留 SM-2 的「答錯延遲下次出現」效果但不歸零。

**Alternative**: standard SM-2 again (interval → 0, EF -= 0.2) — Rejected，跟 game tone 衝突。Stay-in-place (interval 不變、EF *= 0.9) — Rejected，等於沒懲罰、SRS 失去 adaptive 效果。

**Tunable**: 兩個 constant (`0.5` 跟 `0.85`) 集中放在 `srs.ts` top of file，commit 註明「dogfood-tunable」；未來 telemetry 顯示 retention 不如 standard SM-2 時調整。

### Decision 4: Standard SM-2 expansion (1d → 6d → ×EF) on correct

**選**：standard。第一次答對 interval = 1d、第二次 = 6d、第三次起 `interval = prev × easeFactor`。

**Why**: Anki / SuperMemo 學界 baseline，未來引 evidence 容易；6066Q 雖然大、但二階考前 4–6 個月 horizon 足夠走完 SM-2 expansion；如 dogfood 顯示卡片到期密度太高再考慮 aggressive variant。

**Tunable**: 同樣兩個 constant (`1` 跟 `6` days) 集中放，後續可改 `[1, 10]` or `[4, 10]` aggressive variant。

### Decision 5: Daily cap policy — global, round-robin across subjects

**選**：
- `DAILY_CAP = 20` (全 subject 加總)
- Queue 組裝：每 subject 按 overdue days desc 排序內部 due cards → 全 subject round-robin pop 直到湊滿 20 或全空
- Banner badge 顯示「該 subject 在今日 cap 內的 due 數」(0..N)

**Why round-robin vs global flat sort by overdue days?**:
- Round-robin 保證即使內科有 100 due、其他科都 0，user 也會看到內科以外的科分到至少 1-2 名額（如果他們有 due）
- 純按 overdue days desc 排會讓單科有 100 張過期卡時直接佔滿 20 cap，其他科 due 全 carry forward 累積
- 養成 RPG 的 progression sense 要 multi-subject balance

**Alternative**: per-subject cap (每科最多 N) — Rejected，14 科 × 2 = 28 已超 20 全局心理上限；且某科爆量另一科空時浪費。

### Decision 6: Banner badge UX — `🔴 N due` chip 三態

- N = 0：不顯示 chip（banner 視覺乾淨）
- N >= 1：顯示「🔴 N」chip（N 顯示**該 subject 今日 cap 內的 due 數**，已 round-robin 分配後的）
- N > 99：顯示「99+」
- Chip 樣式：紅色背景、白字、小圓角；放 mastery chip 右側

**Click behavior**: 點 banner 仍走既有 flow（不獨立 click 在 chip 上）— 進 quiz modal，picker 自動 due-first。Chip 純視覺指示、不可單獨點。

### Decision 7: Due-first picker integration with existing `pickRandomQuestion`

**Flow**:
1. Quiz modal 開啟，subject = X
2. Service `srs-scheduler.getDueQueueForSubject(X)` 回今日該科 due card list (cap-aware, sorted by overdue desc)
3. 若 due list 非空 → pop 第一張、用 questionHistory.questionId 從 content pack 撈 Question；走既有 quiz modal flow
4. 若 due list 空 → fallback `pickRandomQuestion(X, seenIds)` 抽新題（既有邏輯）

**SeenIds 處理**: due card 不進 seenIds（讓 user 在 session 內可重複看同一張 due），新題進 seenIds 避免本 session 重複。

### Decision 8: SRS / mastery / specialty match 解耦

- Mastery 仍由 `lib/mastery.ts` `recordCorrectAnswer / recordWrongAnswer` 更新（cumulative correct/total 計數）
- 同一函式內 + 同一 transaction 順手呼叫 `reviewCardBinary()` 算新 SRS 值、寫回 questionHistory
- Specialty match 1.5× reward 不在本 change scope；本 change 寫的 hospital-srs spec 明示「SRS 公式不受 doctor specialty 影響」

## Risks / Trade-offs

1. **[Partial reset 偏離 Anki SM-2 evidence base]** → Mitigation: spec 寫明此設計取捨、constant 集中放方便調；commit 訊息標記「dogfood-tunable」；M3 npm publish 時 `@study-rpg/core` 同時 export `reviewCardBinary({ resetMode: 'harsh' | 'partial' })` 給 fork 選

2. **[Round-robin queue 在某科 due >> 其他科時仍可能感覺 unfair]** → Mitigation: dogfood 觀察一週後若仍痛點，加 priority weighting (overdue days × subject_priority)；M6 social leaderboard 不在 scope，目前 user 只跟自己比

3. **[Daily cap = 20 可能對輕度 user 太多、對重度 user 太少]** → Mitigation: 20 是 first-iteration baseline；spec 寫明 cap value 為 dogfood-tunable；未來 propose `wire-hospital-srs-adaptive-cap` 依使用者過去 7 天 quiz 完成數動態調整

4. **[`reviewCardBinary` 跟 existing `reviewCard` 並存可能讓 maintainer 混淆哪個用在哪]** → Mitigation: `srs.ts` 開頭加 file-level docblock 講「`reviewCard` = 一階 0-5 quality / `reviewCardBinary` = 二階 binary input / `dueCards` = 通用 due filter」；M3 npm publish docs 明示兩變體 use case

5. **[Mastery / SRS 兩 metric 可能讓新 user 看 banner 混亂（「掌握 50%」+「🔴 5 due」哪個重要？）]** → Mitigation: dogfood 觀察；若反饋混亂可加 tooltip 或 onboarding screen 解釋兩者語義（不在本 change scope）

## Migration Plan

無 schema migration。Deploy 後既有 dogfood 存檔的 questionHistory rows `nextDueAt: null / interval: 0 / easeFactor: 2.5`（純初始值）會在下次答題時被 scheduler 寫真值。User 視角：deploy 後幾天內 due queue 從零累積，banner 上 chip 從 0 變多。

**Rollback**: 純 additive change、無 schema 改動 → 直接 revert commit + redeploy 即可；既有資料不受影響（多寫的 interval / easeFactor / nextDueAt 不影響 mastery / affinity / gacha 等其他系統）。

## Open Questions

- **Due card 在 quiz modal 內是否顯示「complete (mastery%)」 vs「review (overdue Nd)」visual hint**？task-level UX 決定、不阻塞 spec
- **是否需要 `?srs=off` query flag 給 dogfood 對照組？** 一階 `?scene=off` 是 hospital-scene 加的 escape hatch — 可考慮類似 pattern；不在 spec MUST，task 可加 optional
- **第一次 deploy 後幾天 banner chip 視覺如何**？需要 dogfood telemetry 看；可能要調 chip 字級或顏色（屬 dogfood follow-up，不在本 change scope）
