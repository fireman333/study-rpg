## Context

Three surfaces render a question in neurons-tw: `QuizModal` (interactive answering — homepage 答題 / 錯題出征 / replay), `QuestionBankPage.QuestionEntry` (read-only browse), and `BookmarksPage` (収藏 review). The leaf components (`QuestionFigure`, `Explanation`, `LocalPdfButton`, `PrecedingContext`) were already single-source, but the read-only *composition* was duplicated between 題庫 and 收藏, and 收藏 only showed a truncated stem preview. Codex was consulted on the boundary (see Decisions) and agreed: keep the interactive molecule separate, extract one shared read-only card.

## Goals / Non-Goals

**Goals:**
- One shared read-only `QuestionReviewCard` consumed by both 題庫 and 收藏.
- All three 收藏 tabs show the full question inline (題目 + 圖片 + 詳解 + 原始詳解 PDF).
- 收藏 row head = verbatim 題號; 手動收藏 drops 重新作答; 科目/年份 filters gain a 「全部」 chip.
- Keep `QuizModal` (interactive, state-mutating) as a separate component.

**Non-Goals:**
- No merge of `QuizModal` into the shared card (different responsibility — it writes SRS / history / energy / achievements).
- No Dexie / R2 / Worker / sync changes — purely presentational.
- No "related-questions" system beyond reusing the existing self-hiding `PrecedingContext`.

## Decisions

- **Separate interactive from read-only.** `QuizModal` stays its own molecule; `QuestionReviewCard` is read-only and side-effect-free. Alternative (one mega-component with a `mode` prop) was rejected — it would entangle display logic with state mutation and grow unboundedly.
- **`QuestionReviewCard` API is deliberately small**: `question`, optional `header` slot (surface-specific chrome), `showFigure` (default true). No `mode`/config system. 題庫 passes its 題號+🐞回報+tags header; 収藏 passes its 題號+flags+time header.
- **題庫 now shows figures.** Delegating QuestionEntry's body to the shared card means 題庫 gains the figure it previously omitted — accepted as a strict improvement (a question bank showing the image is the expected behavior), confirmed with the owner.
- **承上題 inline, not behind a button.** `PrecedingContext` already self-detects continuation questions, resolves + shows the preceding stem/figure, and renders nothing (zero cost) for ordinary questions. Rendering it inline *resolves* the "standalone 承上題 lacks context" concern rather than hiding it behind an extra interaction.
- **題號 replaces 科目/年份 badges in 收藏.** The question id already encodes 年-次-冊-科目-題號, so a single verbatim 題號 head is strictly more informative than the two separate badges and aligns with the `QuizModal` 題號-above-stem head.

## Risks / Trade-offs

- [題庫 figure adds image loads to a paginated list] → figures are lazy `<img>` and the page already paginates (50/page); negligible.
- [Losing the color-coded 科目 badge in 収藏] → the 題號 still names the subject (e.g. `…-解剖學-Q5`); owner explicitly requested this.
- [Spec drift was already present] → this change's whole purpose is to MODIFY `neurons-wrong-answer-list` so the spec matches the shipped behavior; verified there is no other spec pinning the changed surfaces.

## Migration Plan

None — no data shape changes. Deploy is a normal build; rollback is a code revert. The change is already implemented and verified (tsc clean, 755 vitest pass, Chrome MCP end-to-end) prior to this spec sync.
