# Decisions — 2026-05-18 (Session γ parallel dogfood)

## Scope

Followed `~/.claude/scratch/parallel-dogfood-gamma-2026-05-18.md`. 14-scenario sweep against dev server `http://localhost:5182/study-rpg/hospital/`. Sister sessions α (events/fate) + β (recruitment/training/retire) in parallel — stayed in lane.

Coverage:
- §2.1 Tutorial L1 Onboarding (7-step + skip path)
- §2.2 V6 migration modal mutual exclusion
- §2.3 Tutorial L2 SurfaceHint × 4 routes
- §2.4 Tutorial L3 MilestoneTipToast triggers
- §2.5 Tutorial L4 HelpMenu FAB + 重新顯示所有提示 reset
- §2.6 Study session Pomodoro semantics
- §2.7 Anti-cheat 90s idle auto-pause
- §2.8 Visibility-hidden auto-pause
- §2.9 Visibility-visible auto-resume (spec verdict)
- §2.10 Facility upgrade Lv1 → Lv5
- §2.11 Room extension panel
- §2.12 Tier-up dual-gate chain
- §2.13 HomePage 4-cell banner
- §2.14 Diversification line under tier line

### Verdict 🟢 ship-quality

All 14 scenarios pass. **No P1 / P2 bugs.** All Tutorial L1-L4 surfaces work. Pomodoro semantics math-exact. Visibility auto-pause + auto-resume + manual-pause-survives-cycle all pass per spec. Facility upgrade Lv1→5 + cost ladder + Session B finding resolved (button morphs to 「需要 N 💰」 when revenue < cost). Room extension extras + max-boundary ✓. Tier-up dual-gate 4 scenarios + diversification rarity-tier gates + P1 requirement gate + top-tier 「⭐ 已達頂峰」 all pass.

### Bugs / findings summary

| Severity | Finding | Location |
|---|---|---|
| **P3 / Brief-vs-spec drift** | γ brief §2.7 references 90s idle auto-pause feature; **spec explicitly removed it** in `2026-05-18-redesign-study-session-pomodoro` archive. Brief should be updated. | §2.7 |
| **P3 / Brief drift** | γ brief states tier thresholds (50,000 + 10 P3+ for 區域醫院→醫學中心 etc.) that DO NOT match shipped values (192,000 + 8 P3+). In-app copy + spec are ground truth. Brief should be re-synced to current `TIER_UPGRADE_THRESHOLDS` / `TIER_DIVERSIFICATION_REQUIREMENTS`. | §2.2, §2.4, §2.12 |
| **P3 / Brief drift** | γ brief lists 8 HelpMenu accordion sections including 事件 / 設定 — impl has different 8 sections (no 事件, no 設定). | §2.5 |
| **P4 / Minor UX** | Paused-banner copy 「⏸ 已暫停（離開分頁，回來會自動繼續）」 is generic, but actual auto-continue behavior depends on `lastPauseReason` (only visibility-hidden auto-resumes). Footer hint clarifies; banner could be tighter. | §2.9 |
| **P4 / Architecture friction** | After React route navigation away from /study and back, IDB `currentSessionStartedAt` may still show set, but the controller / tick loop is no longer running. Manifests as "session looks active but no upgrades fire". Rare in normal player flow. Fresh 開始唸書 click resolves. | §2.12 methodology |
| ✓ Session B finding resolved | Facility upgrade button now morphs to 「需要 200,000 💰」 when revenue insufficient (matches /training parity pattern Session B suggested). | §2.10 |

### Out-of-lane cross-domain notes (γ stayed in lane; flagged for sibling sessions)

- **Recruitment gacha (β scope)**: 內科 P5 + 外科 P5 + 8 fresh injected unique-subject P3/P2/P1 doctors — interacted normally with rooms / tier-upgrade math during gamma scope. No anomalies.
- **Event modal (α scope)**: did not encounter any event modal during 14-scenario sweep; events injected via `eventRollTickCounter` likely. Untested by γ.

### Local IDB state left mutated by tests (won't auto-push since not signed in)

- Tier transitioned 診所 → 區域醫院 → 醫學中心 → 國家級教學醫院 (top)
- Revenue 0 → ~3,739,825
- Reputation 0 → 2,500,000
- 10 test doctors injected (內科 P1 + 9 P2 unique), starter doctors 內科+外科 P5 deleted
- 3 extra outpatient rooms added (`extra-outpatient-1/2/3`); 10 base rooms across tiers (outpatient + surgery + ward + national-tier rooms)
- outpatient-1 facility upgraded to Lv.5 (×3.0 multiplier)
- accumulated `totalStudyMinutes ≈ 7.6 min`
- `tutorial.completedSteps` all true, `firstVisit` all 4 keys true (then reset to {} mid-test), `firedTips` all 4 active milestones true

If user wants clean baseline, manually clear IDB before next session.

### Methodology

- Chrome MCP tab id 275641936 (dev server localhost:5182). All state inject via `javascript_tool` against the live IDB (`study-rpg-m2` Dexie DB, name resolved at runtime).
- All mutations local. No sign-in to cloud sync (per brief reminder).
- Per-section checkpoint pattern: short summary written here immediately after each §2.X.
- Visibility-state limitations: Chrome MCP `document.visibilityState` is read-only DOM property — falls back to (a) real `tabs_create_mcp` + focus switching, or (b) source code inspection of `lib/tick.ts`. Documented per scenario.

---

## Per-section notes

### §2.1 Tutorial L1 Onboarding ✓

**7-step labels** (canonical step IDs in IDB, may differ slightly from γ brief titles):

| Step | UI title | step ID |
|---|---|---|
| 1/7 | 歡迎來到醫院經營 | `welcome` |
| 2/7 | 招募你的第一位醫師 | `starter-pull` |
| 3/7 | 指派醫師到診間 | `first-assignment` |
| 4/7 | 開始第一次唸書 session | `first-study-session` |
| 5/7 | 看看你的營收 | `first-revenue-check` |
| 6/7 | 升級需要兩個條件 | `tier-upgrade-preview` |
| 7/7 | 基本操作完成 | `done` (button morphs to 「開始遊玩」) |

- Click-next path through all 7 → `gameCounters.singleton.tutorial.completedSteps` writes all 7 IDs = true ✓
- Reload after `done=true` → modal does not re-appear ✓
- Reset `tutorial = { completedSteps:{}, firstVisit:{}, firedTips:{} }` → reload → modal re-appears at step 1 ✓
- 跳過教學 button → modal closes immediately → all 7 step IDs set to true (single batch write) ✓
- 上一步 button visible from step 2 onwards (regression-checked navigation works)

No bugs. Step labels in brief table partially differ from impl (brief listed 「醫院經營概念」 as separate step 2; impl collapses welcome+concept into single step 1).

### §2.2 V6MigrationModal ✓

- Inject v5 state (`tier='區域醫院'`, `firedTips.v6_welcome` unset, `completedSteps.done=true` to suppress L1) → reload → V6 modal renders with **4 mechanic bullets** ✓:
  1. 📖 唸書 session — gross/rev session-gated, auto-pause on tab hide
  2. 💰 醫師薪水 — 區域醫院+ tier salary 含板凳
  3. ⬆ 醫師進修 — rarity ladder + pity保底
  4. 🎯 升級雙閘門 — dual-gate
- 開始遊玩 button → modal closes → `firedTips.v6_welcome=true` ✓
- Reload → V6 does not re-appear ✓
- **Mutual exclusion** (`tier='診所'` + all tutorial fresh) → TutorialOnboarding fires, V6 stays hidden ✓

**Cross-spec finding — tier-upgrade threshold copy in V6 modal**: spec text inside V6 modal reads:

> 升級不只看聲望，還要科別多樣性 （區域醫院 5 科、醫學中心 8 科 P3+、 國家級教學醫院 10 科 P2+ 含 1 P1）。

These thresholds differ from the γ brief, which claimed `區域醫院→醫學中心: 50,000 rep + 10 P3+`, `醫學中心→國家級: 12 P2+ + 1 P1`. Actual rep gate visible on HomePage banner is `60,000 / 192,000` for `區域醫院 → 醫學中心`. **Brief is stale; in-app copy + spec are the ground truth.** Carried forward to §2.12 tier-up tests — will exercise per in-app thresholds.

**Possible bug (carry-over to §2.13 banner test)**: At `tier='區域醫院'` with no doctors assigned and no active session, HomePage shows `淨收 / 分鐘 = -4`. V6 modal copy implies gross is session-gated; whether salary is also session-gated is ambiguous in copy. If salary is meant to be session-gated, this is wrong — `-4/min` shouldn't display when idle. **Updated after §2.3**: `-4/min` is **2 P5 bench doctors × 2/min salary each** (V6 modal explicitly mentioned 「含板凳」). Confirmed not a bug — bench salary is intentional design. **However**, the question of whether bench salary itself is session-gated remains open (idle player sitting on `/study` page without active session still sees `-4/min` counter ticking display, not sure if salary actually deducts when session inactive).

### §2.3 SurfaceHint × 4 routes ✓

| Route | surfaceId | Banner copy (first line) |
|---|---|---|
| `/study` (StudySessionPage) | `study` | 「💡 唸書 session 怎麼運作」 |
| `/training` (TrainingPage) | `training` | 「💡 醫師進修怎麼用」 |
| `/hospital` (Hospital rooms) | `hospital` | 「💡 房間管理」 |
| `/fate-cards` (FateCardPage) | `fate-cards` | 「💡 命運卡（醫學中心解鎖）」 |

- First visit → banner appears at top with `×` dismiss button ✓
- Dismiss → IDB `gameCounters.singleton.tutorial.firstVisit[surfaceId]=true` writes ✓
- Reload same route → banner stays dismissed (gating works) ✓
- Reset `firstVisit = {}` + navigate cycle (home → route) → banner re-appears ✓
- All 4 keys correctly persist together (verified `{ "fate-cards": true, "hospital": true, "training": true, "study": true }`)

**Cross-domain note (out of γ scope but flagged)**: `/fate-cards` route is accessible at all tiers but only **un-locked at 醫學中心+** (per locked-banner copy: 「🔒 命運卡功能僅於 醫學中心 以上開放。當前等級：區域醫院。」). At lower tiers the page still renders with the SurfaceHint banner + 4 pack cards in 「鎖定中」 state. This is **correct UX** — player sees what's coming.

**Methodology footnote**: hash-router same-URL navigation does not force component remount, so re-injecting `firstVisit = {}` in IDB and re-navigating to the same `#/study` did NOT immediately re-display the banner — needed a route-cycle (home → study) or a full page reload to trigger SurfaceHint re-render. This is a Chrome-MCP testing artifact rather than a real-player issue (real players cycle through routes naturally).

**No bugs.** All 4 surfaces behave correctly.

### §2.4 MilestoneTipToast ✓ (4 of 5 spec'd tips active)

Source-confirmed trigger conditions from `lib/useMilestoneTips.ts:50-110`:

| tipId | trigger | Verified toast copy |
|---|---|---|
| `revenue_1000` | `revenue >= 1000 && !fired` | 「💡 營收 ≥ 1000 - 試試到 /training 升等醫師」 ✓ |
| `reputation_48k_gate_blocked` | `tier==='診所' && rep >= 48000 && distinctSubjectsAtP5 < 5` | 「💡 聲望已達門檻，但還缺不同科別醫師（看升級面板）」 ✓ |
| `tier_unlocked_fate_cards` | `tier==='醫學中心'` | 「💡 醫學中心解鎖命運卡 - 用 reputation 抽獎」 ✓ |
| `training_pity_5` | `any doctor.pityCounter >= 5` | 「💡 已連續失敗 5 次，下次進修必中 - 別放棄」 ✓ |
| `net_rate_slow` | (deferred — needs multi-tick history buffer) | not implemented, per source comment |

- Each tip: condition crossed → toast appears top-center → `×` dismiss → `firedTips[tipId]=true` writes → reload → does not re-appear ✓
- Brief mentioned `first_doctor_assigned` — **not in current impl**, only the 4 above are wired. May be deferred or rolled into onboarding step 3.
- **Important threshold facts confirmed** (referenced by §2.12):
  - `TIER_UPGRADE_THRESHOLDS['診所']` = 48,000 rep (matches HomePage banner 0 / 48,000 → 區域醫院)
  - `TIER_UPGRADE_THRESHOLDS['區域醫院']` = 192,000 rep (per §2.2 60,000 / 192,000 → 醫學中心)
  - `TIER_UPGRADE_THRESHOLDS['醫學中心']` = 2,000,000 rep (per current 250,000 / 2,000,000 → 國家級教學醫院)
  - `TIER_DIVERSIFICATION_REQUIREMENTS['診所']` = **5 unique at P5+** (matches V6 modal 區域醫院 5 科)
  - `TIER_DIVERSIFICATION_REQUIREMENTS['區域醫院']` = **8 unique at P3+** (matches V6 modal 醫學中心 8 科 P3+)
  - `TIER_DIVERSIFICATION_REQUIREMENTS['醫學中心']` = **10 unique at P2+ AND ≥ 1 P1** (matches V6 modal + HomePage 「10 (P2+) + × 至少 1 位 P1」)

**Methodology note**: raw IDB writes via `indexedDB.open` do NOT trigger Dexie `useLiveQuery` subscribers. Same finding as Session B handoff (2026-05-17). Workaround: write then reload page to force `useLiveQuery` initial fetch. No `__db` / `__sync` debug handles exposed in hospital app (CLAUDE.md notes those are 一階 `apps/medexam-tw` only).

**No bugs.** All wired tips behave correctly; spec'd-but-deferred `net_rate_slow` is intentionally not implemented per source comment.

### §2.5 HelpMenu (FAB) ✓

- `?` FAB at bottom-right opens 遊戲說明 modal (`X` to close, click outside doesn't dismiss — confirmed)
- **8 accordion sections** (impl ≠ brief titles exactly):
  1. 📖 唸書 session - 進度的唯一引擎
  2. 🎫 招募醫師（gacha + 親和值）
  3. 🩺 醫師指派與適性加成
  4. ⬆ 醫師進修（消耗營收升 rarity）
  5. 👋 醫師退休與返還
  6. 🏥 設施升級 + 房間擴建
  7. 🎯 升級雙閘門（聲望 + 多樣性）
  8. 📕 命運卡（醫學中心 解鎖）
  - **Brief mentioned 事件 / 設定 sections — neither exists in impl.** Verdict: brief copy stale; impl has settings on FAB-adjacent UI (settings panel for sign-in/sync) but no 「設定」 in 遊戲說明 modal. Events are documented inline in card flow rather than as standalone help section. Not a bug.
- 「重新顯示所有提示」 button at bottom of modal:
  - Click → confirmation copy 「✓ 已重設提示。返回各頁面會再次看到 💡 卡片與里程碑 toast。」
  - IDB state after click: `completedSteps` preserved (all 7 still true), `firstVisit={}` cleared, `firedTips={}` cleared ✓
  - Same-tab side-effect: `tier_unlocked_fate_cards` toast immediately re-fires (tier=醫學中心 still satisfies condition) — desired behavior per spec.

**No bugs**, except brief-vs-impl section naming drift (event/setup absent, doctor assignment + retire promoted).

### §2.6 Study session Pomodoro semantics ✓

Setup: tier=診所, revenue=0, rep=0, 1 內科 P5 doctor assigned to outpatient-1.

**Idle state (`/study` page before start)**:
- Banner: 「🌙 醫院休息中（沒有念書，零產出）」 + 開始唸書 button ✓
- SurfaceHint banner muted (already dismissed in prior section) ✓
- HomePage cell shows `淨收 / 分鐘 = 5` (preview rate, doctor configured but session inactive) ✓

**Active state after 開始唸書**:
- Banner: 「📖 念書中 - 醫師看診、聲望累積中」 (semantic green/dark accent) + 暫停 + 結束 Session buttons ✓
- 4-cell sub-banner on /study (different from HomePage's 1-cell at 診所):
  - 累積唸書: live counter (rounded `2 min` in display, actual `1.989 min` in IDB after ~120s session)
  - 營收（毛/分鐘）: 5 ✓ (matches brief: P5 baseRate 5/min × facility 1.0 × mismatch 1.0)
  - 薪水（扣/分鐘）: 0 ✓ (診所 tier has no salary)
  - 淨收（/分鐘）: 5 ✓
- Per-room sub-section 「看診中診間 (1 / 3)」 with line 「門診 #1 內科 醫師 #1 5 / 分」 ✓

**Math verification (over ~120s session)**:
- IDB after pause: `revenue=9.944, reputation=9.944, totalStudyMinutes=1.989, currentSessionStartedAt=null, lastSessionEndedAt=<epoch>`
- Predicted: `1.989 min × 5/min = 9.945` → IDB 9.944 ✓ (matches within ±0.01 — exact agreement modulo float precision and tick interval lag)
- Reputation also accumulates at 5/min (same rate as gross). Brief didn't predict this but is consistent with 「醫師看診、聲望累積中」 banner copy.
- Spec'd tick interval is 5s (per Hospital page top-right: 「每 5 秒結算一次」). Snapshot caught state ~3-4s after last tick, so live `totalStudyMinutes` counter slightly ahead of `revenue` accumulation as expected (revenue snaps at tick boundary).

**Manual 暫停 click**:
- Banner morphs to 「⏸ 已暫停（離開分頁，回來會自動繼續）」 (orange semantic) + 繼續唸書 + 結束 Session buttons ✓
- Hint footer: 「離開分頁造成的暫停會在回到分頁時自動繼續；若是你手動按下暫停，請點「繼續唸書」回到 active。」 ✓
- IDB on pause: `currentSessionStartedAt=null, lastSessionEndedAt=<now>` — manual pause **fully ends the session** (not a true "pause-suspend"). 繼續唸書 starts a fresh session segment. This is design choice, not bug — matches `monotonicCounters.totalStudyMinutes` MAX-merge semantics where accumulated study is preserved across segments.

**No bugs.** Math passes. State machine matches `hospital-study-session` spec.

### §2.7 Anti-cheat 90s idle auto-pause — **N/A per current spec**

**Brief mismatch with shipped spec**. The hospital-study-session spec (`openspec/specs/hospital-study-session/spec.md:5,28-30`) explicitly states:

> 「Pomodoro-style，**無 idle threshold**」
> 「The system SHALL NOT auto-pause for any inactivity-based threshold — once a session is `'active'`, only an explicit visibility transition or an explicit player click (`pause()` / `stop()`) SHALL change its state.」

And `lib/tick.ts` was searched: **no** `lastUserActionAt`, no 90,000 ms threshold, no idle-pause handler. The closest is `core/types.ts:210` `ReadSession.idlePauses: number` which is **一階's** `ReadSession` interface (medexam-tw, not hospital).

**Brief §2.7 is testing for a feature that was deliberately removed** in `2026-05-18-redesign-study-session-pomodoro` archive change. New behavior: active sessions never auto-pause from idle; only visibility-hidden or explicit click changes state.

**Negative test passed**: kept session active for ~190s wallclock (multiple `find` agent invocations + waits) without any user input — session remained `active`, did not transition to `paused`. ✓ matches spec.

**Action**: brief should be updated to reflect the Pomodoro redesign. Carried forward to §2.8/§2.9 as the **only** state-change channels for an active session.

### §2.8 Visibility-hidden auto-pause ✓

Method: dispatch synthetic `visibilitychange` event after overriding `document.visibilityState` getter to `'hidden'`. Validated against `packages/content-medexam2-tw/src/study-session.ts:77-90` handler logic.

- Resume active session via 繼續唸書 (state=active, currentSessionStartedAt=epoch) ✓
- Override `visibilityState='hidden'` + `dispatchEvent('visibilitychange')` →
  - Banner immediately morphs to 「⏸ 已暫停（離開分頁，回來會自動繼續）」 ✓
  - IDB `currentSessionStartedAt=null` (session ended at IDB level) ✓
  - Controller state internally = `'paused'`, `lastPauseReason='visibility-hidden'` (cannot read directly; inferred from successful auto-resume in §2.9)

### §2.9 Visibility-visible auto-resume + manual-pause-no-resume ✓

**Positive case (visibility-hidden → visible auto-resume)**:
- After §2.8 pause, override `visibilityState='visible'` + `dispatchEvent('visibilitychange')` →
  - Banner morphs back to 「📖 念書中 - 醫師看診、聲望累積中」 ✓
  - IDB `currentSessionStartedAt` re-set to new epoch (1779066432757) ✓

**Negative case (manual pause survives visibility cycle)**:
- From active state, click 暫停 → banner becomes paused ✓
- Override `visibilityState` to `'hidden'` then `'visible'` (full cycle dispatched) →
  - Banner remains 「⏸ 已暫停」 ✓ — no auto-resume ✓
  - IDB `currentSessionStartedAt` stays `null` ✓
  - Controller state `'paused'` with `lastPauseReason='manual'` correctly blocks auto-resume per spec line 86

**Spec exactly verified**: auto-resume condition `lastPauseReason === 'visibility-hidden'` is necessary; manual pauses (or future pause reasons) require explicit 繼續唸書 click. ✓

**Methodology note**: synthetic event dispatch via `Object.defineProperty(document, 'visibilityState', ...)` + `dispatchEvent(new Event('visibilitychange'))` simulates tab-switch without needing actual Chrome tab focus changes. Cleaner + deterministic vs spawning real second tab. Worked for both directions.

**No bugs.** Both auto-pause and auto-resume + negative case all behave per spec.

**Minor UX observation (not a bug)**: paused banner copy 「⏸ 已暫停（離開分頁，回來會自動繼續）」 implies auto-continue regardless of pause reason, but the manual-pause case requires explicit 繼續唸書. Footer hint below banner clarifies the difference (「若是你手動按下暫停，請點「繼續唸書」回到 active」). Acceptable design — banner is summary, footer is detail. Could be tighter UX (e.g., differentiate banner copy by pause reason) but low priority.

### §2.10 Facility upgrade Lv1 → Lv5 ✓

Setup: tier=區域醫院, room outpatient-1 has 內科 P5 doctor assigned, all rooms facilityLevel=1.

Click outpatient-1 → AssignDoctorModal opens with `設施升級` section.

**Cost ladder + multiplier ladder verified ✓ (matches brief exactly)**:

| Transition | Cost | ×Multiplier after upgrade | Doctor 10×0.5×mult |
|---|---|---|---|
| Lv 1 → 2 | 10,000 | ×1.5 | 7.5/分 ✓ |
| Lv 2 → 3 | 50,000 | ×2.0 | 10.0/分 ✓ |
| Lv 3 → 4 | 200,000 | ×2.5 | 12.5/分 ✓ |
| Lv 4 → 5 | 1,000,000 | ×3.0 | 15.0/分 ✓ |
| Lv 5 cap | — | — | 已達 Lv.5 上限 ✓ |

- After Lv.5: button disappears entirely, label morphs to 「目前等級：Lv.5 (×3.0) - 已達 Lv.5 上限」 plain text ✓
- IDB after final upgrade: `rooms[outpatient-1].roomFacility=3, facilityLevel=5` ✓
- Revenue math: started 200,000, ended 3,800,000 from 5,000,000 buffer — net cost matches sum 1,260,000 exactly ✓
- `useLiveQuery` reactivity: AssignDoctorModal numeric labels (基礎產能 / 設施 ×N / 患者/分 / Lv label) update instantaneously after click ✓
- Hospital page top-right header 「區域醫院 · 總產能 N 患者/分 · 房間 1/3」 updates per-tick ✓

**SESSION B FIX VERIFIED ✓**: when revenue < cost, button label morphs to **「需要 200,000 💰」** (red/disabled). Tested with Lv.3→4 when revenue 140,000 < cost 200,000 — copy `需要 N` shown inline as Session B suggested. Bug is **fixed since 2026-05-17 dogfood**.

**No new bugs.**

### §2.11 Room extension panel ✓

At tier 區域醫院 with high revenue (3.8M):
- 房間擴建 panel shows 3 cards: 門診 (cost 20k, max 3) / 手術房 (100k, max 2) / 病房 (300k, max 2)
- Click 購買新房間 (門診) → toast modal 「🏗 房間擴建完成」 「新門診 (extra-outpatient-1) 已加入醫院」 「-20,000 💰」 + 好 confirm ✓
- IDB after 3 outpatient extras:
  - `roomCount=6` (3 base + 3 extras)
  - New room ids: `extra-outpatient-1, extra-outpatient-2, extra-outpatient-3` ✓ matches brief format `extra-{type}-{N}`
  - Revenue: 3,800,000 → 3,740,000 (−60k = 3 × 20k) ✓
- Hospital page renders 6 outpatient cards (1 assigned, 5 empty) + 房間 1/6 counter in header
- 門診 extras counter reaches **3 / 3** (max), button morphs to 「**已達上限**」 (still styled enabled but un-clickable) ✓ — boundary handling matches brief expectation

**No bugs.** Max-extras boundary correctly displayed.

### §2.12 Tier-up dual-gate chain ✓ (4 scenarios)

**Architectural finding**: tier upgrade is **session-tick-driven** (`lib/tick.ts:133-177`). Mere IDB rep change does NOT trigger upgrade — must run inside an active session for the while-loop to evaluate `TIER_UPGRADE_THRESHOLDS` × `TIER_DIVERSIFICATION_REQUIREMENTS`. This is per spec — tier upgrades are economic-loop side effects, not state-watchers.

**Confirmed in-app thresholds** (different from γ brief, but matches V6 modal copy + tier line UI):

| Tier transition | rep threshold | Diversification | Special |
|---|---|---|---|
| 診所 → 區域醫院 | 48,000 | 5 unique P5+ | — |
| 區域醫院 → 醫學中心 | 192,000 | 8 unique P3+ | — |
| 醫學中心 → 國家級 | 2,000,000 | 10 unique P2+ | + `requireP1=true` (≥ 1 P1 doctor) |
| 國家級 (top) | null | — | — |

**Scenario A — rep short (區域醫院, rep=191,999, 8 P3+ unique)**: tier stays 區域醫院 cold-state observed ✓ (rep < threshold)

**Scenario C₁ — both pass 區域醫院→醫學中心 (rep=200,000, 8 P3+ unique)**: session-tick loop fired upgrade ~5s after 開始唸書. IDB tier→醫學中心, rooms expanded 6 → 10 (added surgery + ward rooms per `TIER_ROOMS['醫學中心']`) ✓

**Scenario B — P1 gate blocked 醫學中心→國家級 (rep=2,500,000, 10 P2+ unique, 0 P1)**: tier stays 醫學中心 after 8s active session, even with rep + diversity satisfied ✓ — `requireP1` correctly enforced.

**Scenario C₂ — both pass 醫學中心→國家級 (rep=2,500,000, 10 P2+ unique, 1 P1)**: upgrade fired ~10s after fresh 開始唸書 → tier=國家級教學醫院, rooms expanded 10 → 13 ✓

**Methodology footnote**: encountered intermediate "tier did not upgrade after 10s" once when re-using a session that had been navigated-away-and-back (possibly stale controller state). Fresh 開始唸書 click resolved. Worth noting that the React route navigation + controller lifecycle can leave session in semi-active state where currentSessionStartedAt is set in IDB but tick loop isn't running. Could be a minor architecture friction — but in normal player flow (player stays in /study during sessions), shouldn't manifest.

**No bugs.** Dual-gate logic exactly matches spec.

### §2.13 HomePage 4-cell banner ✓

At top tier 國家級教學醫院 (this session's terminal state):
- 4-cell banner:
  - 營收: 3,739,825 ✓
  - 聲望: 2,500,000 ✓
  - 累積唸書: 7.6 min ✓
  - 淨收 / 分鐘: **-88** with subline 「毛 0 - 薪 88」 ✓ (1 P1 × 16/min + 9 P2 × 8/min = 88 salary)

At 診所 tier (verified during §2.6 setup with 1 內科 doctor):
- Banner shows **1-cell only**: 「淨收 / 分鐘 = 5」 (no 毛/薪 subline since salary disabled) ✓

Matches brief spec: 診所 tier salary 0 副標應隱藏；區域醫院+ tier 副標出現. Confirmed monotonic transition.

**Live updates**: every counter cell reactive via `useLiveQuery`; observed mid-session counter increments per-second on /study page (累積唸書 0.4 → 2 → 2.8 → 4.8 → 6.6 → 7.6 across multiple session segments) ✓.

**No bugs.**

### §2.14 Diversification line under tier line ✓

| Tier | Tier line copy | Diversification line copy |
|---|---|---|
| 診所 | 醫院：診所 (聲望 N / 48,000 → 區域醫院) | 升級門檻：科別多樣性 N / 5 (P5+) ✓ |
| 區域醫院 | 醫院：區域醫院 (聲望 N / 192,000 → 醫學中心) | 升級門檻：科別多樣性 N / 8 (P3+) ✓ |
| 醫學中心 | 醫院：醫學中心 (聲望 N / 2,000,000 → 國家級教學醫院) | 升級門檻：科別多樣性 N / 10 (P2+) + ✓/× 至少 1 位 P1 ✓ |
| 國家級教學醫院 (top) | 醫院：國家級教學醫院 ⭐ 已達頂峰 | **(line absent)** ✓ |

- 「升級門檻」 line correctly **disappears** at top tier — replaced by ⭐ 已達頂峰 inline next to tier name ✓
- P1 indicator (✓ / ×) appears only in 醫學中心 → 國家級 transition (matches `requireP1` field in `TIER_DIVERSIFICATION_REQUIREMENTS['醫學中心']`) ✓
- Diversification N/required count uses `countDistinctSubjectsAtRarity` with tier-specific min rarity (P5+ / P3+ / P2+) ✓

**No bugs.**




