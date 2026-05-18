# Decisions — 2026-05-18 (evening session, deferred follow-ups)

> 本 session 完成 4 個 ship 級 commit（`fix(medexam2): honor 送分題` / `spec(archive): realign-hospital-scene-slots` / `data(medexam2): fix 4 user-reported Q bugs in 醫四 小兒科` + answer-fetcher gap on Desktop side）。以下是同 session 浮現但**刻意 defer** 的 follow-up — 寫進 decisions log 讓下次 session `/spec resume` 自動載入、避免遺失。

## 22:00 — P1 一階 disputed bug 待 audit

**問題**：`packages/content-medexam-tw/scripts/build.ts` 完全沒 disputed handling。一階 .md 用 narrative 標 送分題（例「KEY 送分題，直接選B」），94 個 .md 檔命中此 pattern（grep `送分|皆可|無正確|沒有正確` 命中數）。

**現況**：陽明國考考古題小組已 curated 一個推測答案塞進 `**答案**：B`（或其他字母），所以 app 顯示「正解：B」。但官方判定送分，選非 B 的玩家被誤判錯。

**為什麼今天不修**：
- 一階 .md 用 narrative，需要 pattern detection regex 加 false positive audit（例「不會送分給」會誤命中）
- 風險：誤標 disputed 會讓本來唯一正解的題變成「任選都對」反而更亂
- Scope 大於今天 session 預算

**怎麼開**：`/opsx:propose audit-medexam-tw-disputed-questions`
- §1 Audit：寫 Python script grep 94 個 .md 的 narrative，分類為 (a) 真送分題 (b) false positive (c) 模糊地帶
- §2 Build script update：加 `## 送分` / `> 送分` heading 標記到 .md 後讓 build.ts 識別
- §3 Manual review：對 (c) 模糊地帶逐題決定
- §4 Apply：rebuild 一階 content + chrome MCP smoke

**影響範圍**：上限 94 題 / 3505（2.7%），跟 二階 185/6066 (3.0%) 同數量級

---

## 22:00 — P2 抽 `isCorrectSelection` + `DISPUTED_LABEL` 到 @study-rpg/core

**Why**：本 session simplify P3 Reuse-agent 建議。`q.disputed || selection === q.answer` 在 4 個檔案重複（QuizModal × 3 site、mock-exam.ts × 1）。`DISPUTED_LABEL` 文字在 QuizModal + BookmarksPage + bookmarks export markdown 重複 3 次。

**為什麼今天不修**：core 已發 npm `@study-rpg/core@0.2.0`（2026-05-16）。加 helper 是 API 增強，per `openspec/project.md` decision 4 需要 CHANGELOG entry + bump minor。應該獨立 propose 而非搭便車進 disputed flag fix。

**怎麼開**：`/opsx:propose extract-disputed-grading-helper-to-core`
- 加 `packages/core/src/lib/question-grading.ts` 含 `isCorrectSelection` + `DISPUTED_LABEL` (long) + `DISPUTED_LABEL_SHORT`
- Export from `packages/core/src/index.ts`
- 4 個 consumer 換用 helper（QuizModal / mock-exam / BookmarksPage / bookmarks.ts）
- CHANGELOG.md：`0.2.0 → 0.3.0 minor (additive: disputed-grading helper)`
- M_2nd consumers 已用 `^0.2.0` (見 [migrate-m2nd-to-published-core archive](changes/archive/2026-05-16-migrate-m2nd-to-published-core/))，npm publish 後跑 `pnpm update`

**Estimated**：~20 min coding + ~10 min spec + npm publish

---

## 22:00 — P3 14 個二階 OCR-broken Qs 待補

**問題**：`pnpm build` skip log（`MEDEXAM2_ALLOW_SKIPS=1` 收 14 條）。多數是 `<2 options (got 0)` 表示 PDF OCR 沒抓到選項，少數 `empty stem`。

**清單**（複製自 build skip log）：
- 醫學三/內科/113_第二次.md Q15: <2 options
- 醫學三/家醫科/114_第二次.md Q80: empty stem
- 醫學五/外科/111_第二次.md Q54, Q80
- 醫學五/外科/113_第一次.md Q53, Q54
- 醫學五/骨科/112_第二次.md Q12: empty stem
- 醫學六/婦產科/107_第二次.md Q29
- 醫學六/復健科/111_第二次.md Q71
- 醫學六/眼科/113_第一次.md Q14
- 醫學六/耳鼻喉科/107_第二次.md Q22
- 醫學四/小兒科/108_第一次.md Q20
- 醫學四/小兒科/109_第一次.md Q2
- 醫學四/小兒科/109_第二次.md Q7

**怎麼修**：手動 re-extract 原 PDF（已在 `~/Desktop/國考/二階國考/民國*.pdf`），補回 .md 後 rebuild。或者 mark `hasImage: true` 加 imagePath 讓 quiz UI 至少能 fallback 顯示 PDF 截圖。

**影響**：14/6066 = 0.23%，可以在 dogfood 中發現再逐題補。不阻塞 ship。

---

## 22:00 — P3 lazy-load-medexam2-by-subject (NFR breach)

**問題**：questions.json gzip 3.18 MB > NFR 2.5 MB ceiling。Build script 已 warn 但不阻擋 ship。

**為什麼超**：6066 題 + 每題 explanation 平均 ~1500 chars。

**修法選項**：
- A. **Per-subject lazy load**：build 階段 emit `questions-<subject>.json` × 14；app 切科時 fetch 對應檔，總 cold-start payload 縮為 root catalog + 1 subject
- B. **Explanation lazy load**：emit `questions-stems.json` (stem + options + answer only) + `explanations-<subject>.json` 分離；首屏 ~1 MB，點開 reveal 才 fetch 詳解
- C. **Both** combined（A + B 混合，~600 KB 首屏）

**Estimated**：A ~30 min, B ~45 min, C ~1 hr

**Why defer**：dogfood usage 沒實際 latency 抱怨；NFR 是上限 ceiling、不是 fail-fast threshold。先讓 M5 養成元素加深 ship 再來優化。

---

## 22:00 — P4 C2 modal pixel-overlap + C5 study session navigate-away

**C2 RecruitmentResultModal vs banner button collision**
- File: `apps/medexam2-hospital-tw/src/components/RecruitmentResultModal.tsx` + `RecruitmentBanner.tsx`
- 問題：modal 開時、點 viewport 對應 banner button 位置 silently no-op
- 修法：modal 開時 disable banner button（pass modalOpen prop 進 banner，render `disabled` attribute）
- 預估：~10 LOC

**C5 study session navigate-away leaves semi-active state**
- File: `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx` + `lib/tick.ts`
- 問題：navigate /study → 別頁 → 回 /study 偶爾 tick 不重啟，state='active' 但 interval 沒重建
- 修法：useEffect cleanup 強制 controller.pause() OR  useLayoutEffect 在 mount 時 force-restart-tick-if-active
- 預估：~10–15 LOC + edge case 測試

**Why defer**：兩個都是 rare paper cut、無 data integrity 影響。Bundle 成一個 `polish-c2-c5-dogfood-edge-cases` change，~30 min 收尾。

---

## 22:00 — answer_fetcher.py 路徑 bug 修正記錄

**問題**：`~/Desktop/國考/二階國考/二階國考_拆分/_scripts/answer_fetcher.py` OUT_DIR 漏了一層 `二階國考/`，所有抓下來的 JSON 落在 `~/Desktop/國考/二階國考_拆分/_cache/answers/`（orphan tree）而非真正的 `~/Desktop/國考/二階國考/二階國考_拆分/_cache/answers/`。

**已修**（不在 git repo，是 Desktop side）：
1. Edit `_scripts/answer_fetcher.py` OUT_DIR + build_targets 補 108/109/110 entries（之前 fetcher 只覆蓋 106/107/111-115，108-110 三屆 24 papers 完全沒抓）
2. Re-run fetcher → 76 papers 完整 `_cache/answers/` JSON
3. Migrate 24 個 108-110 JSONs 從 orphan tree 到 correct 路徑
4. 刪除 orphan tree

**Cross-check 結果**：
- Source .md (76 papers / 6080 Qs) vs official 考選部 std+correction = **100% match, 0 diff**
- Deployed questions.json vs official = **0 mismatch**
- 唯一發現的 1 真實 dataset bug = Q27 109_2 醫學六 耳鼻喉科（.md=B 應為 A），本 session 已修

**為什麼記**：Desktop fetcher script 不在 git repo，未來重 build cache 時可能再撞 path bug；這份紀錄是唯一 paper trail。如果以後也 migrate 進 repo（例：`tools/answer-fetcher/`），記得 OUT_DIR 路徑用 `Path.cwd()` 或 env var 而非 hard-coded 絕對路徑。

---

## Cross-cutting note: subagent quota

本 session 跑 4 個 general-purpose subagent（simplify 3 個 review agent + opsx:sync-specs 1 個），daily total 15/30。如果下次 session 也要跑 simplify pass + spec workflow，留意 quota 上限。
