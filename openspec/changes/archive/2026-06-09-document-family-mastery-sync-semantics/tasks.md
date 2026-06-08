## 1. Spec audit (read-only — confirm existing adapter matches tightened spec)

- [x] 1.1 Read `apps/neurons-tw/src/lib/sync/tables.ts:161-200` (`familyMasteryAdapter`) and confirm the `apply` function does per-field `Math.max(local, incoming)` on both `correct` and `total`, with no row-LWW fallback.
- [x] 1.2 Read `apps/neurons-tw/src/lib/sync/r2/bundles.ts` and confirm `familyMastery` is in the bundle key allowlist (i.e. actually round-trips through the adapter on push / pull).
- [x] 1.3 Grep `apps/neurons-tw/src/` for any other writer to `db.familyMastery.put` outside the connectome AP transaction (per the atomic-write requirement). Confirm no writer bypasses the monotonic increment invariant.

## 2. Code edits (only if §1 found divergence)

- [x] 2.1 If 1.1 found row-LWW or a missing-field default that could regress: rewrite the adapter to per-field MAX matching the spec wording verbatim. Otherwise no-op.
- [x] 2.2 If 1.2 found `familyMastery` missing from the bundle allowlist: add it. Otherwise no-op.
- [x] 2.3 If 1.3 found a writer that does not maintain `total >= correct`: fix at the source (or document why the writer is bypass-safe in a code comment).

## 3. Regression-guard test (always added — pins the contract for future contributors)

- [x] 3.1 Add `apps/neurons-tw/src/__tests__/family-mastery-merge.test.ts` with three cases:
  - **MAX-merge per field** — `(correct: 12, total: 17)` and `(correct: 11, total: 19)` round-trip → `(correct: 12, total: 19)` regardless of apply order; invariant `total >= correct` holds.
  - **Idempotent re-apply** — applying the same incoming row twice does not double-count.
  - **Documented collapse** — both sides start from `(3, 5)`; A locally goes to `(4, 6)` (correct attempt); B locally goes to `(3, 6)` (incorrect attempt); merge yields `(4, 6)` (lost the incorrect attempt's total increment is expected). Asserts the spec's accepted limitation.

  Use the existing test scaffold pattern from `apps/neurons-tw/src/__tests__/question-history-merge.test.ts` (no real Dexie, direct adapter call).

## 4. Verification

- [x] 4.1 Run `pnpm --filter @study-rpg/neurons-tw test` — all green including the new regression-guard test.
- [x] 4.2 Run `pnpm -r typecheck` — clean (no API surface change expected).
- [x] 4.3 Run `pnpm lint:dexie-fixtures` — pass (no `.version()` bump in this change).
- [x] 4.4 Run `openspec validate document-family-mastery-sync-semantics` — clean.
- [x] 4.5 Run `/opsx:verify` — green on completeness / correctness / coherence.
- [x] 4.6 Chrome MCP smoke skipped: this change is sync-semantic only, no user-visible behavior change. Document skip rationale in the verify report.

## 5. Archive

- [x] 5.1 Confirm working tree is clean of unrelated changes per multi-agent git safety rule.
- [x] 5.2 `/opsx:archive` — sync delta into `openspec/specs/neuron-family-mastery/spec.md` (tracking requirement only; other 6 requirements unchanged).
- [ ] 5.3 Auto-git commit (explicit per-file add) with subject `spec(archive): merge document-family-mastery-sync-semantics — familyMastery MAX-merge 規範化`.
- [ ] 5.4 Push to origin/track-neurons. Merge to main left to user-driven sync per project workflow.
