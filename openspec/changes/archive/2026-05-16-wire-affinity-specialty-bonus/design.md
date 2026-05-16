## Context

`recordCorrectAnswer` 在 `apps/medexam2-hospital-tw/src/lib/mastery.ts:82-101` 同一個 Dexie `rw` transaction 內處理三件事：
1. `upsertMastery(db, subjectId, true, multiplier)` — 套 specialty multiplier
2. `upsertHistory(db, record, true)` — 記 questionHistory + SRS state
3. `db.affinity.put(... correctCount + 1)` — **永遠 +1，沒套 multiplier**

`multiplier` 已經算好（line 87-91 透過 `getSpecialtyMultiplier(partner?.subjectId, partner?.rarity, record.subjectId)`），等於說 affinity 那行 inline `+ 1` 是「能拿來用但沒用到」的便宜。本 change 就是把 `+ 1` 改成 `+ multiplier`，並補上對應的 display rounding 跟 spec scenario。

Recruitment threshold 比較 (`affinity < threshold`) 在 `apps/medexam2-hospital-tw/src/services/recruitment.ts:27` 跟 `apps/medexam2-hospital-tw/src/components/RecruitmentBanner.tsx:27`，兩處皆是 JS native 數值比較，float vs int 比較不需特殊處理。

Display 在 `RecruitmentBanner.tsx:45` 用 `{affinity} / {threshold}` 直接 render — React 會把 number 直接 toString，3.5 顯示 "3.5"、9.85 顯示 "9.85"。需要套一個 rounding helper 限制到 1 decimal。

## Goals / Non-Goals

**Goals:**

- 把現有 `multiplier` 變數同時餵給 affinity upsert，達成 mastery / affinity 對 specialty match 的對稱反應
- 復用 `packages/content-medexam2-tw/src/specialty.ts` 既有 `SPECIALTY_MATCH_MULTIPLIER` + `getSpecialtyMultiplier` — 零新 export、零新 enum
- RecruitmentBanner 顯示 smart decimal rounding（integer 不加 `.0`、float 限 1 decimal）
- 零 schema migration：affinity.correctCount 已是 JS native double

**Non-Goals:**

- 不重新校準 threshold（10 / 25 / 50 等）— 等 dogfood telemetry
- 不加 cluster matching（內科 cluster 等）
- 不改 wrong-answer 行為（仍不動 affinity）
- 不改 XP / SRS / mastery 既有套用範圍（mastery 已套 multiplier、SRS Req 6 locked OFF、XP 仍待下個 change）
- 不動 `@study-rpg/core` API surface（specialty 概念屬 content pack）
- 不動 `RoomCard.tsx` 的 `AFFINITY_MATCH_BONUS` 顯示 — 那是「room placement throughput multiplier」屬於 idle tycoon side（與本 change 的 quiz-correct affinity counter 是完全不同的 affinity concept，名字相撞但語義不同；不會混淆因為兩者 file / use-site 完全分離）

## Decisions

### Decision 1: 復用 `getSpecialtyMultiplier` vs 新增 `getAffinitySpecialtyMultiplier`

**選擇**：復用 — `recordCorrectAnswer` 已計算 `multiplier`，直接傳給 `db.affinity.put` 即可，零新 helper。

**Alternatives**:
- (A) **新增 `getAffinitySpecialtyMultiplier`** — 給 future flexibility（之後想讓 affinity 用不同 table）。**否決理由**：YAGNI。目前需求就是「對稱」，引入 parallel helper 等於提早假設兩個 table 會分歧，多了一個維護點、增加 dogfood tuning 摩擦（要同時改兩個 table）
- (B) **inline literal `1 + (multiplier - 1) * 0.5`** — 給 affinity 一個「打折版」multiplier（e.g. P1 從 1.5 變 1.25）以避免 recruitment unlock 過快。**否決理由**：本 change 設計意圖是「對稱反應」，打折等於設計妥協；若 dogfood 發現 unlock 太快，正確修法是調 `SPECIALTY_MATCH_MULTIPLIER` 表本身 或 調 threshold，不是引入 affinity-specific 變形

### Decision 2: Schema — float in-place vs Dexie version bump

**選擇**：float in-place — `affinity.correctCount` 已是 JS number (IEEE-754 double)、IndexedDB 不強制 type、跟 `wire-hospital-specialty-bonus` 對 `mastery.correct` 的處置一致。

**Alternatives**:
- (A) **Dexie v5 + upgrade hook 把所有現有 int 轉成同值 float** — 多此一舉，JS native `3 + 1.5 === 4.5` 不需轉
- (B) **存 `correctCount: Math.round(...)` 維持 int** — 損失精度，連續 P5 correct (3 × 1.05 = 3.15) 會被四捨五入成 3，使用者覺得「答對沒效果」

### Decision 3: Display 精度 — Math.round(× 10) / 10 vs toFixed(1)

**選擇**：`Math.round(affinity * 10) / 10` + `.toString()` — 自動處理 trailing zero：integer 顯示 integer、float 顯示 1 decimal。

**Implementation**：
```tsx
const displayAffinity = Math.round(affinity * 10) / 10
// 3 → "3"
// 3.5 → "3.5"
// 9.85 → "9.9"
```

**Alternatives**:
- (A) **`affinity.toFixed(1)`** — 永遠帶 `.0`（"3.0 / 10" 醜、且 integer-time users 永遠看 "3.0" 莫名其妙）
- (B) **`affinity % 1 === 0 ? affinity : affinity.toFixed(1)`** — 跟選擇等價但分支更繞、可讀性差

### Decision 4: Threshold 不動 vs 補償性 +50%

**選擇**：不動 — 本 change 不改 `packages/content-medexam2-tw/src/recruitment.ts` 的閾值表。

**Rationale**：rare 同科 partner 解鎖更快是設計意圖（reward rare doctor 的核心 loop）；若 dogfood 發現 unlock 太快，threshold tuning 是獨立 polish change（會跟 mastery `>100%` 一起重看）。本 change 保持 atomic：純機制接線，不混 game balance 調整。

**Alternatives**:
- (A) **threshold 同步 +50%** — 抵消 P1 加速效應，但 P5 + 5% 反而拉長了 P5 unlock 時間，傷害「P5 仍稍微有用」的 game feel
- (B) **threshold 改為 `Math.round(base × averageMultiplier)`** — averageMultiplier 假設預設值，過度 engineering

### Decision 5: 不改 wrong-answer 流程

**選擇**：`recordWrongAnswer` 函式完全不動（沒 affinity transaction、沒 partner 參數）。

**Rationale**：spec Req 3「Wrong answer never increments affinity」對既有 recruitment-gacha spec 是 carry-forward；加 partner 參數 / multiplier 計算只會增加 dead code path。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **Recruitment banner 解鎖過快** — P1 同科 partner 用 ~6.7 quiz correct 達 threshold 10，可能讓 onboarding 後一週 banner 全開、移除 progression sense | Dogfood 觀察點記入 handoff；若反饋強烈，獨立 polish change 調 threshold + 視覺重平衡（本 change 不含） |
| **Cross-subject partner 永遠 +1.0 沒人發現** — multiplier 在 cross-subject case 等於 1.0，等於「沒套 bonus」，user 可能誤以為「跨科 partner 沒效果」 | proposal.md `Gameplay` 區段明文「cross-subject / no-partner 完全不變」；spec scenarios 用 `MUST increment by exactly 1` 鎖死行為；無需 UI 額外提示 |
| **Float affinity 在 sorting / display 出現意外** — 例如 `9.999999` 因浮點誤差顯示 `10.0 / 10`（looks unlocked but `< 10`）| Display 走 `Math.round(× 10) / 10`：9.999 → 10 → 顯示 "10 / 10"；但 unlock 判斷仍用 raw float `9.999 < 10 = true`。**這是邊界 case**：UI 顯示 unlock 但 banner 仍 locked，user 會困惑。**Mitigation**：實作時若擔心，UI display rounding 跟 unlock check 用同一 helper：`displayAffinity = round(...); displayUnlocked = displayAffinity >= threshold`。但 `Math.round(9.999 * 10) / 10 = 10`、`10 >= 10 = true` 反而會 unlock 早一個 micro-fraction — 也 OK，方向有利 user。本 change tasks.md 加 sanity case 驗一次 |
| **同科 P1 partner stack 多次 quiz** — affinity 從 0 跳到 1.5 再到 3.0 再到 4.5，每次跳 1.5 看起來「正常」；但若 user 切換 P5 partner，下次跳變 1.05，可能困惑 | `✨ 1.5×` chip 已在 `wire-hospital-specialty-bonus` 上 QuizModal 顯示；user 看到 chip 跟 affinity 跳幅關聯即可建立心智模型 |
| **threshold integer vs affinity float 混顯示** — 顯示 `3.5 / 10` 跟 threshold 寫 `10` 對齊；若 future change 改 threshold 為 float（e.g. `12.5`），display 一致 | 自然 handle，無需特別處理 |
| **dogfood tuning 想分離 affinity table 跟 mastery table** — Decision 1 鎖死共用 helper，若未來真需要 split，要先做 deprecation + 新 export | 接受此 risk：YAGNI 先行；split 是獨立 change 的事，到時加 `getAffinitySpecialtyMultiplier` + 改 `recordCorrectAnswer` 兩處即可 |

## Migration Plan

**Deploy steps**:
1. Local apply + smoke test（Chrome MCP 跑 `localhost:5173/hospital/`）
2. `pnpm -r typecheck` 通過
3. `/opsx:verify` + `/verify`
4. `/opsx:archive` sync delta 進 main specs（會自動把 `specs/affinity-specialty-bonus/spec.md` 從 delta 搬進 `openspec/specs/affinity-specialty-bonus/spec.md`）
5. auto-git commit（template: `spec(archive): merge wire-affinity-specialty-bonus — affinity 同步套 rarity-tiered specialty multiplier`）
6. **不馬上 merge track-m2 → main**（先觀察 dogfood）

**Rollback**:
- 程式碼 rollback：`recordCorrectAnswer` 內 `+ multiplier` 改回 `+ 1`、RecruitmentBanner 顯示改回 `{affinity}`
- 資料 rollback **不需**：float `correctCount` 在 schema 是合法的，不需 backfill；若決定 rollback，後續 +1 仍正常累加（user 仍會看到 `3.5 / 10` 直到下次整數加成）
- 若擔心觀感，可在 rollback PR 加一次性 migration `correctCount = Math.floor(correctCount)`（**本 change 不準備**，只列為 rollback option）

## Open Questions

無。所有重要決策在 Decisions 區段已 lock；threshold 重新校準延後到獨立 polish change。
