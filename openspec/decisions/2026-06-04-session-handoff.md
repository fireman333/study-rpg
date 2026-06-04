# Session handoff — 2026-06-04 (neurons worktree)

> Written at `/spec handoff`. Next session: `/spec resume` reads this. Context was full → handoff instead of merge (merge is owner-gated + acceleration session still in-flight; see below).

## What shipped this session (all committed on `track-neurons`)

| Commit | Change | Notes |
|---|---|---|
| `15ee9c1` | **rework-neurons-squads** | items 1+2: merge dual squad → 「神經元遠征隊」, auto-trigger (reading-active), QuizModal compact band, opt-out hide toggle, rename. Cosmetic-only, **no schema bump**. Specs `neurons-maze-expedition` + `neurons-study-squad` MODIFIED + synced. Chrome MCP runtime-verified. |
| `f5da4aa` | **add-neurons-bug-report** | items 4: HelpMenu form + inline QuizModal 🐞 → Supabase `bug_reports`. **Needs owner migration `0017`** (see owner-pending). Live submit e2e verified (owner already applied 0017 in dev). |
| `979f913` | add-neurons-first-pull | 首抽; R2 `SCHEMA_VERSION` 14→15. (other session, already shipped) |

`track-neurons` HEAD = `15ee9c1`, in sync with origin.

## In-flight (NOT mine — do not touch its files)

- **`add-neurons-acceleration-system`** (the only active change). Parallel session, mid-apply, **uncommitted**. Scope: DMN→consumable backpack (surge/bolus, streak-shield removed) + P1–P5 permanent equipment/companion. **Dexie v16 + R2 `SCHEMA_VERSION` 16**. Dirty files in working tree: `packages/content-neurons-tw/*` (dmn-types/cards/validator + equipment-*), `apps/neurons-tw/src/lib/db.ts`, `lib/sync/{tables,r2/bundles}.ts`, `lib/services/{acceleration,dmn-event-dispatcher,connectome,streak}.ts`, several `__tests__/*`, DmnDrawModal/HelpMenu.
- ⚠️ **Full `pnpm -r typecheck` / full test suite are RED** because of this in-flight WIP (content package mid-edit references removed `streak-shield`). NOT a defect in any shipped change. Goes green once acceleration commits.

## Owner-pending batch (do these together in ONE Supabase/CF dashboard session, THEN merge+deploy)

1. **Supabase migration `0017_neurons_bug_reports.sql`** — ALTER `bug_reports`: app CHECK += `'neurons-tw'`, category CHECK = medexam ∪ neurons union (additive). Owner already applied to dev (live submit verified); confirm applied to whichever project prod uses. Until applied: neurons bug submit → 23514, surfaced gracefully in 中文 (not a crash).
2. (from prior sessions, carry-over) `0016` DROP 一階 4 tables · R2 `m1` blob deletion · Supabase Auth allowlist — batch these with 0017.
3. **merge `track-neurons` → main (= deploy)** — owner-gated, `--no-ff`, no force. Do this AFTER acceleration ships (avoid a second merge+deploy) AND after the dashboard steps. CF Pages auto-deploys neurons on main push. Verify prod SPA 三件套 after.

## Why merge was NOT done this session
- acceleration session actively committing to `track-neurons` → merging now races it (multi-agent git safety).
- merge+deploy is owner-gated + batched with the dashboard steps above.
- context was full → not safe to start a conflict-prone merge.

## Remaining from owner's original 5-item list
- **item 3** — leaderboard「Synapse 強連結」軸評估/調整 (decay-can-decrease + tiny-int + niche-behavior; my analysis: not deceptive but a weak competitive axis). Not started. Small change if pursued.
- **item 5** — 答題自訂 tag + 收藏「🏷️ 依標記篩選」. Not started. Needs Dexie + R2 bump → **must sequence AFTER acceleration's v16/SCHEMA_VERSION 16** (next would be v17 / SCHEMA_VERSION 17). Touches QuizModal + BookmarksPage.

## Cross-links
- grill: `~/.claude/scratch/grilled-neurons-隊伍改名合併-2026-06-04.md`
- OE anchors (DMN↔divergent-thinking, for future copy): in that grill doc.
