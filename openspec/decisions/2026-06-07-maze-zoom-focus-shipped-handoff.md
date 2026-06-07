# Handoff — `add-neurons-maze-zoom-and-focus` SHIPPED (2026-06-07, written before `/clear`)

> Next session: `/spec resume` surfaces this. State at write: **no active OpenSpec changes**, both worktrees clean + in sync with origin, `openspec validate --all --strict` = 84/0.

## What just shipped (this session)

**`add-neurons-maze-zoom-and-focus`** — full `/spec` pipeline (resume → /grill Deep → propose → apply → /verify → archive → merge → deploy → prod-verify). **Live at `med-study-rpg.com/neurons/`.**

- Commits: `1ae3a1c` feat + `4755ce7` spec(archive) on `track-neurons` → `cdfc1a3` `--no-ff` merge on `main`. CF Pages deploy run `27085861225` success.
- Archive: `openspec/changes/archive/2026-06-07-add-neurons-maze-zoom-and-focus/`. Specs synced: `neurons-brain-maze` (+1 ADDED quiz-energy-strip, ~2 MOD camera+economy-reading) + `neurons-homepage` (~2 MOD CTA-toolbar-drops-toggle + reading-start-per-subject). Spec count stays **84**.
- **Zero schema/sync** (existing `maze:<fam>:earned` pools, zoom not persisted) → dexie-lint no-op.

Four things: (1) mobile touch (pinch + pan + double-tap recenter, `touch-action:none`); (2) sticky manual focus on FamilyPicker card-tap + 🔭 全覽 recenter (`maze-focus.ts` `emitMazeFocus(id,{manual})` + `emitMazeRecenter`); (3) **per-subject reading** (global toggle removed → 11 per-family 📖; `reading-timer` carries `familyId`; energy all to the chosen subject; `totalStudyMinutes` stays global); (4) QuizModal `EnergyFeedbackStrip` above 詳解 on correct answers, escalating to a CSS walker-advance tween on a settle-threshold cross.

Full detail in memory `neurons-prod-state-2026-06-02` (LATEST entry) + the archived change folder.

## One open thread to eyeball next time you play

The escalation 「推進一格」 **visual** was never cleanly reproduced in browser automation (test-harness `__maze.reset/addEnergy` writes raced the live homepage reconcile). The crossing logic is unit-tested (`maze-economy.test.ts` settle-crossing) and the render is a trivial `advanced ?` branch on the already-verified strip — so it's almost certainly fine, but worth a glance the next time a node actually settles mid-quiz.

## Suggested next (owner to confirm)

1. **`polish-neurons-pixel-font`** — well-scoped, owner-DEFERRED. The full sketch (pixel-vs-legible surface split, emoji approach, the `public/fonts/` + `@font-face` pitfall) is in the *prior* handoff `openspec/decisions/2026-06-07-outstanding-inventory-and-pixel-font-polish.md` section B — still 100% valid. Likely zero schema/sync.
2. **`rebalance-neurons-*`** — now **more relevant**: per-subject reading slows each pool's fill, and the 220-catalog doubles the endgame grind. Inputs in `openspec/decisions/2026-06-05-neurons-mechanics-rebalance-input.md` (suspect numbers: `PACING_BASE=14` / `READING_MINUTE_ENERGY=3` / accel caps 2.5/2.0). Wants dogfood telemetry first.

## Process reminders (unchanged)

- Worktree `track-neurons`; merge→main triggers CF Pages deploy; confirm before merge.
- Multi-agent safety: the **main** worktree has a peer's untracked `openspec/changes/add-cloudflare-auth-migration/` — leave it untouched; explicit per-file `git add`; revert `meta.json` builtAt churn (the dev/predev content-copy re-stamps it).
- Neuroscience facts → `/oe`, not memory.
- Next neurons change: start with `git merge main` into `track-neurons` (already current as of this handoff, but re-check).
