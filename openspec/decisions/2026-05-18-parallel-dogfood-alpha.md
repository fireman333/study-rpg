# Parallel Dogfood — Session α — Events + Fate Cards

**Date**: 2026-05-18
**Branch**: track-m2
**App URL**: http://localhost:5180/study-rpg/hospital/
**Scope**: 5 種 event modal/toast (`hospital-events`) + 4 包 fate card pack (`hospital-fate-cards`) + 醫療糾紛 24h auto-resolve

## Verdict

🟡 — All happy-path mechanics work as spec'd. **One P3 bug** (auto-resolve eventLog reputationDelta stores intent rather than actual delta — data integrity gap; user-visible reputation still correctly floors). One P4 UX note (modal action button shows intent constant even when floor will reduce actual deduction). Brief documentation deltas worth noting.

## Findings

| Severity | Location | Issue | Suggested fix |
|---|---|---|---|
| **P3 人上人** | `apps/medexam2-hospital-tw/src/lib/tick.ts:194-202` (auto-resolve branch) | When 醫療糾紛 auto-resolves at 24h with `reputation < MALPRACTICE_PENALTY_REP`, the `eventLog` row writes `reputationDelta: -MALPRACTICE_PENALTY_REP` (intent constant), but the actual rep change is smaller because `Math.max(0, ...)` floors first. **Reproduced**: injected rep=1500 + 25h-old pending malpractice → after auto-resolve tick, rep=0 (actual delta -1500) but `eventLog.reputationDelta = -5000`. This is the same bug class fixed by commit `1fae8f4` for the `accept-penalty` and toast branches (services/event.ts:85-105 + tick.ts:225-243), but the fix was not propagated to the auto-resolve branch. | ~6 LOC: compute `prevRep`, `newReputation = Math.max(0, prevRep - PENALTY)`, then `actualDelta = newReputation - prevRep`, log `reputationDelta: actualDelta`. Mirror the pattern in tick.ts:225-243. |
| **P4 NPC** | `apps/medexam2-hospital-tw/src/components/EventModal.tsx:242` | Malpractice pending modal action button shows literal `−5,000 聲望` even when player's rep is below 5000 and actual deduction will floor at 0. Outcome modal correctly reports the realized delta (already fixed), but button label is the intent constant. Minor UX disclosure gap — player loses < 5000 expecting -5000. | Either (a) add a parenthetical `(將至 0)` when `counters.reputation < MALPRACTICE_PENALTY_REP`, or (b) live-compute `effectiveDelta = -Math.min(counters.reputation, MALPRACTICE_PENALTY_REP)` for button label. ~3 LOC. |
| **P4 NPC** | `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx:118` | Dead code: `const pityCount = mono?.fateCardBadLuckPity[tier === 'legendary' ? 'common' : tier] ?? 0` — the `legendary → 'common'` mapping is never reached because line 139 (`tier !== 'legendary'`) skips display for legendary. Confusing if a future contributor reads it as a real lookup. | `mono?.fateCardBadLuckPity[tier as 'common'\|'rare'\|'epic'] ?? 0`, narrowed via type, and `if (tier === 'legendary') return null` earlier in the JSX branch (or rely on existing `tier !== 'legendary'` guard). ~2 LOC. |
| **P4 NPC** (brief drift, not source bug) | brief itself | Brief says IDB name = `HospitalDB`; actual = `study-rpg-medexam2-hospital-tw`. Brief says pity counter key = `monotonicCounters.fateCardPity`; actual = `monotonicCounters.fateCardBadLuckPity` with sub-keys `common/rare/epic`. Brief says emergency-shift is a toast event for polarity test; actual is modal (`uiKind: 'modal'`). Brief says `globalThis.__db` / `__sync` available in 二階 app; not exposed (one-階 only). | Brief refresh for future α-equivalent runs. No source change. |
| **P5 拉完了** (out-of-scope sanity) | Chrome MCP `find` / `wait` causes tab `visibilitychange` → study session auto-pauses mid-test | Each Chrome MCP operation that touches the tab can flip visibility state and pause the session controller (per `createStudySessionController` spec). Affects any tester driving runtime events through the engine via Chrome MCP. Workaround: re-click 繼續唸書 between operations, or set up the entire injection in one batched call before clicking 開始唸書. | Methodology note only — not a code bug; the auto-pause-on-tab-blur behavior is intentional. |

## Test scenarios executed

- [x] **2.1 event roll mechanic** — source-verified. `EVENT_TICK_INTERVAL=60`, `eventRollTickCounter` increments per tick (5s each → ~5 min between rolls), resets to 0 BEFORE `rollEvent` call (so cooldown-skipped roll wastes another 5 min before next attempt — by-design quirk), `EVENT_POST_RESOLUTION_COOLDOWN_MS = 5min`. Counter increments observed live (0 → 3 → 9 → 17 → 29 across multiple ticks).
- [x] **2.2 medical-malpractice** — settle path: rev 200,000 → 180,000 (-20,000 = 10% clamped to MIN), rep unchanged, eventLog outcome 'settled'. Accept-penalty path: rep 2000 → 0 (floored from 2000-5000=-3000), actual delta -2000, eventLog row `reputationDelta: -2000` (correctly uses actualDelta — fix from 1fae8f4 confirmed for player-action branch). Outcome modal text matches actual delta (`"聲望 -2,000"`).
- [x] **2.2 vip-patient** — accept path: `vipBoostUntil = now + 600000ms` (10 min wall-clock), eventLog outcome 'accepted', `lastEventResolvedAt` set. Modal text correctly discloses wall-clock semantics ("暫停 session 仍會倒數").
- [x] **2.2 emergency-shift** — accept path: rev 50,000 → 55,000 (+5000), rep 0 → 500 (+500), eventLog row `revenueDelta: 5000, reputationDelta: 500`. Matches `EMERGENCY_SHIFT_REVENUE_BONUS / REPUTATION_BONUS` constants.
- [x] **2.2 audit** — fail path observed in single UI trial: rep 10,000 → 7,000 (-3000), eventLog outcome 'fail', `reputationDelta: -3000`. 1000-trial RNG simulation in page context: 729/271 pass/fail = 72.9% (within 1.5σ of 70% target). Pass-branch never floors; fail-branch would floor at 0 below 3000 rep (same `Math.max(0, ...)` pattern, actualDelta computed correctly per source).
- [x] **2.2 toast events (負面新聞 / 學會質疑)** — naturally fired `negative-news` ×4 by hijacking `Math.random=()=>0.001` + injecting `eventRollTickCounter=59` + active study session. eventLog rows: `outcome: 'reputation-loss', reputationDelta: -1009` (correct formula `Math.round(1000 + 0.001 × 9000) = 1009`). Rep floor handled correctly in `tick.ts:225-243` (uses `actualRepDelta`). 5s auto-dismiss confirmed via DOM polling (toast `.event-toast` element absent after ~6s post-trigger, present immediately after trigger).
- [x] **2.3 fate cards (4 包 × ≥5 抽 + pity + bad-luck)** — see § Fate-card detail below.
- [x] **2.4 24h auto-resolve** — naturally fired on first tick after session start. Injected pendingEventTriggeredAt = now-25h, rep=10000 → rep=5000 (-5000 exactly), pendingEventId cleared, eventLog row `outcome: 'auto-resolved-penalty', reputationDelta: -5000`. Then floor edge case test (rep=1500): rep → 0 correctly, but eventLog `reputationDelta: -5000` while actual change was -1500 = **P3 bug above**.
- [x] **2.5 toast polarity tinting** — CSS verified at `styles.css:2420-2421`: `.event-toast--negative { border-color: #c44d4d }`, `.event-toast--positive { border-color: #2a8b3a }`. EventToast.tsx:31 wires `polarityClass = event-toast--${event.polarity}`. Live verification via injected fake-toast DOM showed visually distinguishable red (rgb(196,77,77)) vs green (rgb(42,139,58)) borders — see screenshot evidence in session.

## Fate-card detail (2.3)

All 4 packs functional via UI clicks:

| Pack | Cost | Pulls | Outcomes observed |
|---|---|---|---|
| 普通 (common) | 1,000 | 5 reward + 1 bad-luck (forced via `Math.random=0.0001`) + 1 pity-triggered (counter inject) | event-immunity-1 ×3, minor-revenue-5k ×2 (rev +5k each ✓ via `revenueDelta` return path); bad-luck = rep −1,000 cost + −1,000 penalty + pity counter 0→1; pity-triggered draw shows 🎯 badge in modal title + history row |
| 稀有 (rare) | 10,000 | 4 (3 confirmed in IDB + 1 inflight) | event-positive-trigger ×2, training-guarantee-x1 (all log-only effects per spec — "庫存系統實裝後生效") |
| 史詩 (epic) | 100,000 | 1 | salary-waiver-1-week (log-only) |
| 傳奇 (legendary) | 1,000,000 | 1 | targeted-p2-ticket → `tickets.available` 10 → 11 (+1 via `grantTickets(1)` per spec "暫以一般招募券發放, 定向券待後續實作") ✓ |

Per-pack pity (`monotonicCounters.fateCardBadLuckPity`):
- Independent counter per `common / rare / epic` ✓
- `legendary` has no counter (0% bad luck — `FATE_CARD_BAD_LUCK_RATES.legendary === 0`) ✓
- After reward: counter resets to 0 ✓
- After bad-luck: counter += 1 ✓
- Forced pity test: injected `common: 3` → next draw returned `kind: 'reward', pityTriggered: true, newPityCounter: 0` ✓ — UI shows 🎯 pity badge in modal title and history

Bad-luck history row stripe: `.fate-cards-history__item--bad { border-left-color: #c44d4d }` (red) ✓ vs `--good { border-left-color: #2a8b3a }` (green) ✓ — both classes in styles.css:2538-2539. UI rendering confirmed.

Not directly tested (out of scope-of-feasible without inventory): `facility-plus-0.5`, `facility-all-plus-1`, `event-immunity-1`, `event-positive-trigger`, `training-guarantee-x1`, `throughput-x2-1-week`, `salary-waiver-1-week` — all log-only per source comment, so "已紀錄；庫存系統實裝後生效" is the contract. Service code (`fate-card.ts:163-178`) correctly routes facility rewards via `bumpRandomRoomFacility / bumpAllRoomsFacility`. Source path is clear.

## State drift left in IDB

`origin localhost:5180` `HospitalDB` (actual name: `study-rpg-medexam2-hospital-tw`) has:

- `gameCounters`: tier=醫學中心 (was 診所), rep=98991 (was 0), rev=1,010,000 (was 0), tutorial.completedSteps all `true` (skipped via button), `lastTickAt`, `lastEventResolvedAt`, `eventRollTickCounter` non-zero (mid-session state), pendingEventId=null
- `monotonicCounters`: `fateCardBadLuckPity.common = 1` (after the forced bad-luck test left counter at 1; reset of pity=3 → drew → reset to 0; then bad-luck → 1), `totalStudyMinutes` ≈ 7 from session ticks
- `eventLog`: 11 rows including 1 settle, 1 accept-penalty, 1 vip-accepted, 1 emergency-accepted, 1 audit-fail, 1 auto-resolved-penalty (id=6), 1 auto-resolved-penalty (id=7), 4 negative-news toasts
- `fateCardHistory`: ~12 rows across common/rare/epic/legendary
- `tickets.global.available`: 11 (was 10; +1 from legendary draw)
- `rooms`: 3 outpatient + likely 醫學中心-tier additions written by tier-upgrade in tick.ts:169-171 (didn't verify exact post-state)

Future session β/γ on the same origin will see this state. Recommend a clean-slate reset before fresh tests: `indexedDB.deleteDatabase('study-rpg-medexam2-hospital-tw')` + reload.

## Cross-domain notes

These were observed during α testing but belong to β/γ scope:

- **MilestoneTipToast (γ)**: "💡 醫學中心解鎖命運卡 - 用 reputation 抽獎" and "💡 營收 ≥ 1000 - 試試到 /training 升等醫師" fired after my tier/rep injection — milestone tip system works on injected state changes too (might be intentional).
- **TutorialOnboarding (γ)**: appears on first visit AND re-appears after my injection wiped tutorial.completedSteps via raw IDB write (snapshotted `pre_counters.tutorial` before skip click had been persisted). Click "跳過教學" still works to set all 7 step flags to true.
- **V6MigrationModal (γ)**: "醫院系統大改版" modal appeared on reload — possibly tier-upgrade triggered or version detection. Has dismiss button "開始遊玩".
- **Cloud sync sign-in chip (M4)**: persistent "Sign in" affordance top-right, not invoked.

## Session methodology notes

### Injection strategy

- **Raw IDB writes via `indexedDB.open()` do NOT trigger Dexie `useLiveQuery` reactivity in the same tab.** First injection (modal) worked because the subsequent "跳過教學" click performed a Dexie-managed write, which incidentally refreshed observers and read in my injection. After that, the consistent pattern was: raw write → `navigate` (page reload) → state propagates → UI renders correctly. This methodology choice should be documented for future dogfood sessions.
- **Math.random hijack pattern works** for forcing deterministic rolls (bad-luck path, toast firing, pool idx pick). Persists across tab operations as long as not navigated. Restore via `Math.random = window.__origRandom`.
- **setTimeout hijack for toast retention failed** — even patching `window.setTimeout` to skip 5000ms callbacks, the toast still didn't render long enough for screenshot. Suspect React re-render race or session-visibility auto-pause clearing state. Workaround: injected fake DOM `<div class="event-toast event-toast--{negative,positive}">` and verified via `getComputedStyle().borderColor`.

### Tab visibility auto-pause

Chrome MCP operations sometimes flip the tab's visibility state, which triggers `createStudySessionController`'s `visibilitychange` auto-pause. The page goes from `念書中` → `已暫停（離開分頁，回來會自動繼續）` without explicit user click. Re-click 繼續唸書 to resume. Affects any tick-based test.

### Coordinate drift

Window resized mid-session (1568×755 → 1512×786 → back). Button coordinates shifted ~30px between screenshots. Used `find` tool to get element refs (ref_16, ref_27) for click reliability — recommended for any tester driving form interactions.

### Natural play vs IDB injection breakdown

| Scenario | Method | Why |
|---|---|---|
| 2.2 malpractice settle | natural (UI click after injection) | Need actual button click to traverse service code |
| 2.2 malpractice accept-penalty + floor | natural (UI click) | Same |
| 2.2 vip-patient | natural (UI click) | Same |
| 2.2 emergency-shift | natural (UI click) | Same |
| 2.2 audit (1 trial) | natural (UI click) | Same |
| 2.2 audit (distribution) | scripted 1000-trial simulation | UI clicks too slow for stat confidence |
| 2.2 toast (negative-news, 4×) | natural (Math.random hijack + session start + tick) | Forced low-rng triggers first-eligible event |
| 2.3 fate cards (15 pulls) | natural (UI click) | Same |
| 2.3 bad-luck (1 forced) | Math.random=0.0001 hijack + UI click | Bypass 5% probability |
| 2.3 pity-triggered (1 forced) | IDB inject `pity.common=3` + UI click | Skip 3-bad-luck chain |
| 2.4 24h auto-resolve (2 trials) | IDB inject `pendingEventTriggeredAt = now-25h` + start session | Avoid wall-clock waiting 24h |
| 2.5 polarity tinting | DOM inject fake toasts + getComputedStyle | React toast lifetime too short to catch + tab-visibility races |

All Chrome MCP findings cross-checked with source code reading at `lib/tick.ts`, `services/event.ts`, `services/fate-card.ts`, `packages/content-medexam2-tw/src/events.ts`, `packages/content-medexam2-tw/src/fate-cards.ts`, `components/EventModal.tsx`, `components/EventToast.tsx`, `pages/FateCardPage.tsx`, `styles.css`.
