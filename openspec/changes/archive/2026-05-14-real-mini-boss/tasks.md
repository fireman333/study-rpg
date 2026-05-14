## Tasks

### Spec

- [x] **T1**: Write `specs/mini-boss/spec.md` with 6 requirements

### Impl

- [x] **T2**: New component `apps/medexam-tw/src/components/BossModal.tsx` — 30Q + countdown
- [x] **T3**: Wire `App.tsx` — replace stub `fightMiniBoss` with `setBossOpen(true)`
- [x] **T4**: Add `onBossComplete(result)` handler — write `db.bossRuns`, grant badge / XP / rolls
- [x] **T5**: Add boss CSS (timer chip + summary panel) in `styles.css`

### Verify

- [x] **T6**: `pnpm -r typecheck`
- [x] **T7**: `pnpm --filter @study-rpg/medexam-tw build`; src/ clean
- [x] **T8**: Chrome MCP smoke (fail path) — open boss → answer 1 → force timer end → assert summary fails, no badge, consolation roll
- [x] **T9**: Chrome MCP smoke (pass path) — open boss → JS-inject correct answers for 18+ Q → assert badge `boss:藥理學:mini` granted + 50 XP + 3 rolls
- [x] **T10**: Verify db.bossRuns has the run record

### Archive

- [x] **T11**: `openspec validate real-mini-boss`
- [x] **T12**: `openspec archive real-mini-boss -y`
- [x] **T13**: auto-git commit
