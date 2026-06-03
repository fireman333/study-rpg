## ADDED Requirements

### Requirement: Overview SHALL surface a family subject picker that filters the active quiz pool

The neurons-tw Overview page SHALL render a family chip grid that lets the player narrow the quiz question pool to a single neuron family (one of the 11 families enumerated by `content-neurons-tw`) without changing any downstream gameplay mechanic (rewards / SRS / DMN trigger / family mastery accrual remain unchanged). The picker SHALL also include an explicit "全部" chip that restores the default behavior of drawing questions from the unrestricted pool.

The picker SHALL behave as a **pure filter**, not as a dedicated mode:

- Selection state is held in transient React state (or URL search param) at the Overview level. **No** Dexie row, **no** sync table, **no** state machine across sessions.
- When the player launches quiz with a family selected, the quiz-pool helper SHALL receive that `familyId` as an optional argument and restrict candidate questions to those whose `subjectId` resolves to that family per the existing subject-resolution invariant.
- When the player launches quiz with no family selected (or "全部" chip active), the helper SHALL fall back to the unrestricted pool (existing behavior).
- After a quiz session ends, the picker selection state is preserved on Overview (so the player can repeat the same family without re-clicking) but is NOT persisted across page reload (transient).

Chip visual SHALL source identity from the `content-neurons-tw` family roster (family `displayName`, family sprite key from `theme-pixel-neurons`, NT-branch-derived accent color). Chips SHALL NOT hardcode any family name or color.

The picker SHALL be responsive: desktop renders an 11-chip grid (single row or wrapped); narrow viewport (e.g., mobile < 600px) renders a 2-column scrollable grid. The "全部" chip SHALL be visually distinct (e.g., larger, different accent) so it's discoverable as the reset entry-point.

#### Scenario: Family chip click restricts quiz pool

- **GIVEN** the player is on Overview with the "藥理學" chip selected
- **WHEN** the player clicks 🎯 開始答題
- **THEN** the QuizModal SHALL open with a candidate pool restricted to questions whose `subjectId` resolves to family `藥理學`
- **AND** no question outside `藥理學` SHALL be served in this session
- **AND** the rewards / SRS / DMN trigger pipelines SHALL operate identically to the unrestricted case

#### Scenario: 全部 chip restores random pool

- **GIVEN** the player previously had "藥理學" selected and now clicks "全部"
- **WHEN** the player clicks 🎯 開始答題
- **THEN** the QuizModal SHALL open with the unrestricted question pool
- **AND** the served questions SHALL span any family per random selection

#### Scenario: Picker selection does not persist across reload

- **GIVEN** the player selects "藥理學" chip on Overview
- **WHEN** the player reloads the page (F5)
- **THEN** the picker SHALL reset to "全部" default
- **AND** no Dexie row, no localStorage key, no sync table SHALL retain the selection

#### Scenario: Picker chip identity sources from content pack

- **GIVEN** a developer changes the `displayName` of family `生理學` in `content-neurons-tw` to `生理學 (Physiology)`
- **WHEN** the Overview re-renders
- **THEN** the corresponding family chip SHALL display the new name without any code change in `apps/neurons-tw/`

### Requirement: Rarity reveal animations SHALL share a centralized timing baseline with rarity-tiered minimums

All rarity-based reveal UI in neurons-tw — including `VariantUnlockModal` from `neuron-variant-gacha` and `DmnCardReveal` from `neurons-dmn-fate-cards` — SHALL consume reveal timing constants from `neurons-motion-library` (`apps/neurons-tw/src/lib/motion.ts` or equivalent module). No reveal component SHALL declare inline numeric duration literals for the rarity-tiered ceremony.

The motion library SHALL export a `RARITY_REVEAL_TIMINGS` (or equivalent named) constant mapping each rarity grade to a `{ durationMs, spinTurns }` pair. The mapping SHALL satisfy:

- **All 5 rarity grades** (P1 / P2 / P3 / P4 / P5) SHALL have `durationMs >= 1000`. No rarity is permitted to flash by faster than 1000ms.
- **P1 鑽** SHALL have `spinTurns >= 3` and `durationMs >= 1500`, producing a multi-rotation spectacle ("快轉 → 減速 → 定位" three-stage feel) befitting the rarest tier.
- **P2 金 / P3 銀 / P4 銅 / P5** SHALL have `spinTurns === 0` (no spin; use fade + scale + flash only). These tiers are reserved for the simpler ceremony.

The exact monotonic ordering and values (e.g., P5 = 1000ms, P4 = 1000ms, P3 = 1100ms, P2 = 1200ms, P1 = 1500ms) are an implementation detail tuned by the motion library and may evolve, **but the two hard constraints above (all ≥ 1000ms; P1 ≥ 3 spin turns) are normative and may not be relaxed without a new change**.

Components SHALL respect OS `prefers-reduced-motion`:

- When `useRespectsReducedMotion()` returns `true`, all reveal animations SHALL degrade to opacity-only fade-in of the same total duration.
- Spin rotation SHALL NOT play under reduced-motion preference, regardless of rarity.

#### Scenario: P1 reveal plays multi-rotation spectacle

- **GIVEN** a player triggers a P1 reveal (e.g., variant gacha P1 unlock or DMN P1 draw)
- **WHEN** the reveal modal mounts
- **THEN** the modal SHALL animate with a CSS / Framer Motion variant that rotates the artwork at least 3 full turns
- **AND** the animation total duration SHALL be at least 1500ms
- **AND** the easing SHALL produce a clear deceleration (e.g., ease-out cubic or equivalent) so the artwork "snaps into place" at the end

#### Scenario: All non-P1 reveals meet 1000ms baseline

- **GIVEN** a player triggers a P2, P3, P4, or P5 reveal
- **WHEN** the reveal modal or toast renders
- **THEN** the animation total duration SHALL be at least 1000ms
- **AND** no rotation SHALL be applied

#### Scenario: Reduced-motion users get opacity-only fade

- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **WHEN** any rarity reveal mounts
- **THEN** the reveal SHALL use only opacity fade-in over the same total duration
- **AND** rotation, scale bounce, and translate transforms SHALL NOT apply

#### Scenario: Reveal components forbid inline timing literals

- **GIVEN** a developer audits `apps/neurons-tw/src/components/VariantUnlockModal.tsx` (or any reveal component)
- **WHEN** the developer searches for numeric literals `1000`, `1500`, `3000` etc. in animation duration / turns position
- **THEN** those literals SHALL NOT appear inline
- **AND** the file SHALL import `RARITY_REVEAL_TIMINGS` (or the equivalent named export) from `'../lib/motion'` (or the motion library path)

### Requirement: Production build SHALL NOT surface dev-only diagnostic UI

The neurons-tw production build (`pnpm build`, deployed to `med-study-rpg.com/neurons/` and `fireman333.github.io/study-rpg/` if applicable) SHALL NOT render or expose dev-only diagnostic UI to end users. Specifically:

- The `/motion-demo` route SHALL NOT be linked from the main `<nav>` element. The route itself MAY remain reachable by direct URL for developer self-verification, but no user-facing entry point SHALL exist.
- The `ConnectomeDebugPanel` component (containing buttons such as「重設存檔」/「+1 答對」/「時間 +1 天」) SHALL NOT render in `ConnectomePage` or any other production page. The component MAY be deleted from the codebase entirely.
- The `ConnectomeTreeSvg` `fireRandomCascade` demo button (typically labeled「⚡ 觸發傳遞 (demo)」) and its driving function SHALL NOT render or be invocable in production.

Diagnostic capability for developers SHALL be available via DEV-only hooks (e.g., `import.meta.env.DEV` gated `globalThis.__db` / `globalThis.__sync` / Dexie browser devtools), not via production-visible UI surfaces.

#### Scenario: Production navbar omits motion-demo

- **GIVEN** the production build is deployed
- **WHEN** the player loads any page and inspects the top `<nav>` element
- **THEN** no `<a>` or `<button>` SHALL link to `/motion-demo`
- **AND** the 5 user-facing tabs (or however many are decided post-polish) SHALL be the only nav entries

#### Scenario: ConnectomePage does not render debug panel in production

- **GIVEN** a user visits `/connectome` on the production build
- **WHEN** the page renders
- **THEN** the component tree SHALL NOT include `<ConnectomeDebugPanel>` or any component containing dev-only reset / counter-bump buttons
- **AND** the page header / sidebar SHALL only contain user-facing content (empty state callout, family card grid, etc.)

#### Scenario: ConnectomeTreeSvg has no cascade demo button

- **GIVEN** a user views the connectome SVG on `/connectome`
- **WHEN** the SVG renders
- **THEN** no button labeled "⚡ 觸發傳遞" or marked `(demo)` SHALL exist in the SVG overlay
- **AND** the `fireRandomCascade` function (if it ever existed) SHALL either be deleted or be unreachable from any production render path

### Requirement: Leaderboard push SHALL include real reading minutes from totalStudyMinutes counter

The neurons-tw leaderboard upsert payload (sent by `neurons-leaderboard.ts` to the Cloudflare Worker's `/leaderboard/upsert` endpoint and persisted to D1 column `total_study_min`) SHALL reflect the real `meta['totalStudyMinutes']` counter accrued by the `reading-timer` service. The previously-shipped placeholder value of hardcoded `0` SHALL be replaced with the actual counter read via the existing `readTotalStudyMinutes()` helper.

The Worker D1 schema, KV cron snapshot columns, and leaderboard UI rendering SHALL NOT change — the column has always accepted this field but the client was sending 0. After this requirement is implemented, the column SHALL begin reflecting non-zero values for any user with active reading-timer sessions.

#### Scenario: Leaderboard push reads totalStudyMinutes

- **GIVEN** a user has accrued 42 minutes via the reading-timer (i.e., `meta['totalStudyMinutes'] === 42`)
- **WHEN** the leaderboard sync runs (e.g., on `onPushComplete` after a sync session)
- **THEN** the POST body to `/leaderboard/upsert` SHALL include `total_study_min: 42`
- **AND** the D1 row for that user SHALL be updated to `total_study_min = 42` (LWW per `updated_at`)
- **AND** the next leaderboard KV snapshot cron SHALL surface that value in the relevant `top100` filter (if applicable)

#### Scenario: First-time user with zero accrual still pushes zero (no regression)

- **GIVEN** a fresh user who has never started the reading-timer (i.e., `meta['totalStudyMinutes']` undefined or 0)
- **WHEN** the leaderboard sync runs
- **THEN** the POST body SHALL include `total_study_min: 0`
- **AND** no exception SHALL be raised due to missing meta key
