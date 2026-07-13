## 1. Part 1 — Real 陽明 詳解 replaces AI explanations ✅

- [x] 1.1 Extracted both PDFs → `_extracted/醫學{一,二}/…/115-1.md`. Result: 醫二 100/100, 醫一 94/100 anchors (6 anchor-failed).
- [x] 1.2 Sanity-checked: 6 stubs (解剖 Q27-31, 組織 Q46) are **genuinely absent** from 陽明's booklet — the 題號 card sequence jumps 26→32, so 陽明 curated them out (kept AI-tagged, never fabricated). 11 more had extract_exam mangle their 詳解/Key → recovered directly from the clean PDF text.
- [x] 1.3 `merge_115_real_explanations.py` (reuses `load_ym_paper` + `clean_explanation`): **183 replaced** with real 詳解 (drop AI tag, 陽明 credit); 6 stub + 11 empty-body left for recovery. Byte-safe. Then recovered the **11** (full 簡解+詳解 from clean PDF) → **194/200 real**.
- [x] 1.4 Fact-gate: 1 answer mismatch = 生理 Q66 (陽明 explains A; corpus answer D **with `acceptedAnswers:['A','D']`** — benign 更正 dual-accept, NOT changed). Q95 `disputed:true` intact.
- [x] 1.5 `restore_jianjie_key.py`: removed `("115","1")` from `EXCLUDE_YS` + added `explanationSource=='ai-generated'` skip guard (never prepends a 陽明 Key onto an AI stub). Applied → 177 prepend + 11 already-sentinel = **188/200 have 簡解 head**; 6 stubs correctly `ai_skip`.
- [x] 1.6 `meta.json aiGenerated` 200 → **6** (the genuinely-absent stubs).
- [x] 1.7 Diff hygiene vs HEAD: **0 non-115-1 changed, 0 answer diffs**; only `explanation`/`sourceCredit`/`explanationSource` touched on 115-1; 4600 total.

## 2. Part 2 — PDF page-map (詳解連結) ✅

- [x] 2.1 Drive links confirmed equal to owner's — no edit.
- [x] 2.2 Ran both resolvers. **Wholesale re-run caused DRIFT** (regressed 100 old 104/105 agent-recovered entries + re-added the 3 deliberately-removed 106-1 解剖 questions — the committed map is hand-curated, a fresh regen doesn't reproduce it).
- [x] 2.3 **Drift guard → non-destructive fix**: restored the committed base+residual maps, extracted ONLY the fresh 115-1 entries, merged them in (sorted + `indent=0` to match format). git diff = **776 insertions, 0 deletions**; rebuilt-map drift check = **0 non-115 changed**.
- [x] 2.4 Spot-check 5/5 sampled 115-1 (Q1/Q47/Q100 醫一, Q51/Q100 醫二) land exactly on the page whose 題號 card matches — pages accurate.
- [x] 2.5 Dropped 2 stubs the residual resolver wrongly mapped (解剖 Q30, 組織 Q46 → neighbor pages). Final unmapped = **exactly the 6 stubs** (no 陽明 詳解 → button hidden, correct). No `verified-overrides` needed.
- [x] 2.6 Rebuilt map: **194/200 × 115-1 mapped**, `bookletKey`+`driveFileId` wired (1MyR2…/1LX_q…). base +189, residual +5.

## 3. Part 3 — Regenerate per-option 簡答 from real 詳解 ✅

- [x] 3.1 Pre-cleared the **194** stale AI-derived sidecar entries (kept the 6 stubs' entries — their 詳解 unchanged → still valid). Sidecar 4600→4406.
- [x] 3.2 Built work dir: 194 per-qid inputs (+ disputed flag) + `manifest.json` as `[{qid}]`.
- [x] 3.3 Generated `jianda-out/<qid>.json` via **10 parallel Sonnet subagents** (owner switched agy→Sonnet mid-run), one chunk each, D3 contract + tuning enforced. 194/194 produced.
- [x] 3.4 QA folded into generation (each agent self-validated key-parity + 8–80 CJK + no-markup; sentinel/disputed handled).
- [x] 3.5 `merge-jianda-batch.ts`: 193/194 first pass; 1 over-length (藥理 Q63 opt D, 88 CJK) trimmed faithfully → **194/194 merged, 0 failed**. Sidecar 4600 complete.
- [x] 3.6 `resync-sidecar-hashes` = **0 drift**; `verify:option-explanations` = **4600 ok / 0 failed / 4600 total**.

## 4. Build, verify, smoke ✅

- [x] 4.1 `build:neurons-content` = `option-explanations: merged 4600 / without 簡答 0` + `copy-content.mjs` synced. (dist/public gitignored → no build churn.)
- [x] 4.2 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` = **1149 pass / 140 files**.
- [x] 4.3 Browser dev smoke on `/bank` (filter 115→第一次 = 200 Q): real questions render real-詳解 簡答, **0 AI-banner leak**, PDF button present; stub 解剖 Q27 correctly shows AI-source note + **0 PDF button** (unmapped). (Actual PDF page-jump is referrer-locked to prod — deferred to post-deploy smoke.)
- [x] 4.4 Final diff = **6 tracked modified** (meta / questions / sidecar / 2 page-maps / restore_jianjie_key.py) + 2 new (openspec change, merge_115 helper). No unrelated files.

## 5. Wrap

- [x] 5.1 `/opsx:verify` green — surfaced + fixed the stub/AI-tag scenario coherence gap; delta headers match main spec.
- [x] 5.2 `/opsx:archive` — synced 3 MODIFIED requirements into `openspec/specs/neurons-corpus-ingestion/spec.md` (full-restatement block replace + scenario-level check); `openspec validate --all` 111 passed / 0 failed; moved to `archive/2026-07-13-…`.
- [ ] 5.3 Report to owner + commit to track-neurons (awaiting confirm); prod deploy = separate 對外發布 gate.
