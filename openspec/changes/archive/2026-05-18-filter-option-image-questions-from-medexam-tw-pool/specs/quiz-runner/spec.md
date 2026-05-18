## ADDED Requirements

### Requirement: 一階 quiz pool SHALL exclude `hasOptionImages` questions

The 一階 host app SHALL filter out questions with `hasOptionImages === true` from the `content.questions` pool before passing it as the `pool` prop to `QuizModal`, `BossModal`, or `MentorDialog`. The filter SHALL be applied once at content-load time so all downstream pickers (subject-filtered random, boss subset, mentor backlog) consume a consistent playable pool.

The 一階 corpus currently contains zero `hasOptionImages: true` questions, so this requirement is forward-compatibility insurance: if a future upstream PDF-extractor regression causes 一階 questions to acquire option-image markers, the filter prevents them from reaching the quiz UI without further code change.

The 一階 build script SHALL also emit `hasOptionImages` on every `Question` (defaulting to `false` when no option contains the `_(圖片或缺失)_` marker), matching the schema field's role in `content-pack-contract` and the parallel 二階 build behavior in `medexam2-corpus-ingestion`.

#### Scenario: Filter runs at content load even when zero questions match

- **WHEN** `getContentPack('/study-rpg/content/medexam-tw')` resolves
- **THEN** the resolved pack's `questions` array SHALL be filtered to exclude `hasOptionImages === true`
- **AND** with the current corpus the filtered length SHALL equal the source length (no questions dropped)
- **AND** the filter SHALL run unconditionally — not gated on a feature flag — so a future regression cannot bypass it

#### Scenario: Filtered pool propagates to all pickers

- **WHEN** the filtered pool is threaded into `QuizModal pool={...}` / `BossModal pool={...}` / `MentorDialog` candidate selection
- **THEN** none of those components SHALL receive a question with `hasOptionImages === true`
- **AND** no per-component re-filter SHALL be required (single choke point at App.tsx)

#### Scenario: Build emits hasOptionImages field on every question

- **WHEN** `pnpm --filter @study-rpg/content-medexam-tw build` completes
- **THEN** every `Question` object in `dist/questions.json` SHALL include a `hasOptionImages` boolean field
- **AND** with the current corpus snapshot every value SHALL be `false`
- **AND** the `imported / skipped / total` counter SHALL remain unchanged from the prior-baseline (`3291 / 309 / 3600`)
