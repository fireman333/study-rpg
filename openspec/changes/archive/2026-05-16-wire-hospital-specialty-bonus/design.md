## Context

二階 hospital mode quiz pipeline 已接通 mastery (`hospital-mastery`) / affinity (`recruitment-gacha`) / SRS (`hospital-srs`) 三 axis reward。Quiz modal 允許 user 從已招募 doctor 池選一個當 partner（per quiz session），但 partner 的選擇對 reward 計算**毫無影響** — 不論你拿 P1 夯 內科醫師還是 P5 拉完了 婦產科醫師去答內科題，mastery 都 +1。

這違反兩個 design intent：
1. **抽卡誘因**：rare doctor 應該帶來 visible 玩法優勢（不止 powerMultiplier 影響 tycoon engine throughput，quiz pipeline 也該感受到）
2. **「同科醫師教同科」的世界觀**：醫學現場 「內科 attending 教內科 student」高 retention，本 game 應該反映

既有平行 mechanic 已存在：`AFFINITY_MATCH_BONUS`（tycoon engine 用 — 同科 doctor 在對應 room 加 throughput），結構：rarity → multiplier，P1=1.5 / P5=1.1。本 change 在 quiz pipeline 做平行 mechanic — 不共用 constant table（mastery vs throughput 是不同 reward channel），但**沿用 tier direction 慣例**避免認知負擔。

**Stakeholders**: dogfood = 作者本人（醫五考生）；二階 user = RA / PGY 期間準備二階國考 cohort。

## Goals / Non-Goals

**Goals:**
- 答對 quiz 時、若 partner doctor 同科 → mastery.correct 乘以 tier multiplier
- Multiplier table per rarity，P1=1.5 / P2=1.3 / P3=1.2 / P4=1.1 / P5=1.05；無 partner 或跨科 = 1.0
- Partner chip `✨ 1.5×` pre-quiz 可見，user 選 partner 時知道 bonus 多少
- Bundled polish：QuizModal partner section rarity color border-left（deferred from `wire-hospital-quiz-ui`）
- Tunable constants 落在 `packages/content-medexam2-tw/src/specialty.ts`，不擴 `@study-rpg/core` 公開 API
- 不破壞既有 `hospital-mastery` / `hospital-quiz` / `hospital-srs` / `recruitment-gacha` archived spec

**Non-Goals:**
- 不做 cluster-aware match（內科 group / 外科 group fuzzy match）— spec 留 future polish hook
- 不擴 specialty bonus 到 affinity / SRS interval / xp（mastery only）
- 不做 mastery percentage cap UI（fractional correct 允許 > 100% display per 2026-05-16 grill）
- 不做 toast on correct answer（chip pre-quiz 已 sufficient feedback）
- 不擴 `@study-rpg/core` API surface（M3 npm published 0.1.0 stable）

## Decisions

### Decision 1: 新 capability `hospital-specialty-bonus`（vs modify hospital-quiz / hospital-mastery）

**選**：new capability。

**Why**: 跟 `hospital-srs` 設計一致 — bonus mechanic 是獨立演化的 game mechanic（未來可能擴 cluster matching / multi-partner stacking / event-based double bonus），spec 各自 own contract 比塞進 hospital-quiz 7 reqs 清楚。`hospital-mastery` 4 reqs 純描述 mastery 計算公式，加 multiplier 算「外掛」mechanic，不適合 modify 既有公式 req。

**Alternative considered**: MODIFY `hospital-mastery` 公式 req 加 multiplier — Rejected，會讓「mastery 累積 = correct count」這個 baseline 語義變糊。

### Decision 2: Mastery only（不擴 affinity / SRS / xp）

**選**：mastery only。

**Why**:
- Affinity 是 recruitment unlock gate — 加成等於「同科醫師加速解鎖招募」會混淆 progression（user 怎麼解鎖科別跟 doctor 拿誰互相耦合）
- SRS interval / EF 已被 `hospital-srs` Req 6 explicit lock OFF（retention curve 不被 game mechanic 污染）
- Mastery 是「我學會多少」的 cleanest reward channel — 給 specialty bonus 最 thematic 對齊

### Decision 3: Tier multiplier values（P1=1.5 / P5=1.05）

**選**：依既有 `AFFINITY_MATCH_BONUS` 方向、rare doctor 加成強。

| Rarity | Label | Multiplier |
|---|---|---|
| P1 | 夯 | 1.50 |
| P2 | 頂級 | 1.30 |
| P3 | 人上人 | 1.20 |
| P4 | NPC | 1.10 |
| P5 | 拉完了 | 1.05 |
| (cross-subject / no partner) | — | 1.00 |

**Why**:
- Rare doctor → 強 bonus 強化抽卡誘因（multi-axis incentive：powerMultiplier 5.0 + specialty 1.5 都集中 P1）
- P5 仍有 +0.05 微 boost → 不會「拉完了 doctor 完全無用」，dead-card 感弱
- 跟 `AFFINITY_MATCH_BONUS`（tycoon throughput 的 same-subject room 加成）方向一致，認知負擔小

**Alternative considered**:
- Flat 1.5×（無 tier）— Rejected：缺 rarity-based progression
- P5=1.5 / P1=1.05 反向（common doctor 補償）— Rejected：方向跟 tycoon affinity 相反、認知衝突
- 依 quality 計算 instead of rarity — Rejected：quiz 是 binary correct/wrong，無 quality dimension

### Decision 4: Exact match predicate（不做 cluster matching）

**選**：`doctor.subjectId === quiz.subjectId`。

**Why**:
- Spec / code 最簡（一行 ===）
- Dogfood 友善 — user 完全可預測「partner subject == quiz subject 才有 bonus」
- 14 subject 各自獨立、不維護 cluster mapping table
- Cluster mapping (e.g.「內科 / 神經內科 / 家醫科 同 cluster」) 有歧義（神經內科 vs 神經外科應該歸內 or 外?），延後到 future polish 再决

**Future hook**: spec / design.md 寫一句「future polish: cluster-aware match with partial multiplier (e.g. 0.5× for cluster mate, 1.0× for exact match)」但本 change 不實作。

### Decision 5: Mastery.correct float storage（不做 schema migration）

**選**：直接存 float 在現有 `correct: number` 欄位。

**Why**:
- IndexedDB `number` 是 JS double float native，無 type 變化
- Schema migration overhead 大、回滾風險高
- UI `formatMasteryPercent` 內部 `floor(correct/total*100)` float input 無誤差

**Edge case**: cumulative float 可能誤差累積（0.1 + 0.2 != 0.3）— 但 mastery percentage cap 在 floor + scale 100，誤差 < 1% level 不會 visible。

### Decision 6: Mastery percentage UI 不 cap（允許 > 100% display）

**選**：`formatMasteryPercent` 不 cap，直接顯示 `掌握 120%` / `150%`。

**Why**: User 2026-05-16 grill 明確選 game-y feel — 看到「掌握 150%」傳達「同科醫師加成中、超過正常累積速度」訊號，比 cap 100% 隱形 bonus 更 actionable。

**Trade-off**: 學術語意「mastery > 100%」是 nonsense，dogfood 後若 user 反饋困惑 → 改 cap 100% + 顯示 `(+50% bonus)` extra info。本 change 先 game-y。

### Decision 7: Partner chip UI（pre-quiz hint）

**選**：QuizModal partner section render `✨ 1.5×` chip when partner exists 且 same-subject。Cross-subject 或無 partner 不 render chip。

**Why**:
- Pre-quiz 顯示 → user 選 partner 時 actionable（vs post-correct toast 是 reactive）
- 只 render same-subject case → 避免「跨科 ✨ 1.0×」這種 redundant chip 雜訊
- Chip 顏色用 `var(--rarity-${rarity})` 對齊既有 rarity color system

### Decision 8: Bundled rarity color border-left polish

從 `wire-hospital-quiz-ui` decisions 21:35 deferred — partner section 加 `border-left: 4px solid var(--rarity-color)` 視覺指示。

**Why bundled**: 同 component 區（quiz-modal__partner），同 commit / 同 PR / 同 spec polish 一起做，避免另開純 polish change 的 overhead。

**Spec scope**: 本 change spec 提一句「partner section MUST render rarity-colored border-left」即可，主要實作是 CSS。

## Risks / Trade-offs

1. **[Float mastery.correct 累積誤差]** → Mitigation: dogfood 觀察 percentage 是否出現「掌握 100.001%」這類顯示瑕疵；若有 → `formatMasteryPercent` 加 `Math.round` 前先 toFixed(2) 處理；不在本 change spec MUST

2. **[Mastery > 100% UI 可能困惑非 RPG-savvy user]** → Mitigation: dogfood 後若反饋 → 改 cap 100%。Spec 寫明此設計 trade-off，constant 不 cap 容易後續改

3. **[Specialty bonus 跟 affinity bonus 方向一致導致 user 以為共用 mechanic]** → Mitigation: design.md 明示這是兩個獨立 reward channel（一個 throughput tycoon、一個 mastery quiz），名字 / chip emoji 用 ✨（vs affinity 用其他 emoji）區分

4. **[Tier-based multiplier 鎖死可能 dogfood 後想 tune]** → Mitigation: constants 集中 `packages/content-medexam2-tw/src/specialty.ts` named exports，tune 走 follow-up change 改 5 個 literal

5. **[Cluster matching 缺席可能讓某些 subject 體感不公平（e.g. 神經內科 user 沒抽到神經內科 doctor 永遠拿不到 bonus）]** → Mitigation: future polish hook 留 spec 內，dogfood 觀察呼聲；本 change 不阻塞

## Migration Plan

無 schema migration。Deploy 後：
- 既有 mastery rows `correct: int` 繼續用、未來 update 寫入 float 無問題
- 既有 quiz session 重啟後 partner chip 顯示需要 React state re-derive（QuizModal hot-reload OK）

**Rollback**: 純 additive change，revert commit + redeploy 即可。既有 mastery 資料不受影響（float storage 跟原 int storage cross-compatible）。

## Open Questions

- **Chip 顯示樣式細節**：`✨ 1.5×` 是否要不同 emoji（如 ⭐ / ✨ / 🎯）？task-level 決，spec 不規範
- **Cross-subject partner 顯示 1.0× 還是 hide chip**：spec 鎖 hide（only render when bonus > 1.0）— 但 dogfood 可能反饋「想看 1.0×」 explicit confirmation；不阻塞 spec
- **Rarity color CSS variable convention**：`--rarity-P1` vs `--rarity-${rarity.toLowerCase()}`？查現有 styles.css convention 決，spec 不規範
