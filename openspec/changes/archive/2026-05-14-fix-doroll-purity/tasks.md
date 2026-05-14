## Tasks

- [x] **T1**: Write `specs/loot-mechanics/spec.md` with 1 ADDED Requirement on caller purity
- [x] **T2**: Rewrite `doRoll` in `App.tsx` — extract `rollLoot` + `instanceFromRoll` outside `setPlayer` updater
- [x] **T3**: `pnpm -r typecheck`
- [x] **T4**: `pnpm --filter @study-rpg/medexam-tw build`; verify src/ clean
- [x] **T5**: `node scripts/loot-smoke.mjs` — confirm distribution unchanged
- [x] **T6**: Chrome MCP smoke — clear IDB → reload → 3 manual rolls → assert totalRolls === instCount === 3
- [x] **T7**: `openspec validate fix-doroll-purity`
- [x] **T8**: `openspec archive fix-doroll-purity -y`
- [x] **T9**: auto-git commit
