## Why

二階 hospital mode quiz pipeline 把 doctor 當「練題 partner」（archived: `wire-hospital-quiz-ui`），但**配對哪個 doctor 對學習結果完全沒差** — 任何 partner 都給一樣的 +1 mastery。缺了一個關鍵 game-feel 訊號：「同科醫師教同科內容更有效」。本 change 接上 specialty match bonus，讓 user 抽中的 rare 同科 doctor 在 quiz 時可見地加速 mastery 累積，補強抽卡 → 學習的閉環。

順手收掉 [decisions log 21:35 deferred polish](../../decisions/2026-05-15.md)：QuizModal partner section 套 rarity color border-left。

## What Changes

- **新 capability `hospital-specialty-bonus`**：定義 specialty match predicate + tier-based mastery multiplier
- **Match predicate**：exact match `doctor.subjectId === quiz.subjectId`（內科醫師只 boost 內科 quiz，無 cluster fuzzy match）
- **Multiplier table**（per rarity，沿用既有 `AFFINITY_MATCH_BONUS` 方向、rare doctor 加成最強）：
  - P1 夯 → 1.5×
  - P2 頂級 → 1.3×
  - P3 人上人 → 1.2×
  - P4 NPC → 1.1×
  - P5 拉完了 → 1.05×
  - Cross-subject 或 no partner → 1.0×（無加成）
- **套用範圍**：mastery only — `recordCorrectAnswer` 內 `upsertMastery` 寫入 `correct` 時套 multiplier
  - `mastery.correct` 從 int 變 float（schema `number` JS native 雙精度、無 migration）
  - Mastery percentage UI **不 cap**：`掌握 120%` / `150%` 直接 render（game-y feel；user 確認此偏好 2026-05-16 grill）
  - Affinity / SRS / xp 完全不動（SRS 已被 `hospital-srs` Req 6 lock）
- **UI 視覺提示**：QuizModal partner section 加 `✨ 1.5×` chip，pre-quiz 就可見；顯示 multiplier value + rarity 對應的顏色
- **Bundled deferred polish**：partner section 加 `border-left: 4px solid var(--rarity-${rarity})`（從 `wire-hospital-quiz-ui` decisions 21:35 carry-forward）— 同 component 區順手完成，避免另開單純 polish change

## Capabilities

### New Capabilities

- `hospital-specialty-bonus`: 二階 hospital mode 的 specialty match predicate + tier-based mastery multiplier mechanic（含 chip UI 顯示規則）

### Modified Capabilities

無。本 change 純 additive — 不動 `hospital-quiz` / `hospital-mastery` / `hospital-srs` / `recruitment-gacha` 既有 spec。

## Impact

**Code**:
- `packages/content-medexam2-tw/src/specialty.ts` — **新增**：`SPECIALTY_MATCH_MULTIPLIER: Record<Rarity, number>` table + `getSpecialtyMultiplier(doctor, subjectId): number` helper
- `packages/content-medexam2-tw/src/index.ts` — export 上述兩項
- `apps/medexam2-hospital-tw/src/lib/mastery.ts` — `recordCorrectAnswer` 接 `partner: DoctorRow | null` 參數，內部呼叫 `getSpecialtyMultiplier` 算 multiplier，傳給 `upsertMastery`；`upsertMastery` 接 `multiplier` 參數（default 1.0），寫入 `correct` 時乘以 multiplier
- `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` — 傳 bound partner 進 `recordCorrectAnswer`；partner section 加 `✨ {multiplier}×` chip + `border-left: 4px solid var(--rarity-color)` polish
- `apps/medexam2-hospital-tw/src/styles.css` — `.quiz-modal__partner-bonus` chip + `.quiz-modal__partner` border-left CSS

**Schema**: 無變動（`mastery.correct` 已是 JS `number` = double float）

**Dependencies / APIs**: 無新增 npm package；`@study-rpg/core@0.1.0` API surface 不擴張（不動 npm 公開契約）

**Out-of-scope cross-refs**:
- Cluster-aware matching（內科 group / 外科 group fuzzy match）— design.md 留 future polish hook，本 change 純 exact match
- Mastery cap UI（100% / 150% display）— **不 cap**（design lock 2026-05-16 grill）
- SRS interval × specialty bonus — locked OFF by `hospital-srs` Req 6
- Affinity × specialty bonus — 留下個 change，不在本 scope
