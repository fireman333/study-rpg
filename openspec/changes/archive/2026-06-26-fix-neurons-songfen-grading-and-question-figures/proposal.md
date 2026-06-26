## Why

This change began as a full re-source of the neurons question corpus from 考選部 official PDFs (the original `rebuild-neurons-corpus-from-official-pdfs`). The Phase-0 probes (kept in `PROBE_RESULTS.md` + `probes/`) **invalidated that premise**: `reconcile.py` already sources stem/options/answer from 考選部 (陽明 supplies only the 詳解), so a fresh official parse reproduced the existing 107-115 stems byte-for-byte for 3266/3400 questions — the 134 differences were cosmetic `pdftotext` whitespace, with 0 garble fixes and ~3 superscript regressions. The garble the owner had hit was all in the 陽明 **詳解**, which this change never re-sources. 104-106 are equally clean (0 garble / 0 empty options / 1194-1200 with 詳解), so dropping them would lose 1200 good questions + player progress for no quality gain.

The deep probe nonetheless surfaced **two real, player-facing defects** the existing pipeline missed (its positional `parse_answers` was 59% wrong on 更正 files), plus a small set of un-captured question figures. This change delivers exactly those fixes and nothing else.

## What Changes

- **Fix 3 missing 送分/更正 gradings** in `data/medexam-reconciled/questions.json` (the existing pipeline's buggy answer parser dropped them, so these questions currently mis-grade players):
  - `107-2-醫學二-病理學-Q85` → `acceptedAnswers: ["A","C"]` (官方備註「第85題答Ａ、Ｃ給分」)
  - `111-1-醫學二-公共衛生學-Q49` → `disputed: true` (官方備註「第49題，一律給分」)
  - `111-2-醫學一-生理學-Q65` → `disputed: true` (官方備註「除未作答者不給分外，其餘均給分」)
- **Capture 4 missing 題幹 figures** from the official PDFs into `packages/content-neurons-tw/figures/<id>.png` (the build wires `imagePath`+`hasImage` from file presence — existing `neurons-question-figures` mechanism): `111-1-醫學一-解剖學-Q29` (手背神經分布), `111-2-醫學一-解剖學-Q29` (視野缺損), `108-2-醫學二-公共衛生學-Q40` (2×2 case-control table), `114-2-醫學二-公共衛生學-Q38` (data table). `111-1` was showing a `[圖]` placeholder; the other 3 weren't even flagged.
- **Flag 2 image-only-option questions** `hasOptionImages: true` (`109-1-醫學一-生物化學-Q100` DNA 序列圖, `114-1-醫學一-生物化學-Q77` NAD 結構圖) — their options are pure images with no recoverable text, so they currently render 4 blank options (unanswerable). Flagging excludes them from quiz pools (existing `QuizModal` behavior).
- **Add a robust official-answer parser** (`reconcile/parse_moex_official.py`) — spatial answer-grid + 備註 decode — that re-verified every 107-115 standard answer against the corpus (2970/2970, 0 conflicts) and is the tool that found the 3 送分 gaps. Replaces reliance on the buggy positional `parse_answers` for future answer audits.
- **Keep all 4600 questions** (104-115); **no full re-source**, no whitespace churn, no 104-106 drop.

## Capabilities

### Modified Capabilities

- `neurons-corpus-ingestion`: official 送分/更正 (一律給分 / 答X或Y給分 / 更正單一答案) SHALL be encoded as `disputed` / `acceptedAnswers` so the quiz credits them; a question whose options are images-only SHALL be flagged `hasOptionImages` so the quiz excludes it rather than presenting blank options.

## Impact

- **Content package** (`packages/content-neurons-tw/`): 5 surgical field edits in `data/medexam-reconciled/questions.json` (3 送分 + 2 `hasOptionImages`); 4 new `figures/<id>.png`; new `reconcile/parse_moex_official.py` + `reconcile/rebuild_official.py` (the audit/probe tooling). 4595/4600 questions byte-identical.
- **App** (`apps/neurons-tw/`): no code change — the figures wire via the existing build mechanism; the 送分 grading + `hasOptionImages` exclusion are existing `QuizModal` behaviors.
- **Players** (prod `med-study-rpg.com/neurons/`): 3 questions stop mis-grading 送分; 4 questions show their figure; 2 unanswerable blank-option questions leave the quiz pool. No save migration, no schema bump, no re-login.
- **Out of scope / not done**: the full official re-source (no benefit — see `PROBE_RESULTS.md`); dropping 104-106 (kept); 18 partially-blank-option questions (noted follow-up); 6 remaining `[圖]` placeholders are 104-105 病理/生理 figures with no official PDF source.
