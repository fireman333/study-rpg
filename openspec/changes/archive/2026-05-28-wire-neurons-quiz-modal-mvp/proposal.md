## Why

During the empty-state callout work today, I discovered neurons-tw has **no real quiz UI** — the entire user interaction surface is the `ConnectomeDebugPanel`'s 「+1 答對 / +5 答對 / +1 答錯」 click-simulation buttons. The 3505-question corpus shipped via `content-neurons-tw` is structurally available but **never presented to users**. This is the single biggest user-facing gap blocking genuine "完整上線" (ship-ready) status for the Threads public intro post.

Sibling apps `medexam-tw` (336-line QuizModal) and `medexam2-hospital-tw` (735-line QuizModal) both have full quiz UI, but they include features not needed for the MVP — SRS due-bias, quality modifiers (太簡單/我亂猜的), bug reports, bookmarks. For neurons-tw v1, we ship the **simplest viable** quiz UI that gets actual exam questions in front of users and routes their answers through the existing `recordCorrectAnswer` / `recordIncorrectAnswer` services (which already power synapse formation + variant gacha + DMN behavior-axis triggers + achievement unlocks).

## What Changes

- New component `apps/neurons-tw/src/components/QuizModal.tsx` (~150 lines, MVP scope):
  - Props: `pool: Question[]`, `subjectFilter?: SubjectId`, `onClose: () => void`
  - State: current question index, picked option key, finished flag
  - Renders one question at a time: stem + 4 options as clickable cards + reveal correct/wrong after selection + explanation snippet
  - On reveal: calls `recordCorrectAnswer(subjectId)` or `recordIncorrectAnswer(subjectId)` from `lib/services/connectome.ts`
  - Buttons: 「下一題」 to advance, 「結束」 to close
  - Filters out `hasOptionImages === true` questions (text-only options for MVP)
  - Treats `disputed === true` questions as auto-correct on any pick (送分題)
- New entry button on `OverviewPage`: 「🎯 開始答題」 — opens modal with full pool (no filter) by default
- Mount modal in App.tsx with state managed by overview page (open/close via React state lifted to App or local to overview)
- Connect to existing `pack.questions` (already loaded at app boot via content pack)

**不做 (MVP scope cuts)**：

- 不 ship SRS due-bias / dueQuestionIds prop (MVP picks random; SRS plumbing exists in core but wiring to UI is follow-up)
- 不 ship quality modifiers (太簡單 / 我亂猜的)
- 不 ship bug reports inside quiz
- 不 ship bookmarks
- 不 ship batch / review mode (single-question loop with 下一題 only)
- 不 ship per-family filter button from overview (just full-pool for now; per-family launch from connectome SVG = follow-up)
- 不 ship streak break-day soft toast in this modal (existing `streak.resetCurrentStreak` already fires from `recordIncorrectAnswer`)
- 不 ship 答題 sprite / animation polish (basic CSS only)
- 不 ship questions-with-images rendering (filter them out for MVP; ~6% of corpus per content-build skip stats)

## Capabilities

### New Capabilities

- 無

### Modified Capabilities

- `neurons-mode`: add one ADDED requirement (`### Requirement: neurons-tw SHALL surface a quiz UI that presents content-pack questions and routes answers through recordCorrectAnswer/recordIncorrectAnswer`). This locks the contract that exam questions appear in front of users (not just dev panel button-clicks) and the answer-recording wiring stays connected to the connectome/mastery/achievement/DMN-behavior-axis trigger chain.

## Impact

- **Code**:
  - `apps/neurons-tw/src/components/QuizModal.tsx` (new, ~150 lines)
  - `apps/neurons-tw/src/routes/OverviewPage.tsx` (modified: add 開始答題 button + modal state ~25 lines)
  - Possibly `apps/neurons-tw/src/App.tsx` (modified if modal state needs to live higher; deferred to apply decision)
- **APIs**: none new
- **Dependencies**: no new npm packages
- **Data**: no Dexie / R2 / event schema changes; reuses existing `recordCorrectAnswer` / `recordIncorrectAnswer` flow
- **Backwards compat**: pure feature addition; existing users see a new button on overview
- **Sync**: untouched (answers are recorded via existing service, which already touches synced tables)
- **Spec touched**: one ADDED requirement to `neurons-mode`
- **Bundle delta**: ~3-5 KB additional JS (negligible)
- **Deploy path**: standard `pnpm deploy:cf` + GH Actions
