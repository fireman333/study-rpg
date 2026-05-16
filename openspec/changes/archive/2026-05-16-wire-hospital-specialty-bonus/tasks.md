## 1. Specialty constants + helper in content pack

- [x] 1.1 Create `packages/content-medexam2-tw/src/specialty.ts`
- [x] 1.2 Export `SPECIALTY_MATCH_MULTIPLIER: Readonly<Record<Rarity, number>>` with P1=1.5 / P2=1.3 / P3=1.2 / P4=1.1 / P5=1.05 (Object.freeze)
- [x] 1.3 Export `getSpecialtyMultiplier(doctorSubjectId: SubjectId | null, doctorRarity: Rarity | null, quizSubjectId: SubjectId): number` — returns multiplier from table when doctorSubjectId === quizSubjectId and both non-null, else returns 1.0
- [x] 1.4 Update `packages/content-medexam2-tw/src/index.ts` to re-export both
- [x] 1.5 Verify `pnpm --filter @study-rpg/content-medexam2-tw build` succeeds (if package has build step) and `pnpm -r typecheck` passes — content pack has no build step, typecheck passes

## 2. Wire multiplier into mastery write path

- [x] 2.1 Edit `apps/medexam2-hospital-tw/src/lib/mastery.ts` — add `multiplier: number = 1.0` parameter to `upsertMastery`; multiply `existing.correct + (wasCorrect ? 1 : 0)` portion by multiplier (only the +1 delta, not the existing correct value)
- [x] 2.2 Add `partner: { subjectId: SubjectId; rarity: Rarity } | null = null` parameter to `recordCorrectAnswer`; call `getSpecialtyMultiplier(partner?.subjectId ?? null, partner?.rarity ?? null, record.subjectId)` and pass result into `upsertMastery`
- [x] 2.3 Leave `recordWrongAnswer` unchanged — multiplier never applies to wrong answers (per spec Req 2 scenario "Wrong answer never applies multiplier")
- [x] 2.4 Verify atomicity unchanged — multiplier computation is sync pure function between transaction read and write — `getSpecialtyMultiplier` runs before `db.transaction()`, no read-modify-write race

## 3. QuizModal partner chip + border

- [x] 3.1 In `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`, import `getSpecialtyMultiplier` from content pack
- [x] 3.2 In `handlePickOption`, when calling `recordCorrectAnswer`, pass `partner: { subjectId: boundDoctor.subjectId, rarity: boundDoctor.rarity }` derived from current `boundDoctor`
- [x] 3.3 Inside the partner section JSX, compute `specialtyMultiplier = getSpecialtyMultiplier(boundDoctor?.subjectId, boundDoctor?.rarity, subjectId)` once per render
- [x] 3.4 If `specialtyMultiplier > 1.0`, render a chip `<span className="quiz-modal__partner-bonus">✨ {specialtyMultiplier}×</span>` (literal `String(num)` since 1.5/1.3/1.2/1.1/1.05 stringify cleanly) next to partner info span
- [x] 3.5 Add inline `style={{ borderLeft: \`4px solid var(--rarity-${boundDoctor.rarity.toLowerCase()})\` }}` to `.quiz-modal__partner` div (only when boundDoctor exists; empty state skips)
- [x] 3.6 Verify dropdown `<select>` for changing partner still works after wrapping changes; chip + border update reactively on partner change — `specialtyMultiplier` re-computes per render via standard React state (`boundDoctorId` / `subjectId`)

## 4. CSS

- [x] 4.1 Add `.quiz-modal__partner-bonus` chip styling to `apps/medexam2-hospital-tw/src/styles.css` — gold-tone rounded chip
- [x] 4.2 Verify the rarity CSS variables (`--rarity-p1` through `--rarity-p5`) are defined in `styles.css` — confirmed at lines 12-16 (p1 #c44d4d / p2 #d4a04d / p3 #a06ac4 / p4 #6a9bc4 / p5 #d8d8d8)
- [x] 4.3 `.quiz-modal__partner` already had `border: 2px dashed var(--frame-dark)` — inline `borderLeft` override stacks cleanly via inline style precedence; visual: dashed top/right/bottom + solid rarity-colored left

## 5. Typecheck + dev smoke

- [x] 5.1 `pnpm -r typecheck` — must pass with 0 errors ✓
- [x] 5.2 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` — boots at `http://localhost:5174/study-rpg/hospital/` ✓
- [x] 5.3 Manual smoke: open hospital home, click 內科 學習, verify partner section renders with rarity color border + chip if same-subject ✓

## 6. Chrome MCP functional smoke

- [x] 6.1 Preflight: ≥ 1 browser connected (Browser 1, macOS local)
- [x] 6.2 Reset DB to fresh seed — 2 P5 starter doctors spawned (內科 + 外科)
- [x] 6.3 P5 same-subject correct: 內科 P5 partner answering 內科 Q56 (D=answer) → `mastery.內科.correct === 1.05` ✓ (NOT 1.0 or 1.5)
- [x] 6.4 Cross-subject correct: 外科 P5 partner answering 內科 Q23 (A=answer) → `mastery.內科.correct: 2.05` (= 1.05 + 1.0, multiplier 1.0 for cross-subject) ✓
- [x] 6.5 P5 same-subject UI: chip `✨ 1.05×` visible, `border-left: rgb(216, 216, 216)` = `--rarity-p5` ✓
- [x] 6.6 Cross-subject UI: chip NOT rendered (`chipPresent: false`), partner border still rendered (rarity-p5 grey persists from previous bound) ✓
- [x] 6.7 P1 same-subject test: seeded test-p1-neike via Dexie → partner switch → chip `✨ 1.5×` + border `rgb(196, 77, 77)` = `--rarity-p1` ✓; answer 內科 Q64 (D=answer) → `mastery.correct: 3.55` (= 2.05 + 1.5) ✓; banner UI displays `掌握 118%` confirming > 100% game-y display per Decision 6

## 7. Verification + spec compliance

- [x] 7.1 `openspec validate wire-hospital-specialty-bonus --strict` ✓
- [x] 7.2 Spec scenarios mapped to smoke tests — see decisions log entry for table
- [x] 7.3 `/simplify` self-review — `PartnerInfo` interface in mastery.ts narrowly typed; no orphans / unused exports; specialty.ts pure
- [x] 7.4 Production build smoke: `pnpm --filter @study-rpg/medexam2-hospital-tw build` succeeds (1.21s, 422 KB JS / 23 KB CSS, no warnings)

## 8. Pre-archive

- [x] 8.1 Update `openspec/decisions/2026-05-16.md` with entry summarizing specialty bonus go-live, tier table location, scenario coverage, and dogfood observation points — written at `23:45` entry
- [x] 8.2 Cross-reference to potential follow-ups: `extend-specialty-cluster-match` / `wire-affinity-specialty-bonus` / `polish-mastery-percent-cap` — noted in decisions entry
- [ ] 8.3 `/opsx:archive wire-hospital-specialty-bonus` — **gated by user explicit confirm**
- [ ] 8.4 auto-git commit with template: `spec(archive): merge wire-hospital-specialty-bonus — tier-based mastery bonus + partner chip + rarity border polish` — **gated by user explicit confirm**
