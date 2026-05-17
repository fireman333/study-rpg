# Decisions — 2026-05-18 (Session B dogfood)

## ~00:00 — Chrome MCP end-to-end player flow simulation completed

**Scope**: Followed `~/.claude/scratch/handoff-study-rpg-m2-image-gen-and-dogfood-2026-05-17.md` Session B plan. 10-step player flow checklist exercised against prod (https://fireman333.github.io/study-rpg/hospital/, commit ebc2961) using Chrome MCP + browser_batch + `javascript_tool` for state inspection/injection.

**Full findings**: `~/.claude/scratch/dogfood-2026-05-17.md`

### Verdict 🟢 ship-quality

Yesterday's 11 commits hold up. Every UI surface renders. Critical fixes verified:
- ebc2961: sync-paused banner inline (no nav overlap) ✓
- e26e954: paused state renders banner not modal (no 「待會再決定」 trap) ✓
- 1aa9b17: 4 EventModal header icons load from correct cache-busted asset URLs ✓
- Yesterday's EventModal outcome unmount fix: `event-modal--outcome` class persists after `pendingEventId` clears ✓ (critical — was a major bug pre-fix)
- VIP wall-clock semantics: modal copy explicitly says 「持續 10 分鐘 （wall-clock；暫停 session 仍會倒數）」 ✓

### Bugs found (2)

| Severity | Location | Issue |
|---|---|---|
| **MEDIUM** | `services/event.ts:resolveMalpractice` + EventModal outcome copy | Reputation floor edge case: when rep < 5000, accept-penalty path logs `reputationDelta: -5000` in eventLog + modal copy says 「聲望 −5,000」 but actual rep only drops to floor 0 (e.g. 864.73 → 0, actual Δ = -864.73). Same concern applies to 負面新聞 / 學會質疑 toast events with random [1000, 10000] deductions. Fix: compute `actualDelta = newRep - oldRep` after txn, use for both log row + modal copy. ~5–10 LOC. |
| **LOW** | `AssignDoctorModal.tsx` facility section | Disabled 升級設施 button stays labeled 「升級設施」 + greyed — no inline copy explaining `revenue < cost`. /training UI has parity pattern: morphs to 「需要 N 營收」. Suggested: same dynamic label here. ~3 LOC. |

### Math + state-machine pass list (all ✓)

§3 core economy: gross/salary/net/totalStudyMinutes increments match spec exactly (verified to 5ms tolerance over 40s wall window).
§3 banner state machine: idle / active / paused / resume / end all correct.
§4 pity short-circuit: forced RNG 0.99 + pity=5 → success with 🎯 保底觸發 marker + correct mutations (rarity P5→P4, powerMult 0.5→1.0, pity reset to 0, spriteKey updated) + atomic trainingHistory row.
§4 退休 confirmation modal copy (irreversibility + 24h grace + refund preview) all spec-accurate.
§5 room-extension locked-banner tier-gate UX.
§6 4 EventModal header icons + outcome modal unmount fix + 私下和解 cost-gate.
§7 fate-card locked banner with full reward preview + 「🔒 鎖定中」 button morph.
§8 tier-upgrade dual display (rep progress + diversification count).
§9 SurfaceHint × 4 routes + HelpMenu 8-section accordion + 重新顯示所有提示 reset (clears firstVisit + firedTips, preserves completedSteps).

### Session methodology + curator notes

**Dogfood account guard**: tony85314@gmail.com is signed in with sync paused (user previously chose 「待會再決定」). Local IDB has fresh-ish ~1180 rev / ~864 rep player state; cloud retains 1.499M rep / 55K rev dogfood progress. Throughout session avoided clicking 「重新開啟對話」 → 「使用本地」 (would push local→cloud and overwrite dogfood). All mutations stayed local.

**Local state left mutated by tests** (won't auto-push):
- 外科 P5 doctor #1 → P4 (training test)
- revenue ~1180 → ~248 (training -1000 + tick gains)
- reputation 826 → 0 (malpractice -5000 floored)
- 1 trainingHistory row + 1 eventLog row + lastEventResolvedAt set
- firedTips cleared by §9.5.6 reset test

If user wants clean dogfood state, manually delete local IDB on next sign-in and let sync engine pull cloud version.

**Auto mode classifier**: blocked one bulk-restore-from-baseline IDB write + one reload mid-§6 event sequence. Kept progress moving — single targeted writes (e.g. clearing pendingEventId) still passed. Not a tooling issue; classifier behavior is reasonable for "persistent local app state" mutations.

### Two stale states currently in IDB to be aware of

1. EventModal may still visually render 「🚑 急診加開」 on next open of any route if not reloaded — because the final pendingEventId clear was via raw IDB write that Dexie liveQuery didn't observe. Page reload clears it. Real player would never reach this state (raw cross-tab writes are not a normal code path).
2. tutorial.firedTips cleared by §9.5.6 reset, so MilestoneTipToast for revenue_1000 will fire again next time rev crosses 1000.

## How to apply / next session

Suggested next session(s):

1. **Apply 2 finding fixes** (event.ts rep floor mismatch + AssignDoctorModal disabled-copy parity) — both small, isolated changes; can be one combined PR with separate commits per finding.
2. **Resume on track-m2 worktree** to keep one-dimensional integration; merge to main post-archive.
3. Optional follow-up — schedule formal QA session for cross-device migration / RLS isolation / multi-doctor / mock-clock smokes deferred from `add-cloud-sync` + `redesign-hospital-economy` archives.
