## 1. Spec audit (read-only — confirm code already matches tightened spec)

- [ ] 1.1 Read `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts:104-110` and confirm `settlesKeys = FAMILY_IDS.map((f) => 'maze:${f}:settles')` is the per-family aggregation.
- [ ] 1.2 Read `apps/neurons-tw/src/lib/maze/economy.ts:84` and confirm `settlesKey = (familyId) => 'maze:${familyId}:settles'` is the per-family writer.
- [ ] 1.3 Grep `apps/neurons-tw/src/` for any remaining reference to `maze:da:settles` / `maze:5ht:settles` / `maze:gaba:settles` / `maze:glu:settles` legacy keys. Any hit outside `__tests__/` covering legacy-key tolerance is a real reader to clean up.
- [ ] 1.4 Confirm `FAMILY_IDS` is exported from `content-neurons-tw` and is imported by `services/neurons-leaderboard.ts` (already true per 1.1).

## 2. Code edits (only if §1 found a stale reader)

- [ ] 2.1 If 1.3 found a non-test legacy-key read site: remove it. If it was an intentional fallback (e.g. one-time migration), document why and convert to a one-shot ignore-only.
- [ ] 2.2 If 1.1 / 1.2 found a divergence from per-family aggregation: rewrite to match. Otherwise no-op.

## 3. Tests (vitest regression-guard — always added)

- [ ] 3.1 Add `apps/neurons-tw/src/__tests__/leaderboard-total-settles.test.ts` covering:
  - **Per-family sum** — `maze:藥理學:settles = 40`, `maze:解剖學:settles = 25`, `maze:組織學:settles = 18`, other 8 families absent → `total_settles = 83`.
  - **Legacy keys ignored** — seed `maze:da:settles = 99` + `maze:gaba:settles = 77` alongside the per-family keys → `total_settles` SHALL be the per-family sum (83), NOT include 99 + 77.
  - **Defensive read** — a per-family key absent from `meta` SHALL contribute 0, not throw.
- [ ] 3.2 If change 3's `ownedSlotCount` test for the leaderboard payload (`leaderboard-variant-count-ownedslotcount.test.ts` or equivalent name) has already landed: extend it with a `total_settles` assertion. Otherwise leave the test in 3.1 as standalone.

## 4. Verification

- [ ] 4.1 Run `pnpm --filter @study-rpg/neurons-tw test` — all green.
- [ ] 4.2 Run `pnpm -r typecheck` — clean.
- [ ] 4.3 Run `pnpm lint:dexie-fixtures` — pass (no `.version()` bump).
- [ ] 4.4 Run `openspec validate fix-leaderboard-total-settles-to-per-family-keys` — clean.
- [ ] 4.5 Run `/opsx:verify` — green on completeness / correctness / coherence.
- [ ] 4.6 Chrome MCP smoke skipped: zero user-visible behavior change. Document skip rationale.

## 5. Archive (⚠ ordering-sensitive)

- [ ] 5.1 **Pre-archive ordering gate**: confirm `unify-distinct-owned-projection-across-fusion-achievements-leaderboard` (change 3 in this propose batch) has already archived. Verify by:
  - `grep ownedSlotCount openspec/specs/neurons-leaderboard/spec.md` returns at least 1 hit (proof change 3 has synced its delta).
  - `ls openspec/changes/archive/ | grep unify-distinct-owned-projection` returns a result (proof of archive).
  - If either check fails: **HOLD this change's archive** until change 3 archives, OR rebase this change's MODIFIED text by re-pulling the then-current Requirement from `openspec/specs/neurons-leaderboard/spec.md` and re-applying only the settles-related edits.
- [ ] 5.2 Confirm working tree is clean of unrelated changes per multi-agent git safety rule.
- [ ] 5.3 `/opsx:archive` — sync delta into `openspec/specs/neurons-leaderboard/spec.md`.
- [ ] 5.4 Post-archive sanity: `grep -E 'maze:da:settles|maze:5ht:settles|maze:gaba:settles|maze:glu:settles' openspec/specs/neurons-leaderboard/spec.md` returns **0 hits** in any normative read-path clause (legacy retirement clause is allowed to name them as a「DO NOT read」 list, but no requirement / scenario should source the build expression from them).
- [ ] 5.5 Auto-git commit (explicit per-file add) with subject `spec(archive): merge fix-leaderboard-total-settles-to-per-family-keys — total_settles 改 11 per-family aggregation`.
- [ ] 5.6 Push to origin/track-neurons. Merge to main left to user-driven sync per project workflow.
