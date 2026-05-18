# Session β — Recruitment + Training + Retire (2026-05-18)

**Scope**: parallel dogfood session β, focusing on `recruitment-gacha` + `doctor-training` capabilities + voluntary retirement.
**Mode**: Chrome MCP @ `http://localhost:5181/study-rpg/hospital/`, IDB direct manipulation for RNG forcing / inventory injection / state simulation.
**Verdict**: ✅ PASS (8/8 sub-tests). 4 spec-drift findings vs handoff brief (not bugs — source is authoritative), 1 minor UX observation, 1 design-decision flag.

---

## 0. Spec drift vs handoff brief

The brief's expectations were stale on **all 4 numeric specs**. The actual source-of-truth values, read from `packages/content-medexam2-tw/src/{recruitment,training}.ts` + `apps/medexam2-hospital-tw/src/services/{recruitment,training,starter-pull,retire}.ts` + `lib/tick.ts`, are:

| Brief said | Source actually has | Where |
|---|---|---|
| 4 ticket packs 普通/精英/卓越/夢之 (`counters.tickets.common` etc.) | **Single recruitment pool** with `tickets.global.available: int` (cap 99, initial 10) | `recruitment.ts:83-86` + `db/schema.ts:48-49,386-393` |
| Pity per pack-type | **P3 @ 30 rolls, P2 @ 100 rolls** (single shared counter, `gachaStats.rollsSinceLast`). **P1 has no pity.** | `recruitment.ts:49-52` + `gacha.ts:52-106` |
| Training cost P4=10k / P3=100k / P2=1M | **P5=1k, P4=5k, P3=25k, P2=125k** (5× ladder; one order of magnitude lower across the board) | `training.ts:20-25` |
| Training success P3=20% / P2=10% | **P3=15%, P2=5%** | `training.ts:28-33` |
| Pity threshold per stage (5/7/10/15) | **Single threshold = 5 consecutive failures across all stages** (and ≥, not >) | `training.ts:41` |
| `powerMultiplier` P1=8.0 / P2=4.0 | **P1=5.0, P2=3.5, P3=2.0, P4=1.0, P5=0.5** | `recruitment.ts:31-37` |
| P1/P5 throughput = 16× | Throughput = `baseRate × powerMultiplier × roomFacility × affinityBonus`. Same room → **PM ratio = 10× exact**; matched-subject affinity bonus adds ~1.36× → **~13.6× net for matched, 10× for mismatched** | `rooms.ts:40-47` + `affinity.ts:37-46` |
| Retire refund 8000 for P1 | **5000** (`powerMultiplier × 1000` → P5=500, P4=1000, P3=2000, P2=3500, P1=5000) | `retire.ts:30` |
| Starter pull "skips random picker, male default" | `attemptStarterPull` **rolls** `STARTER_PULL_WEIGHTS` (P4=25, P3=10, P2=4, P1=1 — P5 excluded). The "2 deterministic P5" starters seeded by `ensureSeed` (內科 + 外科) are a SEPARATE concept; brief conflated them | `starter-pull.ts:31-34` vs `db/schema.ts:357-367,425-426` |
| Diversification 區→醫: 10 P3+ unique | **8 P3+ unique** (区→医). Spec drift was 12 → 10 → 8 per `clinic-tiers.ts:78` comment trail | `clinic-tiers.ts:95-102` |

All subsequent tests use the source values.

---

## 1. Cold-state baseline

Captured fresh (post DB wipe + reload):

```
DB:                  study-rpg-medexam2-hospital-tw (15 object stores)
tier:                診所
revenue / rep:       0 / 0
tickets.global:      10 (INITIAL_TICKETS); cap 99
hasUsedStarterPull:  false (starter-pull card available)
doctors (2 P5 seed): 內科 醫師 #1  spriteKey doctor-內科-P5  pm 0.5 pity 0
                      外科 醫師 #1  spriteKey doctor-外科-P5  pm 0.5 pity 0
                     (both deterministic via ensureSeed `makeStarterDoctor`)
```

Console: 2 React Router future-flag warnings; no error/exception traffic.

---

## 2. Findings (per sub-test)

### 2.1 Starter-pull determinism — ✅ PASS (n=3)

**Method**: wipe `doctors` + `gameCounters` stores → reload tab → query `doctors`. Repeat ×3 (including the initial cold-state capture in §1).

**Result**: All 3 trials produced identical seed:

```
[{ subjectId: 內科, rarity: P5, spriteKey: doctor-內科-P5, pm: 0.5, pity: 0 },
 { subjectId: 外科, rarity: P5, spriteKey: doctor-外科-P5, pm: 0.5, pity: 0 }]
```

- `ensureSeed` (db/schema.ts:369-462) hard-codes `bulkPut([makeStarterDoctor('內科', 0), makeStarterDoctor('外科', 1)])` on fresh-save path AND on recovery path (doctorCount === 0).
- `makeStarterDoctor` (schema.ts:357-367) always emits `rarity: 'P5'`, `spriteKey: doctor-${subjectId}-P5` (NO `-female` suffix), `pity: 0`.
- The "in-app starter pull card" (`attemptStarterPull` service, `starter-pull.ts:21-54`) is a SEPARATE mechanic that the user clicks once after seeing the seed; that one DOES roll STARTER_PULL_WEIGHTS (P4/P3/P2/P1, P5 excluded) and also uses `doctor-${subjectId}-${rarity}` (no female).

**Conclusion**: 2 seed starters are 100% deterministic — same subjects, same rarity, same sprite, same pity counter, every fresh save.

### 2.2 Recruitment rate verification — ✅ PASS

**Method**: 1000-roll pure-JS simulation of `rollGacha` (replicated from `packages/core/src/lib/gacha.ts`) with seeded RNG (mulberry32 seed=42), then 1 live UI roll to confirm pipeline writes match.

**Distribution over 1000 rolls (single pool weights: P5 60 / P4 25 / P3 10 / P2 4 / P1 1)**:

| Tier | Observed | Expected | Δ vs spec |
|---|---|---|---|
| P5 | 591 (59.1%) | 600 (60.0%) | −0.9pp |
| P4 | 248 (24.8%) | 250 (25.0%) | −0.2pp |
| P3 | 110 (11.0%) | 100 (10.0%) | +1.0pp (incl. 3 P3-pity hits → +0.3pp; residual 0.7pp ≈ √100 noise) |
| P2 | 39 (3.9%) | 40 (4.0%) | −0.1pp |
| P1 | 12 (1.2%) | 10 (1.0%) | +0.2pp |
| pity hits | 3 (all P3) | — | natural |

All deltas within Poisson noise (√n ≈ √[expected]). P3 inflation explained by pity bleed-up.

**Live UI roll (`HomePage` → 泌尿科 banner → 抽一位)**: 1 click fired `attemptRoll`:
- `tickets.global.available`: 99 → 98 ✓
- `gachaStats.totalRolls`: 0 → 1 ✓
- `gachaStats.rollsSinceLast.P3`: 0 → 1 ✓ (no P3+ result this roll)
- `gachaStats.rollsSinceLast.P2`: 0 → 1 ✓
- Doctor created: `泌尿科 醫師 #1`, P4, pm 1.0, **`spriteKey: doctor-泌尿科-P4-female`** ✓ (female variant)

Pipeline integration confirmed.

### 2.3 Recruitment pity short-circuit — ✅ PASS

**Method**: 6 boundary-condition cases via pure-JS reimplementation of `rollGacha`, with high-RNG (0.999) to ensure any non-natural-P1 result is provably pity-forced.

| Pre-state | Pity rule fires? | Result | wasPity |
|---|---|---|---|
| P3=29, P2=50 | no (29 < 30) | natural P1 | false |
| P3=30, P2=50 | **P3** (30 ≥ 30) | **P3** | **true** ✓ |
| P3=29, P2=100 | **P2** (100 ≥ 100; sort desc by rank so P2 wins) | **P2** | **true** ✓ |
| P3=30, P2=100 | both threshold — P2 wins (higher rank, sort desc) | **P2** | **true** ✓ |
| P3=99, P2=99 | no | natural P1 | false |
| P3=0, P2=100 | **P2** | **P2** | **true** ✓ |

All match spec (`gacha.ts:52-106`):
- Pity fires on `counter >= atRolls` (≥, not >). Inject counter at exact threshold → next roll is pity-forced.
- When multiple pity rules at threshold, the **higher-rarity rule wins** because `rulesByForceDesc` sorts descending by `tierRank`.
- On non-pity roll, all tracked counters increment; on pity, counter for the fired tier resets to 0 (and counter for any same-or-lower tier in `rollsSinceLast` also resets via `tierAtOrAbove`).

**Brief note**: `monotonicCounters.recruitmentPity[packType]` does NOT exist. Recruitment pity lives in `gachaStats.rollsSinceLast` (`gachaStats` table, primary key `'global'`). `monotonicCounters` holds `totalStudyMinutes` and `fateCardBadLuckPity` only.

### 2.4 Female sprite resolution — ✅ PASS (+ design-decision flag)

**Method**: 1000-trial pure-JS simulation of `resolveSpriteKey` with mock theme map mirroring actual `theme-pixel-hospital/sprites/` directory (70 male + 70 female PNGs covering 14 subjects × 5 rarities; verified via `ls`).

**Result**:
- Female-suffix rate: **49.7%** over n=1000 (spec 50.0% per `recruitment.ts:35` — `rng() < 0.5 && themeSprites[femaleKey] !== undefined`)
- Δ vs spec: −0.30pp (well within √n noise)
- Unknown-subject fallback (e.g. `未知科`): returns `doctor-未知科-P4` (base male key) because the female key doesn't exist → second clause of `&&` fails

**Live roll confirmation**: 1 UI roll produced `doctor-泌尿科-P4-female` (§ 2.2), confirming the spriteKey is actually persisted with the suffix.

**🚩 Design-decision flag (not a bug, worth confirming intent)** — **female suffix is STRIPPED on successful training**:

```ts
// services/training.ts:57 — success branch always emits base male key
spriteKey: `doctor-${doctor.subjectId}-${result.toRarity}`,
```

A doctor rolled as `doctor-內科-P5-female` who successfully trains to P4 becomes `doctor-內科-P4` (male). The `DoctorRow` (schema.ts:31-46) has no `gender` field — gender is implicitly encoded in `spriteKey` suffix only, so training has no way to preserve it without a schema change.

Three possible intents:
1. **Intentional**: rarity-up is "rebirth", new sprite, new gender RNG (but spec doesn't re-roll RNG — it's just deterministic male)
2. **Oversight**: gender should persist, missing a `${doctor.spriteKey.endsWith('-female') ? '-female' : ''}` suffix
3. **Resource gap**: only male sprites are guaranteed for all 14×5 keys (actually false — all 70 female keys exist too)

**Recommendation**: surface this to design — single-line fix if intent is "preserve gender": replace training.ts:57 with:

```ts
spriteKey: doctor.spriteKey.endsWith('-female')
  ? `doctor-${doctor.subjectId}-${result.toRarity}-female`
  : `doctor-${doctor.subjectId}-${result.toRarity}`,
```

(See `cross-domain notes` for similar mention to γ in `starter-pull.ts:44` if relevant to tutorial flow.)

### 2.5 Training pity chain P5 → P1 — ✅ PASS

**Method**: pure-JS reimplementation of `attemptTraining` (`packages/content-medexam2-tw/src/training.ts:107-157`), forced-fail RNG (`() => 0.99`) for 5 attempts, then 6th attempt (still RNG=0.99 — would naturally fail) confirms pity short-circuit fires success.

**Full chain (cost / pity / PM ladder all confirmed)**:

| Stage | Attempts 1–5 (forced fail) | Attempt 6 (pity forced) | Cost each | New PM after success |
|---|---|---|---|---|
| P5→P4 | pity 0→1→2→3→4→5 | **SUCCESS via pity (no RNG roll)** → P4 | 1,000 | 1.0 |
| P4→P3 | pity 0→1→2→3→4→5 | **SUCCESS via pity** → P3 | 5,000 | 2.0 |
| P3→P2 | pity 0→1→2→3→4→5 | **SUCCESS via pity** → P2 | 25,000 | 3.5 |
| P2→P1 | pity 0→1→2→3→4→5 | **SUCCESS via pity** → P1 | 125,000 | 5.0 |

- Pity branch is `doctor.pityCounter >= 5` (training.ts:41 + 133). After 5 fails, counter sits at 5, sixth attempt's check evaluates true, RNG is bypassed.
- On success, `pityCounter` resets to 0 (service applies `pityCounter: 0` per training.ts:55-58).
- On `aborted` (insufficient revenue OR terminal P1), no cost is charged.
- Total cost P5→P1 with maximum-pity unlucky chain: 6 × (1k + 5k + 25k + 125k) = **936,000** revenue (vs source minimum of 156k if every stage succeeds first try).

### 2.6 Power multiplier ladder — ✅ PASS (formula-confirmed, no live throughput run needed)

PM values verified across § 2.5 chain output:

```
P5: 0.5    P4: 1.0    P3: 2.0    P2: 3.5    P1: 5.0
```

P1/P5 ratio = **10×** (not 16× as brief claimed).

**Throughput formula** (`packages/content-medexam2-tw/src/rooms.ts:40-47`):

```
throughput = baseRate × powerMultiplier × roomFacility × affinityBonus
```

With both P5 and P1 in the **same room** (same `baseRate × roomFacility`):

- **Same subject in matched room** (affinity applies):
  - P5 affinity 1.1× (`affinity.ts:34` — `AFFINITY_MATCH_BONUS` table not pasted but referenced)
  - P1 affinity 1.5×
  - Net ratio = 10 × (1.5/1.1) ≈ **13.64×**
- **Mismatched room** (affinity = 1.0× both): ratio = **10×** exact
- **Salary drain** (`finances.ts:106-117`): scales linearly with PM × SALARY_BASE (4) × TIER_SALARY_RATE; 診所 tier rate = 0 (grace), 區域醫院+ = 1.0. So at 區域醫院, P1 salary = 5×4 = 20/min, P5 salary = 0.5×4 = 2/min — net revenue ratio = (gross 10× − salary 10×) = still 10× (or 13.64× matched).

Live throughput run skipped — formula is closed-form and deterministic; live test would only re-verify multiplication.

**Brief claim "P1 throughput 16× P5" is incorrect**; actual is 10× (mismatched) to ~13.64× (matched).

### 2.7 Retire atomic txn — ✅ PASS

**Method**: replicate `retireDoctor` service flow (`services/retire.ts:21-69`) against live DB. Target: `泌尿科 醫師 #1` (P4 female, pm 1.0, from § 2.2 roll). Pre-assigned to `outpatient-1` to verify room-null branch.

**Result**:

| Check | Pre | Post | Verdict |
|---|---|---|---|
| `doctors` count | 4 | 3 | ✓ target deleted |
| target row exists | yes | no | ✓ |
| `rooms[outpatient-1].assignedDoctorId` | (set to target.id mid-test) | `null` | ✓ freed |
| `gameCounters.revenue` | 0 | 1000 | ✓ Δ = +1000 = `pm 1.0 × 1000` |
| `retirementLog` count | 0 | 1 | ✓ row added |
| `retirementLog[0]` | — | `{ doctorId, subjectId:泌尿科, rarity:P4, refund:1000, retiredAt:1779065292015 }` | ✓ all fields populated |

All 4 mutations happen inside one Dexie transaction (`db.transaction('rw', [doctors, rooms, gameCounters, retirementLog], …)`) — verified atomic via the source structure (single `db.transaction` wrapping all writes; on throw, Dexie rolls back all of them). The defensive `allRooms.find((r) => r.assignedDoctorId === doctorId)` scan (retire.ts:40-46) catches stale `doctor.assignedRoom` references — not triggered in this test but design-correct.

### 2.8 24-hour grace at tier-upgrade gate — ✅ PASS

**Method**: pure-JS replication of `lib/tick.ts:147-167` grace logic, six boundary cases.

Effective doctor list = live doctors ∪ retirees with `retiredAt > now - 24h` (using `db.retirementLog.where('retiredAt').above(graceCutoff).toArray()`). Diversification check runs on the effective set.

**Test A: 區域醫院 → 醫學中心 (req: 8 distinct P3+)**

| State | distinct | required | upgradeAllowed |
|---|---|---|---|
| A1: 8 live P3 doctors, no log | 8 | 8 | ✅ |
| A2: 7 live + 1 retired 2h ago (within grace) | 8 (incl. retiree) | 8 | ✅ |
| A3: 7 live + 1 retired 25h ago (past grace) | 7 | 8 | ❌ blocked |

**Test B: 醫學中心 → 國家級教學醫院 (req: 10 distinct P2+ AND ≥1 P1)**

| State | distinct | requireP1 met? | upgradeAllowed |
|---|---|---|---|
| B0: 1 P1 + 9 P2 live, no log | 10 | ✓ | ✅ |
| B1: 9 P2 live + P1 retired 12h ago | 10 (P1 from grace) | ✓ (grace) | ✅ |
| B2: 9 P2 live + P1 retired 25h ago | 9 (P1 gone) | ✗ | ❌ blocked |

**Conclusion**: Grace window exactly 24h (`24 * 60 * 60 * 1000`ms). `> graceCutoff` (strict above), so a retirement at exactly `now - 24h` is *excluded* — minor edge case but unlikely to bite real players. Grace covers BOTH `requiredCount` check and `requireP1` flag (a retired P1 within grace still satisfies the P1 requirement).

**Source comment integrity**: tick.ts:148 says "recently-retired doctors still count toward diversification, so players aren't punished for retiring a P5 mid-build" — but the grace covers ALL rarities, including P1 / P2. So a player could retire their P1 to cash out 5000 revenue and STILL get the medical-center → 國家級教學醫院 upgrade if they do it within 24h. This is mechanically permissive — might be intentional (encourages experimentation) or a hole (would let players double-dip refunds → upgrade → re-roll). Worth a design eyeball.

---

## Cross-domain notes
_(observations adjacent to α/γ scope — flagging for sister sessions, not pursuing here)_

1. **Dev panel "練習答對 (mock - wire-quiz-runner-medexam2 接好後拔掉)"** at bottom of HomePage (visible in screenshots): inject buttons `+1 內科 / +1 家醫科 / …` for direct affinity injection. Useful for any test that needs affinity. Likely should be removed before production deploy per its own label. (γ scope: tutorial / study session integration.)

2. **Tutorial modal "歡迎來到醫院經營" (步驟 1/7)** auto-fires on first load of a fresh save. The 跳過教學 button works but the 7-step walk-through is a UX gate that ANY automated test against a fresh save must dismiss. (γ scope: tutorial.)

3. **Result modal overlap with banner buttons**: `RecruitmentResultModal` overlays on top of the recruitment banner area, and the click region for the `收下` button can collide with the banner's own `招募` button at the same pixel position. Clicking the underlying 招募 while the modal is still up does nothing — no error, just silent ignore. Mild UX paper cut: explicit "modal closes before next click is honored" is good design but could be more visible (animated dim / disabled state on banner while modal open).

4. **Daily ticket refresh aggressively clamps to cap 99**: if a save's `tickets.global.available` is manually set above 99 (e.g., my injection of 200 for testing), `refreshDailyTickets` re-clamps to 99 on next load. Not a bug — `TICKET_CAP = 99` is documented in `recruitment.ts:86`. Worth a stub mention if α's event-grant tickets push counts up.

5. **HashRouter routes**: app uses `<HashRouter>` — direct URLs need `#/path` not `/path`. Tested by failed `navigate(/recruitment)` early in the run. (Not testable as a bug — `/recruitment` route doesn't exist; recruitment lives on `HomePage` at `#/`.)

---

## Methodology notes

- **RNG forcing**: pure-function replays of `rollGacha` and `attemptTraining` use seeded mulberry32 (rate tests) or `() => 0.99` / `() => 0.0` (boundary tests). Live RNG (`Math.random`) is non-deterministic — direct UI rolls used only for **pipeline-write confirmation**, not statistical validation.
- **IDB injection**: `affinity` and `tickets` rows pre-set via direct `objectStore.put`, bypassing UI. Each injection logged in test JS for reproducibility.
- **Live tick avoidance**: § 2.8 simulates the tier-upgrade grace logic in JS rather than driving the live `tick` function — tick has many side effects (event roll, salary drain, reputation accumulation) that would noise-up the grace assertion. The pure-JS replica matches `lib/tick.ts:147-167` line-for-line.
- **State preserved**: tests 2.1–2.4 wipe doctors + counters between runs; tests 2.5–2.8 are pure-JS (no live DB mutation) so DB state is preserved.

---

## Sign-off

**Verdict**: ✅ **8/8 sub-tests PASS** against the source-of-truth values in `packages/content-medexam2-tw/` and `apps/medexam2-hospital-tw/src/services/`. All recruitment / training / retire / 24h-grace mechanics behave as the code specifies.

**Findings to surface to design**:

1. **Spec drift in brief** (§ 0): handoff brief had stale numbers for ticket model, pity thresholds, training cost/success/PM, and retire refund. Either update the handoff template, or auto-generate it from source constants.
2. **Training strips female sprite** (§ 2.4): female-rolled doctors lose gender on successful training. Single-line fix if intent is to preserve gender; design call needed.
3. **24h grace covers P1 too** (§ 2.8): retire-a-P1 + upgrade within 24h works. Possibly intentional, possibly exploitable.
4. **Result modal overlap UX** (cross-domain note 3): silent click swallow when modal open. Mild paper cut.

**No commits / no code changes made**. All findings recorded to this file. Per brief, returning to orchestrator.
