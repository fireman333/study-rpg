# Tasks — enforce-dexie-upgrade-fixture-rule

## 1. Lint script

- [x] 1.1 Create `scripts/lint-dexie-fixtures.sh` (bash, ~150 lines) following Decisions 1–5:
  - Read `BASE_REF` (default `origin/main`) and `HEAD_REF` (default `HEAD`) from env
  - Honour `SKIP_DEXIE_FIXTURE_LINT=1` escape hatch (emit loud banner, exit 0)
  - Discover schemas via `git ls-files 'apps/**/*.ts' 'packages/**/*.ts' | xargs grep -l "this\.version("` (also require `.stores(` co-presence)
  - For each schema file: extract base + head version numbers (`grep -oE 'this\.version\(([0-9]+)\)' | grep -oE '[0-9]+' | sort -nu`), compute set diff via `comm -23`
  - For each new version N: resolve test dir (`<schema_parent>/__tests__/` after stripping `/db` or `/lib` suffix via `sed -E 's#/(db|lib)$##'` — `#` delimiter avoids BSD sed `|` collision), require any `*.test.ts` containing literal `.version(N-1).stores(`
  - Exit 1 with `::error::` annotation + actionable message listing schema file + version + expected test pattern + path to `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`
  - Exit 0 with `[lint:dexie] OK` on success
- [x] 1.2 Make script executable: `chmod +x scripts/lint-dexie-fixtures.sh`
- [x] 1.3 Self-test the script locally on current `main` HEAD (no diff from `origin/main`) → exit 0 with "OK" ✓
- [x] 1.4 Self-test: synthetic schema bump scenario in isolated tmp repo (avoided modifying real repo per multi-agent git safety)
  - Init tmp repo with `apps/test-app/src/db/schema.ts` containing `this.version(1).stores({ rows: '++id, name' })`
  - Commit baseline, then bump to `this.version(2).stores({ rows: '++id, name, extra' })`, commit
  - Run `BASE_REF=HEAD~1 HEAD_REF=HEAD bash ./lint.sh` → exit 1 with violation `apps/test-app/src/db/schema.ts v1 → v2: missing fixture under apps/test-app/src/__tests__ matching pattern '.version(1).stores('` ✓
- [x] 1.5 Self-test: synthetic schema bump + matching fixture scenario in same tmp repo
  - Add `apps/test-app/src/__tests__/upgrade-v2.test.ts` containing `dbV1.version(1).stores({ rows: '++id, name' })`
  - Commit, then `BASE_REF=HEAD~2 HEAD_REF=HEAD bash ./lint.sh` → exit 0 with `fixture FOUND in apps/test-app/src/__tests__/upgrade-v2.test.ts` ✓
- [x] 1.6 BONUS: SKIP_DEXIE_FIXTURE_LINT=1 bypass test → exit 0 with banner ✓
- [x] 1.7 BONUS: no-change scenario (HEAD vs HEAD) → exit 0 ✓

## 2. CI workflow

- [x] 2.1 Create `.github/workflows/dexie-fixture-lint.yml`:
  - Trigger on `push` to `main` (paths filter: `apps/**/*.ts`, `packages/**/*.ts`, `scripts/lint-dexie-fixtures.sh`, the workflow file itself) AND `pull_request` to `main` (same filter)
  - Single job `lint` on `ubuntu-latest` with `permissions: contents: read`
  - Checkout with `fetch-depth: 0` (need full history for `git show $BASE_REF:`)
  - Compute BASE_REF in `Resolve refs` step: PR event → `${{ github.event.pull_request.base.sha }}`; push event → `${{ github.event.before }}` falling back to `HEAD~1` if all-zeros
  - Compute HEAD_REF: PR event → `${{ github.event.pull_request.head.sha }}`; push event → `${{ github.sha }}`
  - Run `BASE_REF=$BASE_REF HEAD_REF=$HEAD_REF bash scripts/lint-dexie-fixtures.sh`
- [x] 2.2 Verify workflow YAML syntax via `python3 yaml.safe_load` (actionlint not installed locally; YAML structure parsed clean) ✓
- [x] 2.3 Paths filter confirms workflow does NOT trigger on docs-only / non-TS commits

## 3. Package script alias

- [x] 3.1 Added to root `package.json` `scripts`: `"lint:dexie-fixtures": "BASE_REF=origin/main HEAD_REF=HEAD bash scripts/lint-dexie-fixtures.sh"`
- [x] 3.2 Verified `pnpm lint:dexie-fixtures` exits 0 on clean `main` HEAD ✓

## 4. Documentation

- [x] 4.1 Created `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` covering: What, Why (with v1 incident commit references `dac4eae` → `99eac9b`), How to satisfy (canonical pattern with code snippet adapted from `retirement-tombstone.test.ts:30–80`), Where the fixture lives (path resolution table), Local invocation, CI behaviour, Escape hatch, Known limitations, Cross-references
- [x] 4.2 Added one paragraph to project `CLAUDE.md` "Known sharp edges" section (before the CF/GH Pages asymmetry paragraph) — one-sentence summary, pointer to `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`, pointer to canonical fixture, Why context referencing v1 incident
- [ ] 4.3 (Optional) Cross-reference from `imports/dexie_pk_change_pitfall.md` "How to apply" section — SKIPPED per Scope Expansion Guard (modifying `~/.claude/imports/` global imports out of project scope); project CLAUDE.md pointer is sufficient

## 5. Validation

- [x] 5.1 `openspec validate enforce-dexie-upgrade-fixture-rule --strict` → pass ✓
- [x] 5.2 `pnpm typecheck` not run — no TS source changed; only sanity intent, not blocking
- [x] 5.3 `pnpm lint:dexie-fixtures` exit 0 on clean HEAD ✓
- [ ] 5.4 Push a feature branch with no-op TS comment to verify no false positive — SKIPPED in favor of pre-shipping by lint already proving no-change scenario exit 0 in tmp repo §1.7; first real CI run after push will provide additional confidence in §7.6

## 6. Verify (end-to-end smoke)

- [x] 6.1 Synthetic test recipe documented in `scripts/lint-dexie-fixtures.sh` header comments (lines 11–23)
- [x] 6.2 `pnpm run` lists `lint:dexie-fixtures` alongside other scripts ✓
- [x] 6.3 CLAUDE.md "Known sharp edges" visible diff confirms rule pointer present ✓
- [x] 6.4 `openspec validate --all --strict` → only failure is unrelated dormant `remove-medexam-tw-and-promote-neurons` proposal (untouched by this change); 62/63 pass including this change ✓

## 7. Composing commit + archive

- [x] 7.1 Staged 9 explicit files via per-file `git add` (multi-agent git safety — no `-A`): scripts/lint-dexie-fixtures.sh, .github/workflows/dexie-fixture-lint.yml, package.json, docs/DEXIE_UPGRADE_FIXTURE_RULE.md, CLAUDE.md, openspec/changes/enforce-dexie-upgrade-fixture-rule/{proposal,design,tasks}.md, openspec/changes/.../specs/dexie-schema-guards/spec.md. Confirmed staging clean (no leakage of pre-existing dormant proposals)
- [x] 7.2 Committed as `385f755` on `main`: title `spec(propose+impl): enforce-dexie-upgrade-fixture-rule — CI lint + canonical fixture pattern`; body covers root cause, mechanism, capability rationale, bug-caught-during-self-test (BSD sed delimiter), files list, out-of-scope ✓
- [ ] 7.3 With user confirm: `/opsx:archive enforce-dexie-upgrade-fixture-rule` (workflow syncs delta + moves to archive/) — IN PROGRESS
- [ ] 7.4 With user confirm: `git commit -m "spec(archive): merge enforce-dexie-upgrade-fixture-rule — CI lint + canonical fixture pattern"` (auto-git skill)
- [ ] 7.5 With user confirm: `git push origin main` — wait for CI green (deploy.yml + deploy-cf-pages.yml + the new dexie-fixture-lint.yml all pass)
- [ ] 7.6 Verify in GH Actions UI that the new workflow ran AND exited 0 (sanity check on first real run)

## 8. Follow-ups (DO NOT include in this change)

- [ ] 8.1 Spawn `add-bundle-schema-version-guard` (A1) — extends `dexie-schema-guards` capability with Worker-side `x-amz-meta-schema-version` enforcement on R2 PUT
- [ ] 8.2 (Optional, low priority) Consider relaxing the literal `.version(N-1).stores(` regex to also accept a constant-import pattern (e.g., `.version(20).stores(V20_SCHEMA)`), once an author actually needs it. Defer until concrete use case arises
- [ ] 8.3 (Optional) Backfill upgrade fixtures for selected historically-risky schema versions if a pattern of schema-related bugs emerges. Currently no evidence of need beyond v18 → v19 (which has §8.12 fixture)
