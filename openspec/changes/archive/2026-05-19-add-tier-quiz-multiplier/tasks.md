## 1. Content-pack constant

- [x] 1.1 Add `QUIZ_TIER_MULTIPLIER: Record<HospitalTier, number>` to `packages/content-medexam2-tw/src/recruitment.ts` with values 1.0 / 1.3 / 1.6 / 2.0. Add `// TUNED 2026-05-19 — first dogfood pass; revisit after 1-2 weeks of telemetry` marker.
- [x] 1.2 Re-export verified — `packages/content-medexam2-tw/src/index.ts` already has `export *` from recruitment.ts, so new constant surfaces automatically.

## 2. quiz-rewards service tier read + multiplier application

- [x] 2.1 In `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`, import `QUIZ_TIER_MULTIPLIER` from `@study-rpg/content-medexam2-tw` (added to existing import block).
- [x] 2.2 In `applyQuizReward` transaction body, when reading `counters` for `currentSessionStartedAt`, also read `counters.tier` and compute `const tierMultiplier = QUIZ_TIER_MULTIPLIER[counters.tier]`.
- [x] 2.3 Apply `tierMultiplier` as outermost factor in `revenueDelta` and `reputationDelta` `Math.round(...)` calls:
  ```ts
  const revenueDelta = Math.round(
    QUIZ_REVENUE_PER_CORRECT_BASE * specialtyMultiplier * readingBuff * tierMultiplier,
  )
  const reputationDelta = Math.round(
    QUIZ_REPUTATION_PER_CORRECT_BASE * specialtyMultiplier * readingBuff * tierMultiplier,
  )
  ```
- [x] 2.4 Add inline comment near the formula listing all 4 factors (base × specialty × readingBuff × tier) for future maintenance clarity.

## 3. HomePage net-per-min display fix

- [x] 3.1 In `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` around line 196, import `READING_IDLE_RATE_REDUCTION` from `@study-rpg/content-medexam2-tw` if not already imported.
- [x] 3.2 Replace `const net = throughput - salary` with `const idleThroughput = throughput * READING_IDLE_RATE_REDUCTION; const net = idleThroughput - salary`.
- [x] 3.3 Update the sublabel template at ~line 227 from `毛 {throughput.toFixed(0)} − 薪 {salary.toFixed(0)}` to `毛 {idleThroughput.toFixed(0)} − 薪 {salary.toFixed(0)}` so displayed gross matches tick-loop math.
- [x] 3.4 Verify the cell's `style={{ color: net >= 0 ? 'inherit' : 'crimson' }}` still works — negative net now correctly shows in crimson at high tiers.

## 4. Typecheck + Chrome MCP live smoke

- [x] 4.1 Run `pnpm -r typecheck` — must be all green.
- [x] 4.2 Boot dev server (`pnpm --filter @study-rpg/medexam2-hospital-tw dev`); preflight `mcp__Claude_in_Chrome__list_connected_browsers`.
- [x] 4.3 Chrome MCP: at 診所 fresh save, open QuizModal on 內科 (cross-subject 外科 starter as partner), no session — answer 5 correct → expect `+5 × 80 = +400` revenue (×1.0 tier multiplier).
- [x] 4.4 Patch IDB `gameCounters.tier = '區域醫院'` directly, reload, open QuizModal — answer 1 correct → expect `+ROUND(80 × 1.0 × 1.0 × 1.3) = +104` revenue.
- [x] 4.5 Patch IDB `gameCounters.tier = '醫學中心'`, reload — answer 1 correct → expect `+128` revenue.
- [x] 4.6 Patch IDB `gameCounters.tier = '國家級教學醫院'`, reload — answer 1 correct → expect `+160` revenue.
- [x] 4.7 Reuse d-2's 醫學中心 patched-roster scenario (8 P2 + 1 P1 doctors, 3 rooms assigned, throughput 210/min, salary 132/min) — verify HomePage 「淨收 / 分鐘」 cell shows `-69` (was `+78` pre-fix) and sublabel shows `毛 63 − 薪 132`.
- [ ] 4.8 Verify atomicity: tier-upgrade mid-modal — patch IDB to set reputation slightly below 醫學中心 threshold (149_000), trigger tick to upgrade via reputation cross to 151_000, answer one more question, confirm new tier multiplier applies on that answer.

## 5. SPA prod-equivalent verification

- [ ] 5.1 Build the app: `pnpm --filter @study-rpg/medexam2-hospital-tw build`.
- [ ] 5.2 Preview: `pnpm --filter @study-rpg/medexam2-hospital-tw preview`.
- [ ] 5.3 Chrome MCP: navigate to preview URL, confirm 14 banners render, HomePage 「淨收 / 分鐘」 cell renders correctly at fresh-save 診所 baseline (shows 0).

## 6. Spec validation + handoff

- [x] 6.1 Run `openspec validate add-tier-quiz-multiplier --strict` — must pass.
- [x] 6.2 Confirm no Dexie schema migration files added.
- [x] 6.3 Confirm no cloud-sync table changes.
- [ ] 6.4 Run `/opsx:verify` before tagging the change ready for archive.

## 7. Optional follow-up signals to watch in dogfood

- [ ] 7.1 Dogfood telemetry to confirm: tier 2 reached in ~3-5 days at 30min/day; tier 3 in ~8-12 days; tier 4 in ~20-28 days.
- [ ] 7.2 If pacing too fast → reduce multipliers (1.0 / 1.2 / 1.4 / 1.7).
- [ ] 7.3 If pacing too slow → raise multipliers (1.0 / 1.4 / 1.8 / 2.5) OR increase BASE.
- [ ] 7.4 Player feedback signal: do they feel the "醫學中心 quiz feels noticeably better than 區域醫院 quiz" → if no, gap may be too small (consider 1.0 / 1.5 / 2.0 / 2.5).
