# Parallel Dogfood Summary — 二階 hospital mode (2026-05-18)

Three parallel Claude Code sessions exercised 二階 hospital mode against three independent dev servers (port 5180/5181/5182) with origin-isolated IDB. Total **30 test scenarios** across 3 capability clusters. **Zero P1/P2 bugs found.** Source files for raw findings:

- [α — Events + Fate cards](2026-05-18-parallel-dogfood-alpha.md) — 8 scenarios — 🟡 verdict, 1 P3 + 3 P4
- [β — Recruitment + Training + Retire](2026-05-18-parallel-dogfood-beta.md) — 8 scenarios — ✅ 8/8 PASS, 1 design call + 1 design flag
- [γ — Study session + Facility + Tier-up + Tutorial](2026-05-18-parallel-dogfood-gamma.md) — 14 scenarios — 🟢 ship-quality, 2 P4

## Real bugs (need fix changes)

| Tier | ID | Location | Issue | Suggested fix | LOC |
|---|---|---|---|---|---|
| **P3** | α-1 | `apps/medexam2-hospital-tw/src/lib/tick.ts:194-202` | 醫療糾紛 24h auto-resolve branch writes `eventLog.reputationDelta: -5000` (intent constant) instead of `actualDelta` after floor. **Commit 1fae8f4 fix pattern was not propagated** from player-action / toast branches to the auto-resolve branch. Data integrity gap (user-visible rep still correctly floors). | Compute `prevRep`, `newReputation = Math.max(0, prevRep - PENALTY)`, `actualDelta = newReputation - prevRep`, log `actualDelta`. Mirror tick.ts:225-243 pattern | ~6 |
| **P4** | α-2 | `apps/medexam2-hospital-tw/src/components/EventModal.tsx:242` | Malpractice pending modal button shows literal `−5,000 聲望` even when player rep < 5000 (actual deduction will floor at 0). Outcome modal correct; button label not | Either `(將至 0)` parenthetical when rep < threshold, or live-compute effective delta for button label | ~3 |
| **P4** | α-3 | `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx:118` | Dead code: `legendary → 'common'` fallback in pity lookup never reached (guard `tier !== 'legendary'` at line 139 skips display) | Narrow type to `'common'\|'rare'\|'epic'` + early return for legendary | ~2 |
| **P4** | γ-1 | Paused banner copy | `「⏸ 已暫停（離開分頁，回來會自動繼續）」` implies auto-continue regardless of pause reason, but only `visibility-hidden` triggers auto-resume; manual pause requires explicit click. Footer hint clarifies but banner could be tighter | Differentiate banner copy by `lastPauseReason` | ~3 |

## Design calls (need your decision, not code bug)

### D1 — Training success strips female sprite suffix

**β found**: `services/training.ts:57` always emits base male spriteKey on successful training. A female-rolled doctor (`doctor-內科-P5-female`) trained to P4 becomes `doctor-內科-P4` (male). `DoctorRow` has no `gender` field — gender is implicitly encoded in spriteKey suffix only.

Three possible intents:
1. **Intentional rebirth** — rarity-up is rebirth, new gender RNG (but currently it's deterministic male, not re-rolled)
2. **Oversight** — gender should persist (1-line fix, see β finding §2.4)
3. **Resource gap** — only male sprites guaranteed (false — all 70 female keys exist in theme-pixel-hospital)

### D2 — 24h grace covers P1 (potential exploit)

**β found**: Retirement grace at tier-upgrade gate covers all rarities including P1. Player could retire their only P1 to cash out 5,000 revenue refund AND still meet `requireP1=true` for 醫學中心→國家級 upgrade if done within 24h. Source comment says grace is "so players aren't punished for retiring a P5 mid-build" — doesn't articulate P1 exception.

Could be:
- Intentional (encourages mid-build experimentation)
- Hole (would let players double-dip refund + upgrade + re-roll)

Tightening would need rarity-aware grace (e.g., grace only counts P3+ for diversification, P1 must be active for `requireP1`).

## Spec-drift (handoff brief vs source — not code bugs)

Brief docs were stale on numeric specs. **Action**: don't bother updating brief docs (already done their job). Future dogfood runs should auto-generate briefs from source constants instead. Specifics:

- **α brief**: IDB name, pity counter key, emergency-shift uiKind, debug-handle availability
- **β brief**: ticket model (single pool not 4 packs), pity (30/100, no P1), training cost (5× ladder lower), PM ladder (0.5/1/2/3.5/5 not /0.5/1/2/4/8), retire refund (5000 P1 not 8000), starter-pull semantics, 區→醫 diversification (8 not 10)
- **γ brief**: 90s idle pause (deliberately removed in `2026-05-18-redesign-study-session-pomodoro`), tier rep thresholds (48k/192k/2M not 50k/etc), HelpMenu 8 sections (no 事件/設定)

## Cross-domain notes (worth tracking)

| # | Source | Finding | Action |
|---|---|---|---|
| C1 | β | HomePage 底部 dev panel 「練習答對 (mock - wire-quiz-runner-medexam2 接好後拔掉)」 — explicitly labeled removable, still ships to prod | Pre-public-launch cleanup task: gate behind `import.meta.env.DEV` or remove |
| C2 | β | Recruitment result modal overlay can collide pixel-wise with banner 招募 button; clicking underlying button silently no-ops (modal not dismissed) | Mild UX paper cut. Could disable/dim banner button while modal open |
| C3 | α | Math.random hijack pattern + IDB inject pattern works reliably; setTimeout hijack for toast retention failed (React lifecycle) | Methodology note for future dogfood. Keep useful, don't fight React |
| C4 | α / γ | `tutorial.completedSteps` resets re-fires onboarding even if `firstVisit` / `firedTips` reset don't | Documented behavior — `重新顯示所有提示` button preserves completedSteps by design |
| C5 | γ | Navigate-away from /study + back can leave session in semi-active state (currentSessionStartedAt set, tick loop not running). Fresh 開始唸書 resolves. Rare in normal player flow | Architecture friction; could harden controller lifecycle but low priority |

## Two previously-known findings → resolved

| Finding | Source | Status |
|---|---|---|
| Malpractice rep floor mismatch (player-action branch) | Session B 2026-05-18 | ✅ Fixed by commit `1fae8f4` (verified by α — accept-penalty branch now writes actualDelta correctly) |
| AssignDoctorModal facility upgrade button — no inline copy when revenue < cost | Session B 2026-05-18 | ✅ Fixed (verified by γ — button now morphs to `「需要 N 💰」`) |

Auto-resolve branch is still missing the same fix → α-1 finding above.

## Recommended action plan

### Tier 1 — One-shot fix change (small, isolated, no design ambiguity)

**Open `/opsx:propose fix-malpractice-auto-resolve-rep-floor`** (~6 LOC, mirrors the 1fae8f4 pattern that was already merged for player-action + toast branches; just propagate to auto-resolve branch). Capability impact: `hospital-events` MODIFIED scenario for auto-resolve outcome.

### Tier 2 — Design calls awaiting your decision

- **D1 (training female sprite)** — you decide intent → if "preserve gender": open `fix-training-preserve-doctor-gender` (1 LOC change in `services/training.ts:57`). If "intentional rebirth": no code change, document in spec
- **D2 (24h grace P1 exploit)** — you decide if it's a hole. If hole: `fix-tier-upgrade-grace-rarity-aware` (~10-15 LOC + spec). If intentional: document in spec scenario

### Tier 3 — Polish bundle (small P4s, batch into one change)

**Open `/opsx:propose polish-dogfood-2026-05-18-findings`** packing α-2 + α-3 + γ-1 (~8 LOC total across 3 files). Capabilities: `hospital-events` + `hospital-fate-cards` + `hospital-study-session` MODIFIED scenarios.

### Tier 4 — Pre-public-launch cleanup task (not blocking dogfood)

C1 dev-panel removal → not its own change, fold into eventual `prepare-public-launch-cleanup` change or wire as a DEV-only gate inside whatever next 二階 change touches HomePage.

## Branching strategy for merge

Currently `track-m2` has 4 parallel branches building up:

- `track-m2` (HEAD = 9156367 doctor roster P5 completion) — dogfood substrate
- `add-bug-report-pipeline` (uncommitted changes; archive done in worktree)
- `add-medexam2-question-images` (uncommitted changes; in progress)
- (potential) `fix-malpractice-auto-resolve-rep-floor` (Tier 1)
- (potential) `polish-dogfood-2026-05-18-findings` (Tier 3)
- (potential, design-gated) `fix-training-preserve-doctor-gender` (Tier 2 D1)
- (potential, design-gated) `fix-tier-upgrade-grace-rarity-aware` (Tier 2 D2)

Suggested merge order to `track-m2` once all settled:

1. **Image extraction first** (largest delta — types.ts, build.ts, QuizModal.tsx, new public/images/ dir). Land it before other branches rebase
2. **Tier 1 fix** (smallest, isolated)
3. **Tier 3 polish** (small, isolated; might rebase trivially on top of Tier 1)
4. **Tier 2 fixes** (after design call)
5. **Bug-report pipeline** (touches multiple apps + Supabase migration; safer last to minimize conflict surface)

Each merge: `cd ~/coding-scratch/study-rpg-m2 && git merge <branch>` (per project CLAUDE.md curator rule, needs explicit user confirmation per merge).

## What this dogfood produced

- 3 finding files (60+ KB total raw notes)
- 1 summary file (this)
- 0 source code changes (per dogfood discipline)
- 0 commits (per dogfood discipline)
- High-confidence ship-readiness signal: zero P1/P2, design-quality issues are P3/P4
- Detected 1 design oversight (training female sprite strip), 1 architecture observation (24h grace covers P1)
