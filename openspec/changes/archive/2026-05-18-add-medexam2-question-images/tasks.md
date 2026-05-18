## 1. Extraction script (PyMuPDF)

- [x] 1.1 寫 `tools/extract-medexam2-images.py` — input: `apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json`，filter `hasImage=true`；output: `apps/medexam2-hospital-tw/public/images/medexam2-tw/<qid>.png`；支援 `--dry-run` 跟 `--write` 兩 mode
- [x] 1.2 PDF locate 邏輯：parse qid `<year>-<sitting>-醫學<三|四|五|六>-<subject>-Q<n>` → 對應 `民國{year}_第{一|二}次_醫學{三|四|五|六}.pdf`；missing PDF 印 NO_PDF log
- [x] 1.3 Page locate：grep 題幹前 60 字 → 找到 page；fallback 縮短到 20-30 字；都失敗印 STEM_NOT_FOUND log
  - 實際做法升級：sort=True extraction + 連續 CJK 字 dedupe + 多 fragment offset (start 0/5/10/15/20/30) 才能對抗 PyMuPDF 兩欄交錯 + 邊界字元重複 artifact。0/76 STEM_NOT_FOUND
- [x] 1.4 Image extraction：`page.get_images()` → 智慧 picker (below-stem + largest area 排除 < 0.5% page area 的 icon)；MULTI_IMG log 含 page+count+strategy；無 embedded → `page.get_pixmap(dpi=150)` render 整頁；CMYK → RGB 處理；save PNG
- [x] 1.5 第一輪 dry-run：印 NO_PDF / STEM_NOT_FOUND / MULTI_IMG / RENDERED_PAGE 統計到 `tools/extraction.log`；不寫 PNG
- [x] 1.6 Review dry-run log，spot-check：跑了 3 個 sample qid 確認 fragment search 落在正確 Q（106-2-內-Q10 / 111-1-內-Q25 / 111-2-內-Q75 皆對）
- [x] 1.7 第二輪 `--write` mode：寫 364 張 PNG（scope expansion 後）
- [x] 1.8 視覺 spot-check 10+ 張 PNG（`open` 預覽 + Chrome MCP 渲染驗 2 個案例：骨科 Q74 X-ray + 皮膚科 Q40 foot）
- [x] 1.9 印最終 stats：`extracted: 323, rendered_page: 41, failed: 0, total: 364 (100% success)`（No Silent Errors）

## 2. Build script + type update

- [x] 2.1 `packages/core/src/types.ts`：`Question` interface 加 `imagePath?: string | null`（在 `hasImage?: boolean` 之後）
- [x] 2.2 `pnpm --filter @study-rpg/core build` 確認 dist 同步
- [x] 2.3 `packages/content-medexam2-tw/scripts/build.ts`：加 `APP_IMAGE_DIR` + `APP_IMAGE_REL` 常數；`buildQuestion` 內 `parsed.hasImage && existsSync(...)` 才設 `imagePath`
- [x] 2.4 **規則修訂兩次**：(1) 試收緊→13 false negative→revert；(2) user audit 後發現 `下圖/圖一/箭號所指/如圖` 等 288 額外真附圖→擴大 regex 至 `/\[圖\]|（圖）|\(圖\)|附圖|上圖|下圖|左圖|右圖|圖[一二三四五六七八九十甲乙丙丁ABCDE12345]|箭[頭號]所指|如圖/`
- [x] 2.5 `MEDEXAM2_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam2-tw build` 重 build
- [x] 2.6 驗 `imagePath != null` 數 = 364（dev server fetch /content/medexam2-tw/questions.json verified）
- [x] 2.7 驗 `hasImage` count = 364（從 76 升 5×）

## 2.5. PNG bundle compression (added during apply)

- [x] 2.5.1 寫 `tools/compress-medexam2-images.py` (PIL adaptive palette quantize 128 colors)
- [x] 2.5.2 dry-run 估計：57.6% 省，56.55 → 24.00 MB
- [x] 2.5.3 actual write：60.38 → 25.73 MB (dir total 32 MB; raw bytes < 30 MB budget)
- [x] 2.5.4 視覺 spot-check 壓縮後 7 張（X-ray / CT / 皮膚照 / 婦產解剖圖）— 無視覺退化

## 2.7. Image-to-question cross-verification (added during apply)

- [x] 2.7.1 寫 `tools/verify-medexam2-images.py` — 對每個 PNG 在 PDF page 上找 Q-marker rect + Q-next-marker rect，驗 image bbox 是否在範圍內
- [x] 2.7.2 跑 verify：394 PNGs → 304 OK / 47 FULL_PAGE_RENDER / 3 WRONG_Q / 40 SUSPECT_ORDER / 0 NO_VERIFY
- [x] 2.7.3 sample 5 SUSPECT_ORDER 全 OK (last-Q-on-page，1 image only, no ambiguity)
- [x] 2.7.4 trustworthy 89.1% (351/394); 3 WRONG_Q 列入 `docs/MEDEXAM2_IMAGES.md` Manual Backfill TODO

## 3. QuizModal UI rendering

- [x] 3.1 `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` line 224 後加 conditional render
- [x] 3.2 CSS 在 `apps/medexam2-hospital-tw/src/styles.css` line 1466（緊接 `.quiz-modal__stem`）
- [x] 3.3 加 CSS rules：`.quiz-modal__image` (max-width: 100%, max-height: 50vh, object-fit: contain, dark surface) + `.quiz-modal__image-missing` (border dashed, italic, muted)
- [x] 3.4 Mobile viewport CSS 驗（max-height 374.5px = 50vh, object-fit contain, rendered 112×143 完整 fit）

## 4. CREDITS + docs

- [x] 4.1 `packages/content-medexam2-tw/LICENSE.md` 加 Source 3 attribution（CREDITS.md 不存在；attribution 應加在 LICENSE.md 即可）
- [x] 4.2 `docs/MEDEXAM2_IMAGES.md` 新檔：extraction pipeline + stats + false positive analysis + Manual Backfill TODO protocol

## 5. Typecheck + build

- [x] 5.1 `pnpm -r typecheck` 全綠（7 of 8 projects all Done）
- [x] 5.2 `MEDEXAM_ALLOW_SKIPS=1 MEDEXAM2_ALLOW_SKIPS=1 pnpm -r build` 全綠

## 6. Verification (Chrome MCP smoke, port 5185)

- [x] 6.1 `pnpm --filter @study-rpg/medexam2-hospital-tw dev --port 5185` 起 dev server（VITE v5.4.21 ready）
- [x] 6.2 Chrome MCP `list_connected_browsers` preflight → navigate `http://localhost:5185/study-rpg/hospital/` (Browser 1 connected)
- [x] 6.3 走完 onboarding 招募 → 內科 P4 醫師 → 切骨科 → loop click 2 圈撞到 `108-2-醫學五-骨科-Q74`（3 歲男童髖關節 X 光附圖）→ `<img>` render 正常 (112×143). 第二輪 broader-regex 後切皮膚科 → 第一題直接 hit `114-1-醫學四-皮膚科-Q40` (foot scaling photo, 266×356)，imagePath 涵蓋「如圖所示」新 pattern 證實
- [x] 6.4 0 個 hasImage+imagePath=null real cases；fallback code path 由 code review 驗證（QuizModal.tsx conditional render）
- [x] 6.5 純文字題 (內科 Q 無附圖) → `imgExists: false, missingExists: false` ✓
- [x] 6.6 Mobile viewport CSS 驗：max-height 374.5px (50vh of 749), max-width 100%, object-fit contain, rendered fit

## 7. Pre-archive checklist

- [x] 7.1 PNG 總大小 29 MB after compression（pre-compress 57 MB → 後 24 MB；dir 含 metadata 29 MB；< 30 MB budget）
- [x] 7.2 364 張 PNG 確實存在 ↔ imagePath count 一致 0 mismatch
- [x] 7.3 改動範圍 verified（types.ts / build.ts / QuizModal.tsx / styles.css / LICENSE.md / docs/MEDEXAM2_IMAGES.md / tools/extract-medexam2-images.py / tools/compress-medexam2-images.py / tools/extraction.log / public/images/medexam2-tw/*.png × 364 / public/content/medexam2-tw/*.json）
- [x] 7.4 `/opsx:verify` 三 dim
- [ ] 7.5 `/opsx:archive`（user confirm 後）
- [ ] 7.6 auto-git commit template: `spec(archive): merge add-medexam2-question-images — 76 二階題附圖 from PDF`
