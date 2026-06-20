# Tasks — fix-neurons-mobile-explanation-overflow

## 1. Reproduce

- [x] 1.1 Playwright at 390px on `/bank`: confirmed 221px horizontal overflow; culprit = `explanationBodyStyle` `<div>` (`pre-wrap`, `overflow-wrap: normal`) with a long unbroken citation token

## 2. Wrap long tokens on every exam-content surface

- [x] 2.1 `QuestionBankPage.tsx`: `overflowWrap: 'anywhere'` on stem / option / explanation styles
- [x] 2.2 `QuizModal.tsx`: `overflowWrap: 'anywhere'` on stem / option / explanation styles
- [x] 2.3 `MockExamRunner.tsx`: `overflowWrap: 'anywhere'` on stem / option / explanation styles
- [x] 2.4 `PrecedingContext.tsx`: `overflowWrap: 'anywhere'` on the 承上題 stem text style
- [x] 2.5 `BookmarksPage.tsx`: `overflowWrap: 'anywhere'` on the stem-preview style

## 3. Verify

- [x] 3.1 Re-probe `/bank` at 390px → horizontal overflow 221px → **0px**
- [x] 3.2 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; 637 vitest green

## 4. Deploy (owner-gated)

- [ ] 4.1 Deploy the neurons app (Cloudflare Pages)
- [ ] 4.2 Spot-check a long-explanation question on a real phone — no horizontal page scroll
