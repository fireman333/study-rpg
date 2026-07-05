## Why

距一階國考剩 12 天，dogfood 玩家（焦慮的醫學生）最需要的不是更多題目，而是**更穩健地答題與訂正錯題**。現有今日處方箋的訂正線只認「答錯」，看不見兩個更貼近焦慮來源的訊號：玩家自己標記的「🤔 我猜對的」（心虛、隱形弱點）與「✨ 太簡單」（已精通、不該再被抽到）；而處方箋抽題也無視首頁已存在的年份篩選（`quiz.yearFilter`），與一般 quiz 的行為不一致，讓 app 感覺「不夠穩」。同時「錯誤」在現有措辭裡偏向失敗事件，而非可完成的修補工作。

## What Changes

- **修補池重定義（穩健核心）**：`buildPlan` 的訂正線 pool 由「`lastResult==='wrong'`」擴充為 `( lastResult==='wrong' ∪ guessedMarked ) − easyMarked`，改讀既有 `questionFlags` 表；開發線（unseen）pool 同樣排除 `easyMarked`。把「猜對的心虛題」拉進修補、把「已精通題」剔除。
- **修補中 → 已固化 reframe**：錯題／猜對題呈現為「修補中的連結」（可修補、尚未髓鞘化），訂正答對呈現為「連結已固化」（完成修補，而非清償錯題債）。純文案／視覺 reskin 既有 wrong→right 狀態，把答錯從「失敗」改成「可完成的工作單元」。
- **年份聯動（B）**：`buildPlan` 尊重既有 `quiz.yearFilter`。開發線完全 year-scoped；訂正線 year-scoped-first，範圍內無修補題再 fallback 全年份；非全選時顯示低調 range chip；飢餓情境有中性 fallback（絕不出現「沒題目可做」死狀態）。
- **Copy-softening pass**：「盲區」UI 改「開發新連結」；不外露錯題池原始總數；accuracy 低導致 N 縮減的措辭去除歸因語氣；UI 不外露 snapshot／鎖定／防作弊語氣；不出現 missed-day calendar。
- **Out of scope（列為 next，本 change 不做）**：小份處方 dose toggle（A）、考前 taper、答題前穩定起手式、錯因分類 tag。

無 Dexie 版本 bump、無 R2 `SYNCED_META_KEYS` 改動；所有新讀取皆來自既有 table（`questionFlags` / `questionHistory` / `meta.quiz.yearFilter`）。

## Capabilities

### New Capabilities
<!-- 無新 capability；本 change 全部是既有處方箋能力的行為擴充。 -->

### Modified Capabilities
- `neurons-daily-prescription`: 訂正線的 eligible pool 定義（納入 `guessedMarked`、排除 `easyMarked`）、開發線排除 `easyMarked`、抽題 pool 尊重 `quiz.yearFilter`（含 scoped-first fallback 與飢餓 fallback）、訂正回饋改為「修補中 → 已固化」framing、以及數個 anxiety-safe copy-softening 要求。

## Impact

- **Code**：`apps/neurons-tw/src/lib/services/prescription.ts`（`buildPlan` + plan 型別擴充：讀 flags、year-scope、pool 集合運算、fallback 標記）、`apps/neurons-tw/src/components/DailyPrescriptionCard.tsx`（reframe 文案、range chip、copy-softening）、`apps/neurons-tw/src/components/QuizModal.tsx`（訂正 loop 的「修補中／已固化」措辭）、錯題清單相關文案。
- **Data / schema**：無變更。新增讀取來源＝既有 `questionFlags`（`easyMarked` / `guessedMarked`）與 `meta.quiz.yearFilter`（透過既有 `effectiveYearSet`）。所有 prescription 狀態維持 `meta` 的 `prescription:v1:` write-once keys，仍為 local-only、不進 `SYNCED_META_KEYS`。
- **Tests**：Vitest 覆蓋修補池集合運算（wrong ∪ guessed − easy）、year-scope 計算、scoped-first + 飢餓 fallback 分支、first-access 凍結（frozen plan）在新 pool 定義下仍成立。
- **依賴／相容**：與既有 `neurons-quiz-year-filter`（提供 `quiz.yearFilter` / `effectiveYearSet`）、`neurons-wrong-answer-list`（`everWrong` / flags 語意）耦合為唯讀消費，不改它們的 requirements。
