## 1. Build-script fix

- [x] 1.1 Patch `parseExplanationsFile` in `packages/content-medexam2-tw/scripts/build.ts` — when `### 選項詳解` header is found, advance past the header line (using `indexOf('\n', detailIdx) + 1`) before slicing into `text`
- [x] 1.2 Keep fallback path (no header found → slice from after first `\n` of qBlock) unchanged
- [x] 1.3 Add 1-line comment explaining why the header is stripped (host app renders its own section label)

## 2. Rebuild content pack

- [x] 2.1 Run `MEDEXAM2_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam2-tw build` — expect 6080 imported / 0 skipped / 100% coverage
- [x] 2.2 Confirm `dist/{questions,meta,stats}.json` + `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,meta}.json` are regenerated (build script copies automatically)

## 3. Verify

- [x] 3.1 Spot-check sample explanation (`111-1-醫學六-麻醉科-Q76` from the user's screenshot) — `explanation` SHALL start with `**A. Mallampati...**` not `### 選項詳解`
- [x] 3.2 Sweep all 6080 explanations — count of those starting with `### 選項詳解` SHALL be `0`
- [x] 3.3 Chrome MCP smoke at dev server (`localhost:5174/study-rpg/hospital/content/medexam2-tw/questions.json`) — fetched JSON matches disk contents
- [x] 3.4 Manual visual check in browser (open a quiz in `localhost:5174/study-rpg/hospital/`, answer wrong to force explanation render, confirm no double-heading) — user verified 2026-05-19

## 4. Archive

- [x] 4.1 Run `/opsx:verify` for 3-dim check (completeness / correctness / coherence) — all checks passed 2026-05-19
- [x] 4.2 Run `/opsx:archive` to sync delta into `openspec/specs/medexam2-corpus-ingestion/spec.md` — synced + validated + moved to archive/2026-05-19-fix-explanation-redundant-header 2026-05-19
- [ ] 4.3 Stage **only** the change-scope files (build.ts + 2 content artifacts + archive metadata) — explicitly exclude unrelated `apps/medexam2-hospital-tw/src/styles.css` (parallel-session WIP, multi_agent_git_safety rule)
- [ ] 4.4 `git diff --cached --name-status` to verify staging cleanliness before commit
- [ ] 4.5 Commit (user explicit OK required) with message `spec(archive): merge fix-explanation-redundant-header — strip leading section header from medexam2 explanations`
