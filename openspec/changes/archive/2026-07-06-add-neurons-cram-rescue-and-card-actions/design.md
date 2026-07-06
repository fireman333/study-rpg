## Context

`DailyPrescriptionCard.tsx` currently renders a single primary CTA (「開始今日處方」 or a completed banner) plus a separate low-salience 「考前？看高頻考點 →」 link, an NG-0717 mascot row with a maturation hint 「完成處方讓 NG-0717 逐步成熟（第 10 天完全體）」, and (just shipped) a dayComplete-gated 「今晚收束」 calm view. `usePrescriptionStatus` → `getPrescriptionStatus` feeds the card; `QuizModal` records every answer through `recordPrescriptionAnswer`. The daily prescription's sacred contract: exactly two tiny lines define `dayComplete`; missing a day is neutral; no guilt/streak-break/deficit.

Owner asks (Codex-consulted): (1) two side-by-side action buttons; (2) make cram engagement a completion item; (3) drop the anxiety-inducing 「第 10 天完全體」 countdown. Codex's key call — do NOT make cram a mandatory 3rd line (it breaks 「兩件小事就夠」); make it a post-完成 optional bonus.

## Goals / Non-Goals

**Goals:**
- Two-button action row (高頻考點 | 今日處方), terse.
- 考前救援 optional bonus that credits cram engagement WITHOUT touching `dayComplete` — a gentle pull into 考前救援, never a 3rd required thing.
- Remove the 「第 10 天完全體」 countdown framing from NG-0717 (open-ended, no deadline).
- Zero Dexie/R2/sync/schema change.

**Non-Goals:**
- Not changing the two-line `dayComplete` definition, NG-0717 stage mechanism, or the reward-idempotency (only the PRESENTATION of NG-0717 changes).
- Not making the bonus give a real NG-0717 stat (「額外養分 +1」 is flavor only).
- No denominator/%/countdown/prediction anywhere (anti-anxiety contract).

## Decisions

### D1 — Two-button action row (item 1)

Replace the single-CTA + separate cram link with one row of two buttons: left 「高頻考點」 (→ `/cram`), right 「今日處方」. The right button keeps the existing routing (next incomplete line via `onStartPrescription`); when `dayComplete` it renders a non-routing completed state (「今日完成 ✓」). 高頻考點 becomes co-equal (no longer strictly subordinate) but still carries NO badge / count / countdown / streak (the anti-anxiety constraints on the cram exit are preserved).

### D2 — 考前救援 as a post-完成 optional bonus (item 2), metric = practice N cram questions (N=1)

Per Codex verdict, cram is NOT a 3rd required line. A 考前救援 bonus tier renders ONLY after `dayComplete`. Completion metric (owner choice): practiced ≥ N cram questions today, **regardless of correct/wrong**, with `CRAM_RESCUE_TARGET = 1`. Tracked by write-once daily meta keys `prescription:v1:cramRescue:{date}:{qid}` written when answering in cram-practice mode (a new `creditCramRescue` prop on `QuizModal`, set by `CramPage`). `getPrescriptionStatus` derives `cramRescueDone` = (count ≥ target). LOCAL-ONLY (not synced), inside the existing `prescription:v1:` namespace so account-reset/switch wipe it via the existing prefix (no new wipe surface). Zero Dexie/R2/sync.

- **Undone** (only shown post-完成): a soft, optional invite — 「想趁手感還在？去高頻考點練 1 題就好（可選）」 — paired with the 高頻考點 button as the entry.
- **Done**: 「考前救援 ✓ · 今天有碰過高頻考點」 + flavor 「額外養分 +1」 (no real stat change).
- The bonus MUST NOT be framed as 「下一步 / 未完成 / 繼續完成」 (Codex red-flag: that makes the two lines feel insufficient). Credit may accrue anytime today (e.g. morning cram); only its VISIBILITY is dayComplete-gated.

**Why "practice N" not "answer correctly N" (owner choice):** lower pressure — a wrong answer still counts, so the bonus never punishes. When the answer happens to be a first-correct on a cram concept, the existing coverage count (calm view) naturally increments too; the two are independent and honest.

**Why explicit cram-route tracking, not pure-derived:** a pure "answered any cram-source question today" derive would auto-complete just from doing the two lines (many repair/breadth questions are high-frequency), defeating the intent to pull the player specifically into 考前救援. The `creditCramRescue` prop credits only the /cram practice entry, making the nudge real. Cost: one small local meta key per answered cram question + one prop; no schema/sync.

### D3 — NG-0717 open-ended reframe (item 3), mechanism unchanged

The NG-0717 stage MECHANISM is untouched (still derived from `completedDayCount` at milestones 1/3/6/10; keepsake at 10; reward idempotent). Only the CARD PRESENTATION changes: the maturation hint drops 「（第 10 天完全體）」 and becomes open-ended — 「完成處方會讓 NG-0717 慢慢長出新的形態；每一次完成都算數。」 (+ 「沒有期限，也不會退化。」). The card MUST NOT surface the milestone numbers (1/3/6/10), a 「還差 X 天」 countdown, or 「第 N 天完全體」. The keepsake copy is reframed to read as a memento of the repair journey, not a deadline — 「一路修補過的痕跡，不是截止日」 (drop the exam-date stamp from display).

### D4 — Integrated dayComplete experience + locked copy

On `dayComplete` the card presents one coherent 收束 area: the completed state (「今天的處方完成了 · 這樣就夠了」), the 考前救援 bonus (done/undone), and the existing 「今晚收束」 calm-view toggle (coverage line + closing). New literals (bonus / NG-0717 / completed) are exported constants covered by the copy-guard test (banned tokens: 還差 / 剩下 / 繼續完成 / 下一步 / 未完成 / 第.*天完全體 / % / 保證 / 必中 / 今年一定考 …).

## Risks / Trade-offs

- **考前救援 could read as a 3rd task** → Mitigated: dayComplete-gated (only after the two lines are done), copy framed as optional bonus, never as 「未完成/繼續」. The two lines remain the sole `dayComplete` bar.
- **高頻考點 co-equal button pulls focus from the ritual** → Mitigated: still no badge/count/pressure; the primary daily action (今日處方) is still on the right and routes the flow.
- **One meta write per cram-practice answer** → cheap write-once check; local-only; consistent with existing wrong/breadth keys.
- **NG-0717 mechanism vs presentation drift** → the stage/keepsake mechanism is explicitly UNCHANGED; only copy changes, so no behavioral regression.

## Migration Plan

Pure additive client-side change. No data migration, no schema/version bump, no backend. Existing `completed:{date}` / NG-0717 state untouched. Deploy = normal CF Pages push. Rollback = revert (cramRescue keys are inert if unread).

## Open Questions

- Copy A/B (owner may tweak the exact bonus/NG-0717 wording after seeing it live) — non-blocking, all literals centralized in `calm-copy.ts`.
