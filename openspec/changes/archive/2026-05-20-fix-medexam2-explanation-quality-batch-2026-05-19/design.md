## Context

二階 explanation 是兩階段 Haiku-driven pipeline 產出：(1) Haiku per-option 評估真偽寫 prose，(2) Haiku 標 ✓/✗ on predicted answer letter。兩階段沒同步驗證導致兩類問題：

1. **Audit footer leak**：explainer 在每份 sidecar 結尾寫 per-paper audit summary（`## ⚠️ Conflict with official` + Haiku vs 官方答案分歧條目），預期是 maintainer 內部追蹤用，但 `parseExplanationsFile` 把最後一題從 `## Q<N>` 抓到 `body.length`，audit footer 被吸進該題詳解尾。

2. **✓/✗ inversion**：Haiku 答案預測錯誤時，標記的 ✓ 落在 wrong letter，prose 整段順著錯誤推理寫下去，醫學上 confidently wrong。Audit footer 自己 flagged 出 66 條 high-confidence disagreement（如 Q76：footer 寫「Q76: 官方 D ↔ Haiku A」），但 Haiku 沒回頭修詳解。

第二類更深層的 480 條 silent inversions（detector `/tmp/detect_inversion.py` 跑出來的）是 audit footer 大量 underreport 的證據，本 change 範圍只處理 audit footer 那 65 條（Q76 已在 Stage 1 之前手動修，剩 64 條）+ 3 條 hand-curated bug (Q2/Q29/Q76)。Stage 2 silent 414 留下次 change。

Pipeline trade-off：Haiku-self-flagged 66 條的 prose 整段寫向 wrong answer (Scenario A — 純 mark-flip 無法解)，需 LLM 重寫。Silent 414 條 sampling 10 condition 顯示也以 Scenario A 為主，pure mark-flip 不安全。

## Goals / Non-Goals

**Goals:**
- 修 187 questions 的 audit footer leak（pipeline-level fix，一條 regex strip helper pass）
- 修 1 條 inline `※官方允許[A-D]給分。` residue + 防後續再生（同 strip helper pass）
- 修 65 條 audit-footer-flagged Haiku-inversions（best-effort LLM 重寫，失敗保留原檔）
- 修 3 條已被 user 回報 / hand-curated 的特定 bug (Q76 / Q29 / Q2)
- 維持 `medexam2-corpus-ingestion` capability 既有 100% sidecar coverage 不退化

**Non-Goals:**
- 不修 silent 414 inversions（Stage 2 後續 change）
- 不修 Q12/Q26 image refetch（需 PDF→PNG pipeline 改動，另開 change）
- 不修 Q65 「承上題沒題目」UX bug（UI 改動，另開 change）
- 不修 Q15-class stem-corruption（「不」字 PDF 抽取掉，需 PDF extraction pipeline 改動）
- 不重生整個 explanation corpus（6080 題完全重做成本太高，下次值得再評估）

## Decisions

### D1: build-pipeline strip vs sidecar source 修正

**選擇**：build-pipeline strip helper 加 Pass 4 + Pass 5。

**Alternative**：直接 hand-edit 187 條 sidecar source 刪掉 audit footer。

**Why**：audit footer 對 maintainer 有 ground-truth tracking 價值（每 paper 寫出 Haiku 跟官方哪幾題分歧 — 後續做 corpus quality batch 仍需要這資訊）。保留 source 完整、build-time strip user-facing copy 兩全。

### D2: LLM batch 用 `gemini -p` 還是 `mcp__gemini__gemini_deep_research`

**選擇**：`gemini -p`（plain prompt，no google_search tool use）。

**Alternative**：`mcp__gemini__gemini_deep_research` per question（強 grounding）。

**Why**：醫學國考考古題是 textbook-level 內容，google_search 邊際效益不高。Plain `gemini -p` 已在 Q76 pilot 驗證質量過關。`gemini -p` 用 OAuth tier，65 條 ~30 min 不爆配額。Deep research 一條 5-10 min × 65 = 5-10 hr，不實際。

**並**：CLAUDE.md gemini import 規則禁止 CLI 加 `-y` / `--yolo` 開放工具，但純 prompt（不需 google_web_search tool）沒踩線。

### D3: 失敗保留原檔（no-op）vs 強制覆寫

**選擇**：Gemini 失敗保留原檔。

**Why**：原版雖然 ✓/✗ inversion，但內容 coherent；強制塞入 Gemini incomplete output 反而製造 regression。失敗 case 透過 in-app 🐞 channel 由玩家眾包回報，trade-off 可接受。

### D4: Polarity-misdetect 失敗的 post-process recovery

**選擇**：寫 `/tmp/recover_false_rejections.py` 用 unique-mark-position 邏輯救回 validator 誤拒。

**Why**：第一輪 batch 65 條中 16 條 validation 失敗（official letter 標 ✗ 但 validator 期望 ✓），實際原因是 stem 截字（「不」字 PDF 抽取掉）導致 polarity 偵測錯。Gemini output 其實 logically correct (unique-mark-position == answer)。Post-process 14/16 救回，比 retry 整輪 cheap。

### D5: Gemini account switch（tony85314 → b09401048）

**選擇**：手動 OAuth re-auth (`~/.gemini/google_accounts.json` swap + `oauth_creds.json` 刪除 + 互動式 `gemini` 命令)。

**Why**：第一輪 Q76 pilot 耗光 tony85314 OAuth tier 配額（8h reset）。b09401048 配額新鮮。Gemini CLI 無 headless 切帳機制，必須 user 手動瀏覽器確認。Backup oauth_creds 留 fallback。

## Risks / Trade-offs

- **Stage 1 失敗 2 條未修** → Mitigation: 透過 in-app 🐞 channel 玩家回報 fallback；Stage 2 重跑可能順帶救
- **Stage 1 涵蓋僅 65/480 inversions (13.5%)** → Mitigation: 明示 Stage 2 後續 change 處理 silent 414
- **Gemini batch 預期 quota burn** → 已 mitigation：切到 b09401048 fresh quota；tony85314 backup 仍在
- **Build artifact gzipped size 3.24 MB > NFR 2.5 MB** → 已存在問題，本 change 加重 ~50 KB 不顯著；後續走 `lazy-load-medexam2-by-subject` follow-up
- **無 OpenSpec capability spec.md 涵蓋 `stripPdfExtractionJunk` 既有 4 個 pass** → 本 change 走 modified-capability delta，不新增 capability。若未來需要更嚴格的「explanation residue」spec，再開 capability。

## Migration Plan

1. Apply: build.ts edits 已 in-place（Pass 4 + Pass 5）；sidecar `.md` edits 已 in-place（Q2/Q29/Q76 + 63 batch）
2. Build: `pnpm --filter @study-rpg/content-medexam2-tw build`
3. Copy: `cp packages/content-medexam2-tw/dist/*.json apps/medexam2-hospital-tw/public/content/medexam2-tw/`
4. Verify metrics:
   - `jq '[.[] | select(.explanation | test("Conflict with official"))] | length' < apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json` → 0
   - `python3 /tmp/detect_inversion.py` → real_inversions ≈ 416
   - rebuild log 顯示 100% sidecar coverage
5. （已驗證上述 4 點全綠）

**Rollback**：若 prod 出現 regression，
- Build.ts revert（Pass 4 / 5）→ rebuild → cp → audit footer 重新出現但 user-facing 沒比之前差
- Sidecar source 由 git restore 還原（worktree 未 commit，所有改動仍可放棄）

## Open Questions

- Q110-1-小-Q2 / Q112-1-小-Q21 Stage 1 失敗條件：要不要本 change 內手動補（hand-edit），還是等 Stage 2 batch 重跑？
- 後續 `lazy-load-medexam2-by-subject` follow-up 何時做（gzipped > 2.5 MB NFR breach 累積至今）？
