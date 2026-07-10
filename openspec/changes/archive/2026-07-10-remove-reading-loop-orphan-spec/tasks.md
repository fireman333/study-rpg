## 1. Pre-removal verification (no-op confirmation)

- [ ] 1.1 Re-confirm `readMs` / `READING_IDLE_TIMEOUT_MS` / `READING_TICK_MS` have zero references in `apps/` and `packages/` (`grep -rn -E "readMs|READING_IDLE_TIMEOUT_MS|READING_TICK_MS" apps/ packages/` → empty)
- [ ] 1.2 Re-confirm no `neurons-*` live spec references the `reading-loop` capability (only `engine-rewards:5` + `dorm-view:69`, both themselves orphaned 一階 specs, plus dated decision log + archive)

## 2. Spec removal (handled by archive)

- [ ] 2.1 Confirm the REMOVED delta `specs/reading-loop/spec.md` lists all 5 original requirements with **Reason** + **Migration** (no scenarios needed for REMOVED ops)
- [ ] 2.2 Run `/opsx:verify` — completeness / correctness / coherence all green
- [ ] 2.3 Run `/opsx:archive` (with sync gate) — this deletes `openspec/specs/reading-loop/` and drops live spec count 92 → 91

## 3. Post-removal verification

- [ ] 3.1 Confirm `openspec/specs/reading-loop/` no longer exists after archive
- [ ] 3.2 Run `openspec validate --strict` (or repo's validate) — all remaining specs pass (the two dangling prose refs in `engine-rewards` / `dorm-view` do not fail validation; left for the future 一階 orphan-cluster cleanup change)
- [ ] 3.3 Await explicit owner confirmation before any `git commit` (curator rule: no auto-commit)
