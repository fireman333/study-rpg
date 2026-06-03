## 1. CSS — 角標樣式（桌機限定）

- [x] 1.1 在 `apps/neurons-tw/src/styles.css` 新增 `.quiz-hotkey-badge` 規則：預設 `display:none`；於 `@media (hover: hover) and (pointer: fine)` 內 `display:inline-block; position:absolute; left:6px; bottom:3px; font-size:11px; line-height:1; opacity:.55; pointer-events:none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;`（color 用 neurons 既有 ink 深色，不引用二階的 `--frame-dark` var）。
- [x] 1.2 加 `.quiz-hotkey-badge--enter` 變體（`font-size:12px; opacity:.6`）給 `↵`。
- [x] 1.3 對照 `apps/medexam2-hospital-tw/src/styles.css:6396` 確認數值/行為一致（僅顏色 var 在地化）。

## 2. QuizModal — host 按鈕補 `position: relative`

- [x] 2.1 在 `optionCardStyle` 加 `position: 'relative'`（選項按鈕）。
- [x] 2.2 在 `primaryBtnStyle`（下一題）加 `position: 'relative'`。
- [x] 2.3 在 `bookmarkBtnStyle` + `bookmarkBtnActiveStyle` 加 `position: 'relative'`。
- [x] 2.4 在 `flagEasyStyle` + `flagEasyActiveStyle` + `flagGuessedStyle` + `flagGuessedActiveStyle` 加 `position: 'relative'`。

## 3. QuizModal — render 角標 span（phase-aware，aria-hidden）

- [x] 3.1 選項按鈕（QuizModal.tsx 選項 `.map` 內，約 :318）：當 `!revealed` 時，於 `<button>` 內加 `<span className="quiz-hotkey-badge" aria-hidden>{['₁','₂','₃','₄'][index]}</span>`（用選項在 `optionKeys` 的 index）。`revealed` 時不渲染。
- [x] 3.2 下一題按鈕（約 :387，僅 `revealed` 才 render）：加 `<span className="quiz-hotkey-badge quiz-hotkey-badge--enter" aria-hidden>↵</span>`。
- [x] 3.3 `BookmarkButton`（:437）：新增 `hotkeyVisible: boolean` prop；prop 為 true 時於按鈕內加 `<span className="quiz-hotkey-badge" aria-hidden>₁</span>`。在 QuizModal footer 呼叫處（:380）傳 `hotkeyVisible={revealed}`（只有 answered phase 的 `1` 才是收藏）。
- [x] 3.4 `FlagButtons`（:406，僅 `revealed` 才 render）：太簡單按鈕加 `<span className="quiz-hotkey-badge" aria-hidden>₂</span>`、我亂猜按鈕加 `<span className="quiz-hotkey-badge" aria-hidden>₃</span>`。
- [x] 3.5 `結束` 按鈕**不加**角標（無快捷鍵）。
- [x] 3.6 對照 `useQuizHotkeys.ts` dispatcher 真值表逐一確認角標鍵位正確（asking: 1–4 highlight；answered: 1 收藏 / 2 易 / 3 猜 / Enter 下一題）。

## 4. 驗證（不動鍵盤邏輯 / 不動 schema / sync）

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw typecheck` 通過（新增 prop 不破型別）。
- [x] 4.2 確認 git diff 僅觸及 `QuizModal.tsx` + `styles.css`，無 `db.ts` / `sync/` / `bundles.ts` 改動。
- [x] 4.3 Chrome MCP 桌機視窗 smoke：開 quiz → asking phase 看到選項 `₁–₄`、answered phase 看到收藏 `₁` / ✨`₂` / 🤔`₃` / 下一題 `↵`；角標位於左下、不擋選項字母與文字；console 無 error。
- [x] 4.4 觸控模擬（RWD probe / `pointer:coarse`）確認角標隱藏。
- [x] 4.5 實按鍵驗證：asking phase 按 1–4 highlight、Enter 送出；answered phase 按 1/2/3 真的 toggle 收藏/易/猜、Enter 下一題（確認角標與行為一致）。
