## Tasks

- [x] **T1**: `apps/medexam-tw/src/App.tsx` — `useEffect` 載入 `getContentPack('/study-rpg/content/medexam-tw')` → state
- [x] **T2**: 新 component `apps/medexam-tw/src/components/QuizModal.tsx` — 5-Q cycle、option click → reveal → next → summary → close
- [x] **T3**: 替換 「✓ 模擬答對 / ✗ 模擬答錯」 stub buttons 為 「📚 開始答題」 → 開 QuizModal
- [x] **T4**: 移除 `answerQuiz(correct: boolean)` 的單次呼叫；改用 batched `onQuizComplete(results)`
- [x] **T5**: `styles.css` — quiz modal 樣式（option tile、reveal state correct/wrong、explanation block、summary panel）
- [x] **T6**: `pnpm -r typecheck`
- [x] **T7**: Chrome MCP smoke — open modal、答 1 對 + 1 錯、verify feedback、cycle through 5、verify batched reward + 3 rolls 等比例觸發
- [x] **T8**: `openspec validate --changes`
- [x] **T9**: `/opsx:verify`（需 Claude Code restart）
- [x] **T10**: `/opsx:archive add-real-quiz-flow`
- [x] **T11**: auto-git commit
