## Context

題庫 build script 已從 frontmatter 抓 `有附圖: 是/否` 寫進 `question.hasImage: boolean`（見 `packages/content-medexam-tw/scripts/build.ts`）。藥理 418 題中有 196 題 (`hasImage: true`)，但 .md 沒實際附圖、`question` 物件也沒有 `imageUrl` 之類欄位。

當前狀態：QuizModal / BossModal 完全忽略 `hasImage`，玩家答題時遇到「題幹寫『下圖為…請判斷』」但畫面沒圖，會懷疑系統壞掉。

## Goals / Non-Goals

**Goals:**
- 玩家答 hasImage 題不再困惑，明確知道「圖暫無、但題幹資訊仍可作答」
- Reading-mode 提供 skip 通道，避免讀完整套題庫被 47% hasImage 題拖累體驗
- Spec 設計保留 future-state：未來補圖時，banner 可被 `<img>` 自然取代而不破壞 contract
- Boss-mode 維持 30Q × 30min × ≥60% 契約完整（不開 skip 漏洞）

**Non-Goals:**
- 不補圖、不做 OCR、不做 alt-text 自動生成（M2+ scope）
- 不做題目過濾器（「不要 hasImage 題」開關）
- 不改 question schema / build script / content-pack-contract（純 UI 層）
- 不動 engine layer（`packages/core/`）

## Decisions

### 為何 Reading-mode 開 skip、Boss-mode 不開

| 模式 | Skip 行為 | 理由 |
|---|---|---|
| Reading (QuizModal) | ✅ 開，按下「跳過此題」抽下一題、不寫 SRS、不算對錯 | reading 是 study session，目標讀過題庫；47% 卡住會 break flow |
| Boss (BossModal) | ❌ 不開 | boss 是 timed assessment（30Q / 30min / ≥60% pass），開 skip 會破壞 sample size 與 scoring 契約。玩家仍可選擇留白送出或硬猜 |

**Alternative considered**：boss 也讓 skip 但 skip 算錯。**Rejected**：玩家會 strategically skip 自己不會的題，等同看完所有題後選最有把握的答 — 跟 timed-exam 精神衝突。

### Banner UX

```
┌────────────────────────────────────────┐
│ 📷 此題原有附圖（題庫尚未匯入）        │  ← 黃色 banner
│                          [跳過此題] →  │  ← only in reading mode
├────────────────────────────────────────┤
│ Q3. 下圖為某病患心電圖...請選正確診斷  │  ← 題幹
│   (A) ...                              │
│   (B) ...                              │
└────────────────────────────────────────┘
```

Banner 用 `⚠️`/`📷` icon + 對比鮮明的 background（暫定 `#fff3cd` / `#ffc107` 邊框，套用既有 pixel theme css var）。

### Skip 在 reading-mode 的副作用設計

按下 skip：
- `skippedQuestions` count += 1（不寫進 player.lootStats，不影響 reward 計算）
- 自動 advance 到下一題（不顯示 reveal、不寫 SRS）
- 結算 summary 時顯示「答對 X / 5，跳過 K」（如 K > 0）；reward 只算實際作答的題（quizCorrect + quizWrong）

**Alternative**：skip 算 quizWrong 的 50% XP consolation。**Rejected**：違反「skip 不被懲罰」直覺；且 196 hasImage 題玩家會被迫吞 47% wrongs。

### Future-state 擴充

Spec 寫法保留：
- 若 `question.imageUrl` 未來補上（content-pack-contract 還沒包這欄，但留語意 hook），banner 應該被 `<img src={imageUrl} />` 取代
- Banner-vs-image 邏輯封裝在 component 內，不洩漏到 spec：spec 只說「若 image asset 不可用則顯示 placeholder」、不規定 image 來源

## Risks / Trade-offs

- **Risk**: 玩家 reading-mode 一直 skip → 永遠讀不到 196 題裡的 text-only 題（題幹有時其實能獨立作答） → **Mitigation**: banner 文案寫「⚠️ 多數題目仍可從文字推測作答」鼓勵試試；不擋使用者 skip
- **Risk**: 47% hasImage 在 boss mode 全部被亂答 → boss pass rate 受影響 → **Mitigation**: 接受。陽明小組 raw data 本來就是這樣；mini-boss 設計 60% threshold 已預留容錯。若實測 dogfood pass rate 過低再另開 change 調整 threshold
- **Trade-off**: 不重新編 question schema → `imageUrl` 缺欄位的 future 擴充需要再開 content-pack-contract delta。**OK**：本 change scope 就是 UI-only，schema 改動本來就該分開 propose
