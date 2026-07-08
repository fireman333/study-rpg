## Context

neurons-tw 已有成熟的考前子系統，三者定位需明確區分，本 change 補上第三塊：

| 面向 | 定位 | 場景 |
|---|---|---|
| 今日處方箋（`neurons-daily-prescription`） | **練習** | 每日自適應答題 |
| `/cram`（`neurons-cram-tab`） | **深讀** (~30 min) | 速看 blocks + 押題 items 展開 + 一頁真題 drawer |
| **5 分鐘速看版（本 change）** | **純讀速看** (~5 min) | 進考場前把精華掃一遍 |

既有可複用資產：`packages/content-neurons-tw/dist/cram.json`（速看 `kernel` 高頻一行句，目前僅 5/11 科共 33 條）、`dist/concept-recurrence.json`（11 科常青必掃概念排名，93 常青 + 389 stable，含 `breadth`/tier 權重與真題來源）。app 端可讀 `everWrong` / `familyMastery`(correct/total) / `recentAccuracyPct`（neurons 無真 SRS，只有這三個弱點訊號）。

約束：CF Pages static host（若新增 public 資產目錄須進 `assetDirs` allowlist，否則 prod 回 index.html——本 change 刻意複用既有 `cram.json` 以**避開**此陷阱）；runtime fetch public JSON 須前綴 `import.meta.env.BASE_URL`；既有 cram honesty 鐵律（無倒數壓力/計分/落後提示）。

## Goals / Non-Goals

**Goals:**
- 5 分鐘內能滑完全 11 科最高投報率精華，純讀、零壓力、可分享。
- 靜態全科同一份精華集合（可截圖/可分享），個人化只做「順序重排 + 弱科標記」。
- 補齊 6 缺料科的精華一行句（醫學 fact 經 `/oe` 查證）。
- 產出一頁式「進場前一張紙」速看 PDF。
- 零 Dexie / R2 / cloud-sync 改動。

**Non-Goals:**
- ❌ 不做答題/計分/計時壓力（守 honesty 鐵律）。
- ❌ 不做逐條 drill-down 到真題（純讀）。
- ❌ 不做內容因人而異的自適應集合（只重排/標記，集合固定）。
- ❌ 不改既有 `/cram` 深讀、今日處方箋、concept-recurrence 的行為（只讀取）。
- ❌ 不動 Dexie/R2 schema、不新增 synced meta key。

## Decisions

**D1 — 內容集合：靜態全科策展（每科 5 條 × 11 科 ≈ 55 條）**
選靜態而非自適應集合：可分享/可截圖、最誠實、最好維護、內容品質可一次把關。個人化退到「呈現層」——用 `everWrong`/`familyMastery`/`recentAccuracyPct` 重排科目順序（弱科前置）+ 弱科卡加低調標記，**內容集合本身固定不變**。Alternative（全自適應內容）被否：不可分享、且考前臨時漏掉強科精華風險高。

**D2 — 精華來源＝既有 cram fragments 的 `kernel` block（補齊 6 科為單一真實來源）**
既有 `速看 kernel`（🎯 高頻考古一行句）天然是速看骨幹，但目前只覆蓋 5/11 科（生理/解剖/免疫/寄生蟲/藥理）。診斷（2026-07-08）發現：6 科（生化/組織/胚胎/病理/微生物/公衛）的既有 fragments **有 kw/disc/num 內容但缺 kernel 精華開場**（病理 9.2KB、微生物 6.5KB 反而是內容最豐富的兩科，純缺 kernel）。故本 change **把 6 科的 kernel 精華句寫回既有 `src/cram/fragments/*.html`**：AI 依 `concept-recurrence` 常青概念（`breadth`/tier 排名）草擬 → **owner 逐條審核、醫學 fact 走 `/oe` 查證**。concept-recurrence 的 `zh` 是長主題標籤，只當**排序權重**，不當顯示文字。**單一真實來源＝fragments 的 kernel block**；補齊後既有 `/cram` 那 6 科結構回到 11 科一致（順手修不一致），5 分鐘速看只是「抽取＋呈現」層。**沿用既有 速看 self-contained 設計（kernel item 型別 `{ html, cite? }`，無 per-row 來源錨）**——不新增 per-line sourceId，維持與 cram-tab 既有 honesty 契約一致（來源回溯是「押題」的事，速看是策展精華）。Alternative（另養一份 speed-review 精華）被否：會與 fragments 分叉、雙份維護。

**D3 — 零新資料 artifact：速看複用既有 `cram.json` 的 kernel blocks**
補齊後 `cram.json`（`/cram` 已 lazy-fetch）本身就含全 11 科 kernel blocks。`/cram/5min` **直接複用同一份 `cram.json`**、於 app 端抽出各科 kernel items（每科 cap ≤5）組成速看集合——**無新 `speed-review.json`、無需改 CF Pages `assetDirs`**（cram.json 已在 content assetDir，fetch 已前綴 `import.meta.env.BASE_URL`）。`build-cram.ts` 唯一新增產物＝一頁式速看 PDF（見 D7）。Alternative（獨立 lazy artifact）被否：既然單一來源已是 cram.json，另拆 artifact 只增 assetDirs 風險、無收益。

**D4 — 落點：獨立路由 `/cram/5min`（可分享）+ /cram 頁入口**
選獨立 route 而非 in-page overlay：可分享連結、可 deep-link、考前直接開。代價 = **收尾必跑 SPA 三件套**（in-app 導航 + 直接 URL + F5，最後一輪在 prod）。`/cram` 頁頂加一個入口按鈕。

**D5 — 呈現：全螢幕一科一卡滑動 + 11 圓點 + 環境沙漏**
一科一卡（11 卡 + 開場/收束卡），左右滑，11 顆圓點顯示進度與已滑科目。**沙漏純環境**：5 分鐘走完只溫和提示「掃完了，進去考吧」，不打斷、不計分、不顯示落後——守既有 cram honesty 鐵律。純讀，卡上精華不可點開真題。

**D6 — 個人化：純讀取三訊號重排/標記，零寫入**
科目順序依 `recentAccuracyPct` + `familyMastery` 弱科前置；弱科卡加低調「⚠ 近期較弱」標記。全部 read-only，不寫 Dexie/R2、不影響養成進度。

**D7 — 一頁式速看 PDF：同 build pipeline**
`build-cram.ts` 一併產出一頁「進場前一張紙」速看 PDF（55 條濃縮排版），與現有醫一/醫二完整 A4 詳解 PDF 明確區分（後者是完整詳解、前者是進場前濃縮）。

## Risks / Trade-offs

- **6 科 authoring 是關鍵路徑且需醫學把關** → AI 草擬 + owner 逐條審 + `/oe` 查證；build gate 檢查 11 科皆有 kernel block（缺科不讓 build 過或明確標佔位）。
- **獨立路由在 CF Pages static host 可能 F5/直進 404** → 收尾必跑 SPA 三件套、最後一輪在 prod；沿用既有 neurons route 的 fallback 設定。
- **改既有 fragments 可能誤傷既有 5 科 /cram 呈現** → 只 ADD 6 科的 kernel block、不動既有內容；`verify:cram` + Chrome MCP 驗既有 5 科 /cram 呈現不變。
- **精華一行句過度濃縮反而誤導** → owner 逐條審核；寧可精確不貪多（每科 ≤5 條硬上限）；沿用既有 速看 self-contained（不假裝有精準來源回溯）。
- **沙漏被誤解為壓力計時** → 純環境、溫和、無計分；文案避免倒數/落後語氣。

## Migration Plan

純加性、無 schema migration。部署走既有 `deploy-cf-pages.yml`（main push → build neurons + wrangler deploy）。Rollback = revert change commit（無資料遷移、無 Dexie/R2 版本改動，故零 rollback 風險）。

## Open Questions

- 一頁式 PDF 的實際排版密度（55 條單頁是否需 2 欄）——留 apply 階段依實排微調。
- 弱科標記的視覺門檻（`recentAccuracyPct` 低於多少算弱）——dogfood 微調，初值待 apply 定。
