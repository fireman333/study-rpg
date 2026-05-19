## Context

Two `HelpMenu.tsx` strings drifted out of sync with shipped game behavior across two archived changes that did not propagate copy updates:

- `add-quiz-economy-redesign` (2026-05-19) recalibrated `TIER_UPGRADE_THRESHOLDS` to 30k / 80k / 150k but only updated the constant in `clinic-tiers.ts`; the hard-coded HelpMenu §tier-upgrade copy still names the legacy 48k / 192k / 2M figures.
- `rename-retire-to-aad` (2026-05-19) renamed the on-screen button label to `AAD` but explicitly left internal identifiers (`retire` section id, `retireDoctor` service, `.training-retire-btn` class, HelpMenu `id: 'retire'`) untouched; the §retire body string was missed in that pass.

Both are user-facing static strings inside one component. This is a Bug Triage L2 batch fix per [project.md](openspec/project.md), staying on `track-m2` worktree.

## Goals / Non-Goals

**Goals:**
- HelpMenu §tier-upgrade numeric thresholds always match `TIER_UPGRADE_THRESHOLDS` (drift-proof via direct import + template literal)
- HelpMenu §retire copy names the button as `AAD` so players can find it; keep 自願離院 全稱 once on first mention (mirrors `rename-retire-to-aad` Phase A pattern of "AAD button + 退休 tooltip + 退休 confirm modal")
- Spec `hospital-tutorial` Req 「Always-available help menu」 captures the drift-proofing rule so a future contributor changing thresholds knows the HelpMenu derives from the constant

**Non-Goals:**
- Touch the section `id: 'retire'`, accordion title 「醫師退休與返還」, or any internal identifier (`.training-retire-btn`, `retireDoctor()`, etc.) — those are deliberate stable identifiers per `rename-retire-to-aad`
- Re-design HelpMenu IA / section ordering
- Add new HelpMenu sections (e.g. for targeted tickets, doctor rename) — out of scope; see Section 6 of [audit report] for follow-up candidates
- Touch one-階 medexam-tw

## Decisions

**D1: Source tier thresholds dynamically.** Import `TIER_UPGRADE_THRESHOLDS` from `@study-rpg/content-medexam2-tw` and inline-format the body string with template literals (e.g. `${(TIER_UPGRADE_THRESHOLDS.診所 / 1000).toFixed(0)}k`). Rationale: prevents the exact drift bug currently being fixed from recurring on the next recalibration. Alternative considered (hard-code new numbers) — rejected because the recalibration date 2026-05-19 is recent, dogfood is active, and another tune within weeks is realistic.

**D2: Convert `SECTIONS` to a getter function for dynamic interpolation.** Currently `SECTIONS` is a module-level `Object.freeze([])`. To interpolate `TIER_UPGRADE_THRESHOLDS` we either (a) keep `SECTIONS` as a function `getSections()` evaluated at render, or (b) move just the §tier-upgrade body out and compute it inline in render. Choose **(b)** — less churn, the rest of the array stays frozen / static, only the tier-upgrade body becomes a computed paragraph. Keep diff minimal.

**D3: §retire copy phrasing.** Use 「點醫師卡片的「**AAD**」按鈕（自願離院 / 退休）」 — keeps 自願離院/退休 全稱 inline once for new-player comprehension, matching the rename-retire-to-aad tooltip text. Drop redundant 「退休」 in subsequent sentences within the same paragraph (grace-period sentence can read 「24 小時內 AAD 的醫師仍計入升級多樣性門檻（grace period）」).

**D4: Spec amendment scope.** Add a sub-clause to existing Req 「Always-available help menu」 rather than introducing a new Requirement — the change is a constraint on existing behaviour, not a new capability. Add 2 Scenarios: one verifying §tier-upgrade renders current threshold values, one verifying §retire references AAD.

## Risks / Trade-offs

- **[Risk] Template-literal interpolation in `SECTIONS` makes the array no longer purely-static `Object.freeze` compatible** → Mitigation: compute the tier-upgrade body string outside the array literal (above `SECTIONS`), assign to a const, reference in the body array. Frozen array still ships frozen.
- **[Risk] Future contributor recalibrates `TIER_UPGRADE_THRESHOLDS` to non-round-thousand values (e.g. 35_500)** → Current template uses `(threshold / 1000).toFixed(0) + 'k'` which would render `36k` (rounds correctly). Edge case below 1000 (e.g. tutorial threshold 500) would render `1k` (rounding artifact). Not a real risk: tier thresholds are always tens-of-thousands.
- **[Risk] AAD-only copy confuses returning v4/v5 players who learned the button as 「退休」** → Mitigation: keep parenthetical 「自願離院 / 退休」 全稱 inline on first mention; accordion section title 「醫師退休與返還」 also unchanged, so the accordion heading the player reads BEFORE clicking still uses 退休.
- **[Trade-off] Could refactor `SECTIONS` into a `getSections()` function returning live values from a computeBody helper (more elegant, more refactor)** — rejected per [coding_principles.md](~/.claude/imports/coding_principles.md) "Surgical Changes" rule. Just patch the 2 strings.

## Migration Plan

- Single commit on `track-m2`; no schema, no migration, no rollback needed (pure UI string).
- Verify on live by hard-reloading the prod URL after `gh-pages` deploy completes; HelpMenu §tier-upgrade should read 「30k / 80k / 150k」 and §retire 「AAD（自願離院 / 退休）」.

## Open Questions

- None — scope is intentionally narrow.
