## Context

二階 hospital mode 經 8 個 archived changes（scaffold / corpus / sprite / gacha / tycoon / level-up / reputation / deploy）後已 live at `/study-rpg/hospital/`，但純 idle tycoon 沒有答題機制。`recruitment-gacha` capability 早已 spec affinity counter / banner threshold / ticket gacha 等規則、`App.tsx` 已 wire `createPerQReputationListener`、`packages/content-medexam2-tw` 已暴露 `RECRUITMENT_THRESHOLDS` 表 — 整套答題後端基礎建設都備齊、就缺 UI 入口觸發。

新 save chicken-and-egg：抽卡需 affinity ≥ threshold（最低泌尿科 9）、quiz 必選 doctor、roster 空 → user 既不能抽 doctor、也不能進 quiz 累 affinity。本 change 一併解此死結。

Stakeholders:
- **Owner (dogfood)**: 開發者 WLK，下半年用此 app 準備一階國考、用此 二階 fork 試 engine API
- **未來 contributor**: 沿用 quiz UI pattern 為其他 content pack（TOEFL / 律師考）做類似流程

Constraints:
- 不動 `recruitment-gacha` spec（已 archive、要動需 MODIFIED requirement）
- 不動 `@study-rpg/core` engine（M3 才開公開 API）
- Dexie schema migration v3 → v4 必須對既有 dogfood save 做 safe migration（不破壞 affinity / doctors / rooms / gameCounters）
- 必須 vibe-coding-friendly（非 CS 背景作者）— 避免複雜 abstraction

## Goals / Non-Goals

**Goals:**

- 提供完整 quiz 答題 flow：點 banner「📚 學習」→ 選 doctor + subject → 連續答題 → 答對加 affinity + mastery / 答錯顯解析 → 隨時關閉
- 新 save 可玩 — 解 chicken-and-egg、提供 onboarding 體驗（2 starter doctor + 1 首抽）
- Mastery 紀錄到位、為下個 change `wire-hospital-srs-queue` 的 scheduler 預留 schema 欄位
- 零 spec MODIFIED — 用 ADD-only capabilities 完成、不污染既有 archived specs
- Dexie v3 → v4 migration 對既有 save 安全（dogfood 不會掉資料）

**Non-Goals:**

- 不實作 SRS scheduler（演算法、due-date 推送、due UI、to-review queue 都不做、留給 `wire-hospital-srs-queue`）
- 不調整 affinity gain 公式（仍為 spec lock 的「correct → +1」、無 quiz-time specialty match bonus）
- 不調整 reputation 公式或 `createPerQReputationListener` 行為（reputation per-Q + 5s tick 兩條 path 都保留）
- 不新增 quiz-specific theme sprite slot（不擴 `theme-pack-contract`）
- 不做 quiz batch / score / timer / leaderboard 模式（純連續單題）
- 不調整 banner 既有 visual treatment（學習 button 加在現有 banner 內、不重設計 banner）
- 不做付費 / 抽卡相關 monetization

## Decisions

### Decision 1: Quiz UI 走 modal 不走 route

**選**: Modal 覆蓋在 HomePage 上、不獨立 route。

**Why**: 連續單題 + 隨時離開 + 從 banner 進，modal pattern 自然；新增 route 會打斷 HashRouter 結構（目前只有 `/`、`/roster`、`/hospital`、無 nesting）、且需要處理「答到一半 F5 怎麼辦」（modal 結束 = 自然 reset，route 結束反而要寫 unmount cleanup）。

**Alternatives considered**:
- A: `/quiz?subject=外科&doctorId=...` route — 拒絕。query-param state 比 React state 重，重 fresh 沒 benefit
- B: 直接嵌在 HomePage（無 overlay）— 拒絕。會擠掉 banner grid、視覺亂

### Decision 2: Doctor binding 純敘事、affinity 計算不依 doctor

**選**: Quiz modal 必選 roster doctor、UI 顯示 doctor sprite + name 為 partner 敘事；但 `affinity[subjectId]` 計算純看 quiz.subject、跟 doctor.subject 無關（user 可選內科 doctor 答外科題、affinity[外科] 仍 +1）。

**Why**: `recruitment-gacha` spec 已 lock「correct → affinity[subjectId] +=1」是 hard rule、加 doctor-dependent multiplier 需要 MODIFIED requirement。零 MODIFIED 是本 change 設計鐵律。Doctor 純敘事點綴提供 RPG flavor 不破壞 spec。

**Alternatives considered**:
- A: Doctor.subject ≡ quiz.subject → affinity gain ×2 — 拒絕。需 MODIFIED recruitment-gacha
- B: 完全不必選 doctor — 拒絕。grill 答案明示「必選」、且 hospital 沒 doctor 互動 = 沒 RPG flavor
- C: 必選但 doctor 提供 quiz-time hint / option narrowing — 拒絕。複雜度暴增、scope creep

### Decision 3: Subject dropdown default = banner.subject 但無 hard lock

**選**: User 從某 banner 點「學習」進 modal → dropdown 預設選該 banner 的 subject；user 可在 dropdown 切換到任何 14 科。

**Why**: Facet 4 (B1) 明確「user 自選 dropdown」。從 banner 進有 contextual default（user 點外科 banner 大概率想答外科），但保留切換自由度（user 可能想跨科練），符合「自由 + sensible default」UX 原則。

**Alternatives considered**:
- A: 鎖死 banner.subject 不可切換 — 拒絕。違反 grill answer
- B: Default 為「最低 affinity 那科」（鼓勵刷弱項） — 拒絕。grill 沒選此項；user 從外科 banner 進卻 default 內科會錯愕

**Open follow-up**: dropdown 切換到別科是否 reset session（清空當前題狀態 / 重新 question pool）— 預設 yes（切科 = 換 question pool 必然 reset）、但保留答對過的 mastery 不變。

### Decision 4: Question picker 純 random、不依 mastery / SRS 排序

**選**: 從 corpus 抽該 subject 題目時純 `Math.random()`、不考慮歷史正確率 / nextDueAt / 弱項。

**Why**: 本 change scope 不含 SRS scheduler、加入 mastery-weighted picker 等同於做 mini-scheduler，會跟下個 change 衝突。純 random 簡單、可預測、不會跟 SRS 邏輯打架。

**Alternatives considered**:
- A: 弱項 weighted（mastery% 低的科 / 題優先）— 拒絕。本 change scope 外
- B: SRS due-first（已 due 的題優先）— 拒絕。本 change 不 schedule
- C: 純 random + skip 已答對 5 次 以上同題 — 拒絕。複雜度暴增、邊際效益低

**Open follow-up**: 連續抽到同題的去重 — 短 session 內維護 `seenQuestionIds: Set<string>`、抽到重複就 reroll（最多 3 次防止 question pool 用盡）。

### Decision 5: Wrong-answer 不扣任何資源 + 自動寫 history

**選**: 答錯顯示 `corpus.explanation`（含 [P1 夯] 分級的選項詳解）、affinity 不變、reputation 不變、mastery total +=1（correct 不變）、history.attempts +=1（correctCount 不變）。

**Why**: 鼓勵 user 多答、犯錯成本低。Explanation 已在 corpus、free render。Mastery 對的算 correct 才入分子、total 算所有 attempt — 自然產生「正確率」分母。History 紀錄是 SRS 下個 change 的食材。

**Alternatives considered**:
- A: 答錯 affinity -1 — 拒絕。spec lock「never decrement」、需 MODIFIED
- B: 答錯 reputation -X — 拒絕。reputation 公式不動是 goal
- C: 答錯顯示但不寫 history — 拒絕。下個 change 沒原料

### Decision 6: Per-question history schema 預留 SRS 欄位

**選**: `questionHistory` table 一次寫好所有欄位（包括 SRS 用的 `nextDueAt: null` / `interval: 0` / `easeFactor: 2.5`），下個 change scheduler 只動 logic、不動 schema。

```typescript
interface QuestionHistoryRow {
  questionId: string             // 題目 id from corpus
  subjectId: string              // 冗餘存以便 index 查詢、不依賴 corpus join
  attempts: number               // 總嘗試次數
  correctCount: number           // 答對次數
  lastAnsweredAt: number         // 上次答題 epoch ms
  lastResult: 'correct' | 'wrong'
  // SRS fields — 本 change 寫 default、下個 change scheduler 讀寫
  nextDueAt: number | null       // null = 尚未進 SRS schedule
  interval: number               // days, default 0
  easeFactor: number             // SM-2 ease factor, default 2.5
}
```

**Why**: Schema migration 一次到位、避免下個 change 又跑 Dexie version bump。本 change 寫 default + 不讀 SRS 欄位、下個 change scheduler 直接 read / mutate 不動 schema。

**Alternatives considered**:
- A: 本 change 只寫 attempts/correctCount/lastAnsweredAt/lastResult、下個 change 加 SRS 欄位再 migration — 拒絕。額外一次 Dexie version bump、dogfood save 多一次 migration risk
- B: 把 SRS 欄位拆獨立 table（`srsState[questionId]`） — 拒絕。read amplification（每次答題要 join 兩 table）；schema 分裂沒好處

### Decision 7: Starter pack 用 hospital-onboarding 新 capability、不 MODIFIED 既有

**選**: 開新 capability `hospital-onboarding` 涵蓋 (a) ensureSeed 預設 2 P5 doctors (b) starter pull mechanic (c) HomePage starter card UI。

**Why**: 替代方案 (modify `hospital-management-mode` for seed + modify `recruitment-gacha` for starter pull) 違反零 MODIFIED 原則。Onboarding 是 cross-cutting 概念（涉及 doctor seed + gacha bypass + UI），自己一個 capability 邊界清楚、未來 ramp 也好管。

**Alternatives considered**:
- A: MODIFIED `hospital-management-mode`（seed 部分）+ MODIFIED `recruitment-gacha`（starter pull 部分）— 拒絕。違反鐵律
- B: 把 starter pack 完全塞進 hospital-quiz capability — 拒絕。語意不對：starter pack 不是 quiz 機制
- C: 分兩 change：本 change 只做 quiz + mastery、另開 `add-hospital-onboarding` change 做 starter pack — 拒絕。Deadlock fix 沒解、本 change apply 後新 save 仍不可玩

### Decision 8: Starter pull rarity 分佈 — re-normalize 既有 weight 排除 P5

**選**: 維持既有 P5/P4/P3/P2/P1 = 60/25/10/4/1 的比例 backbone、排除 P5 後 re-normalize：

| Tier | 原始 weight | Starter weight | Starter % |
|---|---|---|---|
| P5 | 60 | 0 | 0% |
| P4 | 25 | 25 | 62.5% |
| P3 | 10 | 10 | 25% |
| P2 | 4 | 4 | 10% |
| P1 | 1 | 1 | 2.5% |

**Why**: User 顯式說「保底 P1-P4」即「不會抽到 P5」。Re-normalize 比例維持 P4/P3/P2/P1 既有相對概率（P4 仍是最常見、P1 仍稀有），不引入新的隨機分佈邏輯。

**Alternatives considered**:
- A: 全部 force P3+（excludes P5 + P4） — 拒絕。太慷慨、starter 應只是 leg-up 不是 jackpot
- B: 固定給 P3 — 拒絕。剝奪 wow moment、且不符 user wording「P1-P4」
- C: Custom 分佈 50/30/15/5 — 拒絕。引入新數字、和現有 gacha 系統不一致

### Decision 9: Dexie migration v3 → v4 — additive table + 預設值 backfill

**選**: 

- `version(4).stores({...})` 加兩個新 table：`mastery`（`&subjectId`）、`questionHistory`（`&questionId, subjectId, lastAnsweredAt, nextDueAt`）
- `gameCounters` schema 加 `hasUsedStarterPull: boolean`（非 indexed、純 JS prop）
- `ensureSeed` 對 v3 → v4 升級的 save：
  - 14 個 `mastery[subjectId]` row default `{ correct: 0, total: 0 }` 插入（若無）
  - `gameCounters.hasUsedStarterPull = true`（v3 → v4 升級者已過 onboarding period、不應再給首抽）
  - 不動既有 `doctors` / `affinity` / `rooms` data
  - 不 backfill `questionHistory`（從 quiz 開始才產生 row）
- 對全新 save（無 v3 history）：
  - `mastery` 14 row default 0/0
  - `gameCounters.hasUsedStarterPull = false`
  - `doctors` 插入 2 個 P5 starter（內科 + 外科）

**Why**: Additive 不破壞舊資料；既有 dogfood user（一個人）升級平滑；新 user 拿完整 onboarding。

**Risk mitigation**: 對升級 save 強制 `hasUsedStarterPull = true` 避免「老 user 突然多一個首抽」UX 困惑。

### Decision 10: Banner double-button visual — 「📚 學習」+「🎫 招募」並列

**選**: BannerCard 內加 button row：左「📚 學習」（藍底）、右「🎫 招募 N」（綠底、N = 票數）。Locked banner（affinity < threshold）「招募」disabled 灰、「學習」永遠 enabled。

**Why**: 視覺 affordance 明確、雙 button 直接可見、不靠長按 / 二次點等 hidden gesture。配色用既有 hospital theme palette。

**Alternatives considered**:
- A: Banner click → quiz、roll 改成右上角小 icon — 拒絕。Roll 是現有用法、改成 hidden 影響老 user
- B: Tab 切換（學習 / 招募）— 拒絕。tab 一次只看一個、增加 click 數
- C: Long-press = roll、click = quiz — 拒絕。Mobile 才有 long-press、桌機 affordance 不明顯

## Risks / Trade-offs

- **Risk: Dexie v3 → v4 migration 對既有 dogfood save 失敗** → Mitigation: `ensureSeed` 用 `Promise.all` 平行 default insert、每個 step 套 `try/catch` log 但不 throw、最後驗 `mastery` 14 row + `hasUsedStarterPull !== undefined`、不通過則 console.error 並啟動 fallback「重置 mastery」path（不動 doctors / affinity）
- **Risk: 連續單題抽到同題重複** → Mitigation: session 內 `seenQuestionIds: Set<string>` reroll 最多 3 次、第 3 次仍重複則 accept（防止 pool 小於 3 題時死循環）
- **Risk: Corpus 題目 explanation 欄位為空或 malformed** → Mitigation: render 時 `if (!q.explanation) show "（解析待補）"` placeholder；不 throw、不 block flow
- **Risk: Starter pull 給太多新 user power（P1 2.5% 機率）** → Mitigation: dogfood telemetry 觀察、若 P1 太多可 follow-up change 調 weight
- **Risk: Doctor picker 在 modal 內展現 30+ doctor 太擠（dogfood 滿後）** → Mitigation: 先按 obtainedAt desc 排、scroll list；UI 細節留 implementation phase
- **Risk: 新 user 不知道「學習」button 跟「招募」button 差別** → Mitigation: 第一次 hover / tap 顯示 tooltip 「📚 答題累積 affinity、🎫 用 ticket 抽 doctor」；implementation phase 處理
- **Risk: Affinity counter 在 quiz 結束時的 race condition（quiz modal 還在、user 跳走、affinity update 沒寫進 IDB）** → Mitigation: 每答對立即 await Dexie write、不 batch；性能可接受（單寫 ~1ms）
- **Trade-off: 純 random picker → user 可能連續抽到 5 題都答對的「無聊」題** → Accepted: SRS scheduler 下個 change 解（弱項優先 / due 優先），本 change 不做

## Migration Plan

1. **Dev**: branch `track-m2`、apply Dexie v4 migration、本機 dogfood save 升級驗證（doctor / affinity / room 不掉、mastery 14 row 出現、`hasUsedStarterPull = true`）
2. **Smoke**: `pnpm typecheck` + `pnpm --filter @study-rpg/medexam2-hospital-tw dev` + Chrome MCP 三件套（home / `#/quiz`-N/A 改驗 banner button / F5 on `/hospital`）
3. **Prod**: archive 後 fast-forward merge `track-m2` → `main`、push 觸發 GH Actions、Chrome MCP prod smoke 驗 banner 雙 button + starter card 顯示
4. **Rollback**: 若 prod 出問題、git revert merge commit + push；Dexie v4 schema 已寫入 user 的 IDB、會留下無 logic 的 mastery / questionHistory table、不影響 v3 功能；下次 deploy 帶 v4 logic 即可重接

## Open Questions

- **Q1: 連續答題 ≥ N 題後是否強制讓 user 休息（疲勞提示）？** 預設不做、若 dogfood 答到睡著再加
- **Q2: Quiz modal 內可不可以中途切 doctor？** 預設 yes、切 doctor 不 reset session、只改頭部 sprite 顯示
- **Q3: Starter card 是否可被「跳過」（user 不想用首抽就丟掉）？** 預設 no、card 一直在直到 user 用掉；若 dogfood 反饋「想丟」再加 skip button
- **Q4: Mastery% 顯示在哪些地方？** 預設 banner（per-subject mastery）+ roster card（per-doctor 不顯示因為 doctor 不影響 mastery、但可考慮顯示「該 doctor 帶答的 mastery」做 dating sim flavor）— implementation phase 決定
- **Q5: 「📚 學習」button 在 locked banner 上 enable 嗎？** 預設 yes（user 可以「在 locked banner 練 X 科題目」、affinity 累積到 unlock）— 不啟用反而會封 user
- **Q6: Quiz modal partner section 是否套 rarity color？** Apply 階段沒做、archive 前 user 明示「Option B、deferred 但要記得」。目前 `.quiz-modal__partner` 沒 inline `--rarity-color`，P1 跟 P5 partner 除了 sprite + label 沒邊框色差異。修法：partner 包一層 div、inline `style={{ ['--rarity-color']: \`var(--rarity-${doctor.rarity.toLowerCase()})\` }}`，CSS 加 `.quiz-modal__partner { border-left: 4px solid var(--rarity-color) }`。Trigger：sprite v2 polish 輪或 dogfood 抱怨「partner 視覺都一樣」時做。Cross-ref：`openspec/decisions/2026-05-15.md` 19:50 entry「Deferred polish」
