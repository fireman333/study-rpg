# 二階國考題目附圖 (medexam2 question images)

Extraction pipeline + statistics + manual backfill protocol for the 76 hasImage
questions in `@study-rpg/content-medexam2-tw`.

## Pipeline

`tools/extract-medexam2-images.py` extracts embedded raster images from upstream
PDFs using **PyMuPDF native (`fitz`)** — selected per global PDF processing rule
since these are embedded clinical rasters (X-ray / CT / MRI / pathology /
microscopy / skin photo), not pure scans.

```bash
# Dry-run: discover only, write nothing
python3 tools/extract-medexam2-images.py --dry-run

# Actually write PNGs
python3 tools/extract-medexam2-images.py --write
```

### Algorithm

1. Filter questions where `hasImage === true` from `questions.json`
2. Parse qid `<year>-<sitting>-醫學<三|四|五|六>-<subject>-Q<n>` → locate
   `民國{year}_第{一|二}次_醫學{三|四|五|六}.pdf` in `~/Desktop/國考/二階國考/`
3. Locate page by searching normalized stem fragments (whitespace stripped +
   consecutive CJK char dedup to handle PyMuPDF column-boundary artifacts)
4. For multi-image pages, prefer image whose bbox sits below the stem text rect
   and has the largest area; fallback to "largest image" if stem rect can't be
   located via `search_for`
5. Write PNG to `apps/medexam2-hospital-tw/public/images/medexam2-tw/<qid>.png`
6. Pure-scan PDFs (no embedded raster on page) → `page.get_pixmap(dpi=150)`
   renders the full page

### Known gotchas (encountered during apply)

- **Two-column layout artifacts**: PyMuPDF text extraction interleaves columns
  on the 高點醫護 PDFs, fragmenting question text across multiple chunks. Fix:
  use `get_text("text", sort=True)` + normalized fragment search.
- **Doubled characters at column boundary**: `sort=True` occasionally emits a
  character twice when reconstructing reading order (e.g. `"男男性"`,
  `"咳嗽嗽"`, `"體體重"`). Fix: dedup consecutive identical CJK chars on both
  haystack and needle. Lossy for legitimate doubles like `慢慢/漸漸` but
  acceptable since we only need to locate the page (not preserve content).
- **MULTI_IMG (multiple embedded images on one page)**: 43 of 65 extracted
  cases. "First image" heuristic frequently grabs a header logo or sibling
  question's image. Smart picker: prefer below-stem + largest area.

## Stats (last extraction 2026-05-18, final regex run)

| Metric | Count |
|---|---|
| Total hasImage questions | **394** |
| Located on PDF page | 394 (100%) |
| **Extracted embedded image** | **347** (multi-img picker: largest-image-below-stem heuristic; 223 cases had > 1 image on page) |
| **Rendered full page** (no embedded raster) | **47** (clinical photo flattened into page background, or scanned page) |
| **Total PNG files on disk** | **394** |
| **Bundle size (pre-compress)** | 60.38 MB |
| **Bundle size (post-compress)** | **25.73 MB** (57.4% reduction via PIL adaptive palette quantize, 128 colors) |
| **Dir size (du, includes inode overhead)** | 32 MB |

By subject (sorted): 內科 62 / 外科 67 / 婦產科 55 / 皮膚科 54 / 小兒科 42 / 耳鼻喉科 19 / 神經內科 18 / 骨科 18 / 復健科 15 / 泌尿科 8 / 眼科 4 / 家醫科 2 (12 of 14 subjects covered; 精神科 / 麻醉科 無附圖題)

## Compression

Post-extraction the PNG bundle is compressed via `tools/compress-medexam2-images.py`:

```bash
python3 tools/compress-medexam2-images.py [--colors 128] [--dry-run]
```

PIL `Image.quantize(colors=128)` with adaptive palette gives ~58% size reduction
on these clinical images (mostly grayscale X-ray / CT / MRI / pathology / skin
photos) with no perceptible loss. Files < 4 KB are skipped (too small to gain).

Re-run compression after every re-extraction (extraction outputs full-color PNGs).

## Regex audit history

The detection regex evolved through three iterations during apply:

### Iteration 1 — original (built before apply phase)

```
/\[圖\]|（圖）|\(圖\)|附圖/
```

Flagged 76 questions.

### Iteration 2 — attempted tightening (reverted)

```
/\[圖\]|（圖）|\(圖\)|如附圖|附圖如|附圖所示|影像如附圖/
```

Dry-run found **13 false negatives** — questions where 附圖 appears as:

- Subject: `附圖為下肢 X 光攝影` / `附圖是一位 13 歲女性`
- Object: `根據附圖` / `有關附圖之` / `參閱附圖`
- Compound: `附圖中何者...` / `手冊的附圖` / `如二附圖`

All 13 are genuine image questions. **The tightened regex was reverted.**
Reading dozens of stems suggests bare `附圖` is essentially always a
referential noun pointing to an image.

### Iteration 3 — broadened

```
/\[圖\]|（圖）|\(圖\)|附圖|上圖|下圖|左圖|右圖|圖[一二三四五六七八九十甲乙丙丁ABCDE12345]|箭[頭號]所指|如圖/
```

User-requested audit revealed **288 additional questions** missed by Iteration 1:

| Pattern | New hits | Sample |
|---|---|---|
| `下圖` | 79 | "心電圖顯示如下圖", "血液抹片如下圖" |
| `如下圖` (subset of above) | 50 | "CT 如下圖" |
| `箭頭/箭號所指` | 23 | "電腦斷層呈現如圖，箭號所指..." |
| `圖一/圖二/圖A/圖B` | 11 | "MPI-SPECT（圖一）及 PET（圖二）" |
| `如圖` (general) | several | "...如圖所示" |

Total flagged after Iteration 3: 364 — ~5× scope expansion.

### Iteration 4 — whitespace tolerance + extra patterns + false-positive guard (current)

User-requested second audit revealed two more issues:

**A. PDF whitespace artifacts hide matches**: PyMuPDF extraction occasionally splits "附圖" into "附 圖" (with intervening space). Match patterns made whitespace-tolerant (e.g., `附\s*圖`).

**B. Additional image patterns**:

| Pattern | New hits | Sample |
|---|---|---|
| `附 圖` (whitespace split) | 4 | "電腦斷層檢查影像如附 圖" |
| `心電圖如/如下/檢查如/紀錄如` (with display verb) | 7 | "心電圖如下所示" |
| `圖中 [Ａ-Ｅ/A-E/★/▲/...]` (figure annotation) | 4 | "圖中Ａ之構造" / "圖中★為何種激素" |
| `流程圖` | 1 | "這張流程圖最適用於下列何者？" |
| `圖像` / `圖為` | 5 | "圖像如下" / "圖為頸椎的磁振造影影像" |
| `兩張圖` | 1 | "下列兩張圖為肝之超音波" |
| `如下所示` / `如下列圖` | 3 | "MRI 如下列圖示" |
| `下 圖` (whitespace) | 1 | "下 圖為注射對比劑之腎臟電腦斷層攝影" |

**C. False-positive guard**: 7 phrases stripped before regex test to prevent matching unrelated 圖 usages:

- `意圖` (intention), `試圖` (attempt), `企圖` (intent)
- `構圖` (composition), `地圖` (map), `圖書` (book), `插圖` (illustration)
- `圖表` (chart/table) — borderline; treated as table not image

Total flagged after Iteration 4: **394** (+30 vs Iteration 3, **0 removed** by the false-positive guard — all 364 previously flagged still match).

Final regex (TypeScript):

```ts
const stemForImageCheck = stem.replace(
  /意\s*圖|試\s*圖|企\s*圖|構\s*圖|地\s*圖|圖\s*書|圖\s*表|插\s*圖/g,
  ''
)
const hasImage = new RegExp(
  '\\[\\s*圖\\s*\\]|（\\s*圖\\s*）|\\(\\s*圖\\s*\\)|' +
  '附\\s*圖|上\\s*圖|下\\s*圖|左\\s*圖|右\\s*圖|' +
  '圖\\s*[一二三四五六七八九十甲乙丙丁ABCDE12345]|' +
  '箭\\s*[頭號]\\s*所\\s*指|' +
  '如\\s*圖|圖\\s*示|示\\s*意\\s*圖|流\\s*程\\s*圖|' +
  '圖\\s*像|圖\\s*為|' +
  '圖\\s*中\\s*[ＡＢＣＤＥA-Ea-e★▲△○●◇◆□■☆◎*]|' +
  '(心|肌|腦)\\s*電\\s*圖\\s*(如|為|顯\\s*示\\s*如|紀\\s*錄\\s*如|檢\\s*查\\s*如)|' +
  '如\\s*下\\s*所\\s*示|如\\s*下\\s*列\\s*圖|兩\\s*張\\s*圖'
).test(stemForImageCheck)
```

No false positives have been identified across all 394 flagged questions.

## Verification (auto-cross-check against PDF layout)

`tools/verify-medexam2-images.py` cross-checks each extracted PNG against the
source PDF: it locates the question's stem on the PDF page, finds the question
number marker (`<n>.` or `<n> `), finds the next question's marker, and
verifies that at least one image on the page has a bbox within
`[Q_n.y, Q_{n+1}.y]`. Verdicts:

| Verdict | Count | Meaning |
|---|---|---|
| OK | 304 | At least one image on the right page sits in the question's vertical range — picker output is consistent with layout |
| FULL_PAGE_RENDER | 47 | Full page render (no embedded raster on page); image always correct by construction |
| WRONG_Q | **3** | The picker grabbed an image that's clearly outside the question's vertical range — needs manual backfill |
| SUSPECT_ORDER | 40 | Last question on page or Q_{n+1} marker not reliably found; usually OK but unconfirmable |
| NO_VERIFY | 0 | All cases reach a verdict |

**Trustworthy ratio: 351/394 = 89.1%**.

The 40 SUSPECT_ORDER cases are typically last-question-on-page where there's no
upper bound to verify against. Sampling 5 showed all had only 1 image on the
page (so no ambiguity for picker) — likely all correct.

## Manual Backfill TODO

3 questions confirmed by auto-verification to have a wrong picked image:

| qid | Issue | Source PDF (open these to fix) |
|---|---|---|
| `107-1-醫學五-外科-Q19` | Picker grabbed image at y=226 (above Q19) instead of in-question region | `民國107_第一次_醫學五.pdf` page 4 |
| `107-1-醫學四-小兒科-Q6` | Picker grabbed image at y=146 (in Q7's range, only 19 px below Q7 marker) | `民國107_第一次_醫學四.pdf` page 2 |
| `108-1-醫學三-內科-Q5` | Page has 20 small heart-diagram images (Q6 multi-choice answer art); Q5's actual ECG image is on a different page or absent | `民國108_第一次_醫學三.pdf` page 1 (search nearby pages for ECG) |

### Backfill protocol

1. Open the source PDF (`~/Desktop/國考/二階國考/民國{year}_第{n}次_醫學{paper}.pdf`)
2. Screenshot the correct image region with Preview / `cmd+shift+4`
3. Save to `apps/medexam2-hospital-tw/public/images/medexam2-tw/<qid>.png` (overwrite existing)
4. Re-run `python3 tools/compress-medexam2-images.py` (optional — keeps consistent compression)
5. Re-run `MEDEXAM2_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam2-tw build`
6. Append the qid + correction note to "Recent fixes" below

### Recent fixes

(none yet — pipeline ran 2026-05-18)

## Rendering

The QuizModal renders `question.imagePath` via:

```tsx
{question.imagePath && (
  <div className="quiz-modal__image">
    <img src={`${import.meta.env.BASE_URL}${question.imagePath}`} alt="題目附圖" />
  </div>
)}
{question.hasImage && !question.imagePath && (
  <div className="quiz-modal__image-missing">
    📷 此題含附圖但尚未補齊（{question.id}）
  </div>
)}
```

`BASE_URL` resolves to `/study-rpg/hospital/` in both dev and prod. CSS sizes
to `max-width: 100%; max-height: 50vh; object-fit: contain;` for mobile safety.

## License

題目附圖屬上游國家考試題的影像部分，按 `LICENSE.md` Source 3 attribution。
原作者多為命題醫師或教學醫院；國考用途已隱含教學使用授權。CC-BY-4.0 涵蓋。

## Follow-up

- `add-medexam-tw-question-images`: 一階 1733 張附圖 (23× scope, will be split
  per-科 / per-paper if attempted)
- `add-medexam-image-zoom-modal`: tap-to-zoom + pan + long-press download
