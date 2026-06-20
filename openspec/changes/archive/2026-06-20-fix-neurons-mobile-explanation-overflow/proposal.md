# Fix neurons mobile explanation overflow (大跑版)

## Why

A player reported that viewing 詳解 (explanations) on a phone causes 大跑版 —
the page breaks out horizontally. Reproduced with Playwright at 390px viewport
on `/bank` (the 題庫 page that lists every question with its explanation expanded
— the "看全部的詳解" surface): the document measured **611px wide vs a 390px
viewport (221px of horizontal overflow)**.

Root cause: exam-content text — `explanation` body, question `stem`, and
`option` text — is rendered with `whiteSpace: 'pre-wrap'` but no
`overflow-wrap`/`word-break`. With `word-break: normal`, CJK wraps fine but a
long unbroken Latin/bracket run (e.g. a citation like `Ref：[First Choice 醫學…`
or a long English term) does not break, so the text paints past its container
and cascades up — `<div>` → `<details>` → `<li>` → `<section>` → `<html>` —
forcing page-level horizontal scroll on phones.

The defect is shared by every surface that renders exam-content prose:
`QuizModal`, `MockExamRunner`, `QuestionBankPage`, `BookmarksPage`,
`PrecedingContext`.

## What Changes

- Add `overflowWrap: 'anywhere'` to the stem / option / explanation text styles
  across all five surfaces, so a long unbroken token breaks to fit the
  container instead of overflowing the page. CJK wrapping and desktop layout
  are unchanged (`anywhere` only breaks when a token cannot otherwise fit).

## Impact

- Affected specs: `neurons-responsive-layout` (ADDED: exam-content text wraps
  long tokens without horizontal overflow at mobile widths).
- Affected code (styles only, no logic/schema change):
  `apps/neurons-tw/src/routes/QuestionBankPage.tsx`,
  `apps/neurons-tw/src/components/QuizModal.tsx`,
  `apps/neurons-tw/src/components/MockExamRunner.tsx`,
  `apps/neurons-tw/src/components/PrecedingContext.tsx`,
  `apps/neurons-tw/src/routes/BookmarksPage.tsx`.
- Verified: `/bank` at 390px went **221px → 0px** horizontal overflow;
  typecheck clean; 637 vitest green.
- **Deploy**: neurons app only (Cloudflare Pages). No Worker / D1 / sync change.
- L2 UI fix.
