## Tasks

### Spec

- [x] **T1**: Write `specs/reading-loop/spec.md` with 5 requirements

### Impl

- [x] **T2**: Add `READING_TICK_MS` constant + `READING_IDLE_TIMEOUT_MS` constant at top of `App.tsx`
- [x] **T3**: Add `pauseReason` state (`'manual' | 'visibility' | 'idle' | null`) to track why paused
- [x] **T4**: Add `useEffect` for `visibilitychange` listener (sets `reading=false` + `pauseReason='visibility'`)
- [x] **T5**: Add idle detection — 90s no `mousemove/keydown/touchstart` → `setReading(false)` + `pauseReason='idle'`
- [x] **T6**: Update reading button hint text to show pause reason when paused
- [x] **T7**: `pnpm -r typecheck` green
- [x] **T8**: `pnpm --filter @study-rpg/medexam-tw build` green; no `.js` in src/

### Verify

- [x] **T9**: Chrome MCP smoke — start reading, switch tabs, confirm auto-pause + reason hint
- [x] **T10**: Chrome MCP smoke — 90s idle (simulated via dispatched event) triggers idle pause

### Archive

- [x] **T11**: `openspec validate harden-reading-loop`
- [x] **T12**: `openspec archive harden-reading-loop -y`
- [x] **T13**: auto-git commit
