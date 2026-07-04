## 1. Prescription service (zero-schema, meta-only)

- [x] 1.1 Create `apps/neurons-tw/src/lib/services/prescription.ts` with the `prescription:v1:` meta helpers (read/write via `db.meta`, keyed by `todayISO()`).
- [x] 1.2 `getOrCreateTodayPlan()`: first call of the day snapshots wrong-pool (`buildWrongQuestionPool` → `wrongEligibleQuestionIds`) + selected 盲區 family's unseen ids (`filterPoolByNewOnly` → `breadthEligibleQuestionIds`), computes `wrongTarget` N (pool-size + recent-20 accuracy scaling) and `breadthTarget` M (N-complementary, total ≤12), persists frozen `plan:{date}`, returns the same frozen plan same-day.
- [x] 1.3 Blind-spot family selection: `score = 0.75·(unseen/total) + 0.25·min(1,(outstandingWrong/max(uniqueAttempted,8))·3)`; eligible = `unseenCount>0`; skip a family chosen the previous 2 consecutive days when an alternative exists; deterministic `date+familyId+localUserId` hash tie-break.
- [x] 1.4 Progress recording `recordPrescriptionAnswer(questionId, family, result)`: wrong line counts only snapshot ids answered correct; breadth counts first-of-day answers in the 盲區 family (correct or wrong); write-once per line per day (`wrong:{date}:{qid}` / `breadth:{date}:{qid}`), deduped.
- [x] 1.5 `getPrescriptionStatus()` returns derived line progress, per-line + whole-day completion, and next-incomplete-line routing target.
- [x] 1.6 Wire `recordPrescriptionAnswer` into the single existing answer path (QuizModal resolution) for both wrong-pool expedition and family `fresh` answers; no new quiz mode.

## 2. NG-0717 reward (rolling completions, zero-schema)

- [x] 2.1 Day-completion + rolling maturation: on both lines complete set `completed:{date}` (write-once); derive `completedDayCount` by counting `completed:*` keys; expose `ng0717Stage` derived from count (milestones 1/3/6/10) — never store stage.
- [x] 2.2 Idempotent reward claim (`reward:{date}`); optional energy via existing daily-capped conduction faucet `min(20, remainingCap)`, animation-only when cap = 0.
- [x] 2.3 Full-maturity keepsake: at `completedDayCount ≥ 10` unlock the permanent NG-0717 keepsake stamped `2026.07.17` (derived display, zero schema).
- [x] 2.4 Production sprites: from the approved concept (already generated), cut/regenerate **4 static NG-0717 stage sprites** (384×384, 16-color GBA, transparent bg) into `packages/theme-pixel-neurons/sprites/` + register via `src/sprites.ts` `import.meta.glob`; document the prompt in a matching `*_SPRITE_GENERATION.md`. (Final art pick = concept vs v2a, owner to confirm at build.)

## 3. Anxiety-safe pacing (Decision 5)

- [x] 3.1 Enforce monotonic progress: `completedDayCount` + `ng0717Stage` only increase, never decrease; no streak / no consecutive-day requirement.
- [x] 3.2 No-negative rendering: a missed day shows NO streak-break / red / broken / "missed" / "behind" state or guilt copy; cumulative shown as「已固化 X 天」with NO fixed denominator.
- [x] 3.3 Exam countdown「距考試還有 N 天」as ambient chrome only (non-gating); after 2026-07-17 switch to「考試結束 · 繼續固化」; maturation continues (no lockout).

## 4. Card UI + homepage mount

- [x] 4.1 `apps/neurons-tw/src/lib/hooks/usePrescriptionStatus.ts` (reactive; mirror `useDmnStatus`).
- [x] 4.2 `apps/neurons-tw/src/components/DailyPrescriptionCard.tsx`: two lines with progress (`訂正錯題 2/4` / `開發盲區 5/8`), single 「開始今日處方」 CTA to next-incomplete line, 「已固化 X 天」+ NG-0717 mascot at derived stage + ambient countdown. 醫囑語氣 non-punishing microcopy. Degrade under `prefers-reduced-motion`.
- [x] 4.3 Mount card in `routes/OverviewPage.tsx` as topmost surface ABOVE the merged stat card; collapsible slim strip vs full card; persist collapse choice in device-local `meta` (not synced), default expanded.
- [x] 4.4 Wire single CTA: incomplete 訂正錯題 → wrong-pool expedition; else incomplete 開發盲區 → 盲區 family `fresh`; both complete → completed state (no route).

## 5. 熄燈儀式 lights-out (neurons-lights-out)

- [x] 5.1 Always-available「今天到此為止」control on the homepage; on activate play a low-stimulus closure ritual (connectome night scene, today's touched families each single soft glow, rest/sleep-consolidation reframe line). Reuse existing connectome render; degrade under `prefers-reduced-motion` to static night state.
- [x] 5.2 Qualitative only: never show 題數/分鐘/accuracy/score/countdown/pass-fail; works on zero-activity days with honest rest framing (「休息也是機制的一部分」).
- [x] 5.3 Persist `lightsOutDate:{date}` local meta (not synced), clears at midnight; sleep-consolidation copy uses only design.md anchor claims (no guaranteed personal outcome).
- [x] 5.4 Post-lights-out calm homepage state: quiet/hide push CTAs (處方 CTA + quiz entries) for the rest of the day; NOT a hard lock — low-key「還是想再讀一下」restores normal homepage with no negative framing.

## 6. Economy & sync safety guards

- [x] 6.1 Confirm no `SYNCED_META_KEYS` entry, no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` change, no DMN/leaderboard touch (grep + diff review).
- [x] 6.2 Confirm all new meta keys are write-once / derived (no spendable/bidirectional counter).

## 7. Tests

- [x] 7.1 Plan generation: N scaling by wrong-pool size + recent-accuracy cap; M complementarity; total ≤12; empty-pool auto-satisfy; same-day freeze.
- [x] 7.2 Blind-spot selection: highest-score pick, 2-day repeat skip, deterministic tie-break, eligible-only (`unseen>0`).
- [x] 7.3 Progress dedup + anti-cheat: snapshot-only wrong counting; breadth counts first answer regardless of correctness; no double-count.
- [x] 7.4 NG-0717 maturation: `completedDayCount` → stage milestones (1/3/6/10); full maturity + keepsake at 10; idempotent per-day; **monotonic (never decreases across missed days)**; keepsake reachable after exam date (no lockout).
- [x] 7.5 Lights-out: once-per-day guard + midnight clear; qualitative-only (no metrics); calm-state CTA quieting + restore affordance.

## 8. Verify

- [x] 8.1 `pnpm --filter @study-rpg/neurons-tw test` (vitest) green + `pnpm -r typecheck` clean.
- [x] 8.2 Chrome MCP smoke on localhost: card renders ABOVE stat card, collapsible; single CTA routes wrong→breadth; progress increments + dedups; completion advances NG-0717 stage + shows「已固化 X 天」(no scary denominator); missed-day shows no negative state; lights-out plays night scene + calm state + restore works; no console errors. Verify F5 + direct `/` (SPA three-piece per `chrome_mcp_preflight`), reduced-motion static states.
- [x] 8.3 `/opsx:verify` green on completeness / correctness / coherence before archive.

## 9. Nice-to-have (deferred; not required for MVP ship)

- [ ] 9.1 NG-0717 four-stage animation (vs MVP static sprites).
- [ ] 9.2 Include 半熟題 (attempts ≤ 1) in the blind-spot pool (data present via `questionHistory.attempts`).
- [ ] 9.3 Diegetic 齒狀迴 "already-consolidated days" reading-layer strip beside NG-0717 (avoid 髓鞘 naming).
- [ ] 9.4 Other anxiety-relief backlog (from Codex/Fable): 殘光掃描 (late-arriver), 不應期獎勵 (rest-rewarded), 少看數字遮罩, 杏仁核寄物櫃 (Ramirez & Beilock 2011 — OE-anchor first), 國考可控清單, 0717 note / 7-16 ceremony.
