## 1. Tune Layer ② render weights

- [x] 1.1 Widened the family-colour axon core `coreW` from `0.4·tile` to `0.6·tile` in `MazeGrid.tsx` Layer ② so the family colour is the corridor's dominant central band.
- [x] 1.2 Raised the unexplored-baseline family-core alpha `0.4 → 0.55` and dropped the unexplored gold-sheath alpha `0.2 → 0.18` (gold recedes to a frame). `sheathW` unchanged (myelin metaphor survives).
- [x] 1.3 Explored-prefix pass reuses the widened `coreW` (no structural change to the two-pass / dashing / rounded-bend logic).

## 2. Verify

- [x] 2.1 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` green (561 passed; no maze-render unit test broke — constants only).
- [x] 2.2 Live maze check: served `MazeGrid.tsx` module confirmed to carry the new constants (`coreW = 0.6·tile`, family-core `alpha 0.55`, gold `alpha 0.18`); app boots, maze canvas mounts, no error boundary, no console errors. NOTE: the maze **canvas pixel colours cannot be sampled headlessly** — the maze draw loop is `requestAnimationFrame` and the Chrome-MCP tab is background-throttled (`document.hidden`), so the canvas never paints in the automation context (documented `chrome_mcp_raf_throttle` limitation). The change is deterministic constant-tuning with no logic risk; final visual distinctness is owner-eyeballed on the foreground/prod maze.
- [x] 2.3 Zero schema/sync/economy change (no Dexie / R2 / Worker edit; routes + grid graph untouched); `lint:dexie-fixtures` no-op. `/simplify` skipped — a 3-constant numeric tuning has nothing to reuse/simplify; dead-code audit clean via `noUnusedLocals` typecheck.
