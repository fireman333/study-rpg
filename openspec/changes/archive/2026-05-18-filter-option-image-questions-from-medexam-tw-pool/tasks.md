## 1. 一階 build script

- [x] 1.1 In `packages/content-medexam-tw/scripts/build.ts`, extend `ParsedQuestion` interface to include `hasOptionImages: boolean`.
- [x] 1.2 Add `const OPTION_IMAGE_MARKER = /_\(圖片或缺失\)_/` adjacent to the `ParsedQuestion` interface (mirror of the 二階 build script).
- [x] 1.3 Inside `parseSingleBlock`, after options dict fully populated, compute `const hasOptionImages = Object.values(options).some((v) => OPTION_IMAGE_MARKER.test(v))`.
- [x] 1.4 Return `hasOptionImages` on the constructed `ParsedQuestion` object.

## 2. 一階 host app filter

- [x] 2.1 In `apps/medexam-tw/src/App.tsx`, replace the bare `.then(setContent)` in the `getContentPack(...)` mount-effect with a `.then((pack) => setContent({ ...pack, questions: pack.questions.filter((q) => q.hasOptionImages !== true) }))` form.
- [x] 2.2 Inline comment explains the forward-compat purpose (0 currently affected; gate prevents silent leak from future regression).

## 3. Rebuild + verify

- [ ] 3.1 Run `MEDEXAM_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam-tw build`. Confirm `imported / skipped / total = 3291 / 309 / 3600` (baseline unchanged).
- [ ] 3.2 `jq '[.[]|select(.hasOptionImages==true)]|length' packages/content-medexam-tw/dist/questions.json` returns `0` — 一階 corpus has zero option-image questions today, so the filter is a no-op.
- [ ] 3.3 `jq '.[] | select(.hasOptionImages==null)] | length' packages/content-medexam-tw/dist/questions.json` returns `0` — every Q emits the field as `false`.
- [ ] 3.4 `cp packages/content-medexam-tw/dist/*.json apps/medexam-tw/public/content/medexam-tw/` per project CLAUDE.md convention.

## 4. Typecheck

- [ ] 4.1 `pnpm -r typecheck` passes with zero new errors.

## 5. Validate spec

- [ ] 5.1 `openspec validate filter-option-image-questions-from-medexam-tw-pool` returns success.
- [ ] 5.2 `openspec validate --all` returns zero failures.

## 6. Smoke

- [ ] 6.1 Boot `pnpm --filter @study-rpg/medexam-tw dev`. Verify no console error from filter path.
- [ ] 6.2 Via Chrome MCP `javascript_tool`, fetch the served `questions.json`, count `hasOptionImages === true` → expect exactly 0. Confirm `pack.questions.filter((q) => q.hasOptionImages !== true).length === pack.questions.length` (no-op filter).

## 7. Archive + deploy

- [ ] 7.1 Sync spec deltas into `openspec/specs/quiz-runner/spec.md` (via `/opsx:archive` or manual append).
- [ ] 7.2 Move change folder to `openspec/changes/archive/<YYYY-MM-DD>-filter-option-image-questions-from-medexam-tw-pool/`.
- [ ] 7.3 Commit on `track-m2` with message `spec(archive): merge filter-option-image-questions-from-medexam-tw-pool — 一階 forward-compat mirror`.
- [ ] 7.4 Fast-forward merge `track-m2 → main` from `~/coding-scratch/study-rpg/`; push origin/main.
- [ ] 7.5 Confirm GH Actions deploy run succeeds and 一階 prod still loads `questions.json` without error.
