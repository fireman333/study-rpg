## Design

### Content pack loading

`apps/medexam-tw/src/App.tsx` at mount:
```tsx
const [content, setContent] = useState<ContentPack | null>(null)
useEffect(() => {
  getContentPack('/study-rpg/content/medexam-tw').then(setContent)
}, [])
```

Base URL `/study-rpg/content/medexam-tw` matches Vite's `base: '/study-rpg/'` + `public/content/medexam-tw/{questions,subjects,meta}.json`. While `content === null`, the quiz button is disabled with hint "載入題庫中..."

### QuizModal state machine

```
[selecting] (auto-select 5 random Q on open)
  └─→ [answering] (showing Q, options not yet clicked)
        └─→ [revealed] (option clicked, showing feedback + 詳解)
              ├─→ next Q → [answering]
              └─→ last Q done → [summary] (X/5 correct, "完成"按鈕)
                    └─→ close + reward
```

### Random Q selection

Plain `Math.random()` shuffle + slice(0, 5). No SRS bias (M2). Filter by subject if `subject` prop set (MVP: default to 藥理學 since it's the only subject in content right now).

### Reward integration

After modal close, App calls existing `answerQuiz(correct)` for each Q answered. Roll loot for correct answers only (matches current behavior). Don't batch — sequential calls so each correct triggers one roll + one reveal.

Actually — that would spam 5 reveals back-to-back. Better: batch reward computation in modal close (sum up XP / stat / roll counts) + single summary reveal. M2 polish; MVP just calls `answerQuiz` 5× and lets reveals queue (only the last persists on screen anyway since reveal state is single-slot).

Decision: **single batched reward call** post-modal-close to avoid reveal spam:
```ts
function onQuizComplete(results: Array<{ correct: boolean }>) {
  const correctCount = results.filter(r => r.correct).length
  setPlayer((p) => {
    let next = p
    for (const r of results) {
      const reward = r.correct ? REWARD.quizCorrect : REWARD.quizWrong
      const stats = 'stat' in reward && reward.stat
        ? addStat(next.stats, reward.stat.name, reward.stat.delta)
        : next.stats
      next = applyXp({ ...next, stats }, reward.xp).player
    }
    return next
  })
  for (let i = 0; i < correctCount; i++) {
    setTimeout(() => doRoll('quiz'), i * 150)
  }
}
```

### Explanation rendering

MVP: `<pre className="explanation">{question.explanation}</pre>` with `white-space: pre-wrap` to preserve linebreaks. The 陽明 詳解 are written with bullet points + paragraphs but no rich markdown — plain text rendering is readable. M2: add `marked` or `react-markdown` for proper rendering if needed.

### Attribution per question card

Per spec from `rename-items-to-medical-terms` rule (`yangming-attribution`): every question card UI must display 陽明 attribution. QuizModal footer shows `「詳解 © 陽明國考考古題小組」` + source URL link, persistent across all questions in the session.

### Decisions

#### 2026-05-14 — Batched reward vs per-Q reward

Per-Q would feel correct but visual spam (5 loot reveals in 5 seconds is messy). Batch + sequential timeouts (150ms apart) gives all rolls a chance to display while keeping each reveal individually consumable. Trade-off: stat deltas are "all at once" not per-Q, which loses the per-Q dopamine. Acceptable for MVP; revisit if dogfood feedback says it feels dead.

#### 2026-05-14 — No SRS in quiz selection (yet)

SRS table is defined in core (`db.ts`) but not yet populated with due cards (no real quiz history). MVP picks pure random. M2 adds SRS-due-first selection bias when wrong-answer Q populate the SRS table.

#### 2026-05-14 — Plain-text 詳解 rendering

Per design.md voice rules: 詳解 is from 陽明小組, written as plain text with newlines. `white-space: pre-wrap` preserves layout. Adding markdown renderer is M2 polish — adds 30 KB dep weight and risks XSS if not sanitized. Defer.
