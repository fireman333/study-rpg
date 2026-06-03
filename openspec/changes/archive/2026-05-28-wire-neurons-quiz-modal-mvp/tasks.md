## 1. QuizModal component (~30 min)

- [x] 1.1 Create `apps/neurons-tw/src/components/QuizModal.tsx`
- [x] 1.2 Props interface: `{ pool: Question[]; onClose: () => void }` (subjectFilter deferred to follow-up; full pool for v1)
- [x] 1.3 Filter pool at modal mount: exclude `hasOptionImages === true`
- [x] 1.4 State: `idx` (running index into shuffled pool), `answeredIds: Set<QuestionId>`, `picked: string | null`, `pool: Question[]` (in-session shuffle)
- [x] 1.5 Render single question per render: stem + 4 options as 2×2 grid (≥ 600 px) / 1×4 stack (< 600 px)
- [x] 1.6 Click handler: set `picked`, compute `correct = picked === q.answer || q.disputed`, invoke `recordCorrectAnswer(q.subject)` if correct else `recordIncorrectAnswer(q.subject)`
- [x] 1.7 Reveal state: color borders (green = correct answer, red = wrong selection, blue = correct selection), show explanation below options + 「下一題」 button
- [x] 1.8 If disputed: prepend 「⚠️ 此題為送分題，任何選項皆計為答對」 above explanation
- [x] 1.9 「下一題」 → advance `idx`, reset `picked`, pick next non-answered question from shuffled pool
- [x] 1.10 「結束」 / Esc / backdrop click → `onClose()`
- [x] 1.11 Pool exhausted (`answeredIds.size === pool.length`): show 「題庫已答完」 + 「結束」 only
- [x] 1.12 Add `role="dialog"` + `aria-modal="true"` + `aria-label` for a11y

## 2. Wire entry button into OverviewPage (~10 min)

- [x] 2.1 Add `quizOpen: boolean` state to `apps/neurons-tw/src/routes/OverviewPage.tsx`
- [x] 2.2 Add prominent 「🎯 開始答題」 button near the top of the page (above 內容總覽 section)
- [x] 2.3 Conditionally render `<QuizModal pool={pack.questions} onClose={() => setQuizOpen(false)} />` when quizOpen is true
- [x] 2.4 Style button matches existing visual language (the gold/border style used elsewhere in app)

## 3. Verify (~15 min)

- [x] 3.1 `pnpm --filter @study-rpg/neurons-tw typecheck` ✅
- [x] 3.2 `pnpm --filter @study-rpg/neurons-tw build` ✅
- [x] 3.3 Dev smoke: open `/`, click 開始答題, verify modal opens with a question
- [x] 3.4 Chrome MCP smoke: click an option, verify reveal state shows correct/wrong + explanation; click 下一題, verify next question loads
- [x] 3.5 Chrome MCP verify connectome impact: open `/connectome` BEFORE answering, note synapse count; answer 5 correct on family A then 5 correct on family B via the quiz; reopen `/connectome` and verify synapse formed between A-B
- [x] 3.6 Chrome MCP RWD probe per `chrome_mcp_rwd_probe.md` class-override technique: verify modal layout at 360 / 414 / 600 / 1024 px widths
- [x] 3.7 Verify disputed-question handling: find a disputed question in pool (if any), test that any pick shows the auto-correct banner
- [x] 3.8 Verify exit mid-quiz: answer 2 questions, click 結束, reopen modal, verify those 2 answers stayed recorded (synapse counter didn't roll back)
- [x] 3.9 `openspec validate wire-neurons-quiz-modal-mvp --strict` ✅

## 4. Archive (~5 min)

- [ ] 4.1 Move change to archive + sync delta to main neurons-mode spec
- [ ] 4.2 `openspec validate --all --strict` confirms specs valid post-merge
- [ ] 4.3 Explicit file-by-file `git add`; commit with `spec(archive): merge wire-neurons-quiz-modal-mvp — MVP quiz UI presents real exam questions`

**Estimated total wall time**: ~60-75 min

## Acceptance criteria

- [ ] `apps/neurons-tw/src/components/QuizModal.tsx` exists and renders one question at a time
- [x] Click handler routes through `recordCorrectAnswer` / `recordIncorrectAnswer` (Chrome MCP verified: synapse forms after 2-family 5-correct dogfood)
- [x] Reveal state colors are visually distinct (green correct / red wrong / blue selected-correct)
- [x] 「下一題」 advances to next non-answered random question
- [x] 「結束」 + Esc + backdrop click all close the modal
- [x] Disputed (送分題) handled with banner + auto-correct
- [x] `hasOptionImages === true` questions filtered out of pool
- [x] Mobile RWD verified at 360/414/600/1024 px (no horizontal overflow)
- [x] `typecheck` + `build` pass; `openspec validate --strict` passes
- [x] No new npm dependencies, no Dexie / R2 / sync schema changes
- [x] Entry button on OverviewPage uses existing visual style (not jarring new aesthetic)
