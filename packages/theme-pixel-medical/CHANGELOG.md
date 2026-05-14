# Changelog — @study-rpg/theme-pixel-medical

All notable changes to this theme pack. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semver](https://semver.org/).

## [Unreleased]

### Changed

- **BREAKING (pre-1.0)**: All 20 starter item `id` / `name` / `flavor` renamed from generic medical-school props (聽診器 / 白袍 / 學長手寫筆記 / 希波克拉底護身符 …) to medical proper nouns extracted from the 藥理學 past-exam corpus.
  - `id` format now `item:<kebab-medical-term>-<rarity>` (e.g. `item:aspirin-r`, `item:cytochrome-p450-ur`)
  - `slot`, `rarity`, `effects`, `artKey` remain unchanged → loot distribution invariance preserved (10k-roll smoke test confirms ±2σ vs target 60/25/10/4/1)
  - `Item` interface in `@study-rpg/core` gained optional `sourceQuestionIds?: string[]` (non-breaking) recording which questions seeded each name
  - Each item carries `sourceQuestionIds` for educational / debug inspection (not displayed in UI)

### Added

- `scripts/extract-pharma-terms.ts` — deterministic build-time extractor that surfaces drug / receptor / mechanism / drug-class / adverse-effect terms from `content-medexam-tw`'s `questions.json`
- `src/items.terms.json` — extracted candidate dictionary with frequency + source question IDs (commit-tracked for reproducibility)
- `package.json` script: `pnpm --filter @study-rpg/theme-pixel-medical extract-terms`

### Migration

For end-users (deployed apps): no migration needed; IndexedDB is empty at this stage (no production deployment yet).

For forks: any custom `Item.id` reference in code (UI badges, savefiles) must be updated. New ids:

| Slot | Rarity | New id |
|---|---|---|
| head | N | `item:alpha1-adrenergic-n` |
| head | R | `item:nmda-receptor-r` |
| head | SR | `item:gaba-a-receptor-sr` |
| body | N | `item:nsaid-n` |
| body | R | `item:beta-blocker-r` |
| body | SR | `item:statin-sr` |
| weapon | N×2 | `item:acetaminophen-n`, `item:atropine-n` |
| weapon | R×2 | `item:aspirin-r`, `item:morphine-r` |
| weapon | SR | `item:warfarin-sr` |
| charm | N×2 | `item:cox-2-n`, `item:partial-agonist-n` |
| charm | R | `item:hmg-coa-reductase-r` |
| charm | SR | `item:cyclooxygenase-sr` |
| charm | SSR | `item:digoxin-toxicity-ssr` |
| charm | UR | `item:cytochrome-p450-ur` |
| consumable | N×2 | `item:first-pass-effect-n`, `item:tolerance-n` |
| consumable | R | `item:serotonin-syndrome-r` |

Reference: OpenSpec change `rename-items-to-medical-terms` (2026-05-14).
