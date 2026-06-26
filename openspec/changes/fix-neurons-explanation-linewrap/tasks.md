## 1. Implement rejoin in normalizeExplanation

- [x] 1.1 Add `visualWidth(s)` helper (CJK-aware: east-asian W/F/A = 2, else 1) — in new pure module `scripts/rejoin-hard-wraps.ts`
- [x] 1.2 Add `isSeparatorLine(s)` (≥3 box-drawing/dash/rule chars) and `STRUCTURAL_START` (list/enum markers, Ref/圖/表/heading brackets) helpers
- [x] 1.3 Add the width-guarded rejoin pass (`rejoinHardWrappedLines`) called at the END of `normalizeExplanation` (after footer-strip + blank-collapse, before final trim): fuse adjacent non-blank lines when prev width ≥ threshold AND prev not ending in sentence-final punct/closing bracket AND next not a structural item/separator AND neither is a separator; join with single space only when both boundary chars are ASCII-alnum, else no char
- [x] 1.4 Define wrap-width threshold as a named constant (`WRAP_MIN_WIDTH = 28`); confirm value in §3 from the built sample

## 2. Test (deterministic, content-safe)

- [x] 2.1 Add tsx verify cases (project convention is `verify:*` scripts, not vitest) in `scripts/verify-normalize.ts` covering: mid-word wrap rejoin, ASCII-word wrap (space inserted), break kept after sentence-final punct, break kept before `1°`/list markers, no fusion across `────` separator, no fusion into short header (`參考資料`), single-char vertical run (`依\n栓\n塞`) left intact, bare single-digit preserved, blank line blocks fusion — 9/9 pass
- [x] 2.2 Content-safety invariant over ALL real source: `stripWS(before) === stripWS(after)` per question — **4588 scanned, 4065 changed, 0 content violations**
- [x] 2.3 `pnpm --filter @study-rpg/content-neurons-tw verify:normalize` green; `typecheck` clean

## 3. Audit residual (agents — review only, no corpus edits)

- [x] 3.1 `scripts/sample-rejoin-audit.ts` emitted a 33-question before/after sample (table-bearing + high-join + spread)
- [x] 3.2 4 parallel agents reviewed the sample → findings: severe TABLE_DAMAGE concentrated in flattened tables (isTable flag UNRELIABLE — Latin tables are isTable=false); systematic section-label / citation / bullet fusion in non-table prose
- [x] 3.3 Added deterministic guards from findings: (a) build.ts skips rejoin for table-image questions (CJK tables); (b) both-CJK-free guard (Latin tables/labels/citations); (c) section-label + `＞`/`>`/`•` bullet + ordered `(1.)` markers; (d) URL / citation-page / verdict-tag / Word-dash keep-breaks; (e) ASCII↔ASCII boundary left broken (no space-guessing). verify-normalize 17/17 + invariant 0 violations. `scripts/spot-check-fixes.ts` confirms all severe cases fixed
- [x] 3.4 Wrap-width threshold confirmed at `WRAP_MIN_WIDTH = 28` against the audited sample
- [ ] 3.5 (optional) Remove one-off audit scaffolding `scripts/sample-rejoin-audit.ts` + `scripts/spot-check-fixes.ts` before commit (keep permanent `verify-normalize.ts`); known minor residuals left as-is (Q72 parallel 「以「X」為詞尾」 list, Q85 Word-dash-no-space, Q94 lone-bullet — cosmetic, no content loss)

## 4. Build, verify, ship (coordination-gated)

- [ ] 4.1 GATE: confirm work tree clean or coordinated with the other session (`public/questions.json` + untracked `explanation-figures/*.webp`) before rebuilding
- [ ] 4.2 `pnpm run build:neurons-content` + copy-content → regenerate `apps/neurons-tw/public/content/neurons-tw/questions.json`; check No-Silent-Errors counter output
- [ ] 4.3 Chrome MCP smoke: open a few rejoined explanations (prose / list / table-bearing) in the app, confirm they read continuously and structure is intact
- [ ] 4.4 `/opsx:verify` → `/opsx:archive` (syncs delta into `openspec/specs/neurons-corpus-ingestion/spec.md`)
- [ ] 4.5 Commit with explicit per-file `git add` (build.ts + test + built questions.json + meta.json + openspec change/spec files only); NEVER `git add -A`; user-confirmed commit
