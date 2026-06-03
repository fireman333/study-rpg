## Context

`useQuizHotkeys`（`apps/neurons-tw/src/lib/hooks/useQuizHotkeys.ts`）是從二階 `use-quiz-hotkeys.ts` 移植來的兩階段 hook，dispatcher 為 pure function，是快捷鍵行為的**單一真實來源**：

- **Asking phase**（`picked === null`）：`1`–`4` → highlight 對應選項；`Enter` → 送出 highlighted 選項。
- **Answered phase**（`picked !== null`）：`1` → toggle 收藏；`2` → toggle ✨ 太簡單；`3` → toggle 🤔 我亂猜；`Enter`/`Space` → 下一題。
- 兩階段共用捲動鍵（`Space` / `Shift+Space` / `↓↑` / `Home` / `End`）。

QuizModal 已把三個 toggle callback（`handleToggleBookmark` / `handleToggleEasy` / `handleToggleGuessed`，QuizModal.tsx:127–141）真正 wire 進 hook（非 noop），且 `BookmarkButton`(:437) / `FlagButtons`(:406) 的 `aria-label`/`title` 已標註 `(1)`/`(2)`/`(3)`。缺的只有**畫面上的視覺角標**。

二階參考實作：`apps/medexam2-hospital-tw/src/styles.css:6396` 的 `.quiz-hotkey-badge`（`position:absolute; left:6px; bottom:3px; font-size:11px; opacity:.55; monospace`，桌機限定 media query）+ QuizModal 內各按鈕的 `<span class="quiz-hotkey-badge" aria-hidden>` 角標。

neurons QuizModal 用 inline `React.CSSProperties`（無 quiz 專屬 CSS class），但 app 仍有一份 `styles.css`（~267 行 responsive/animation）。

## Goals / Non-Goals

**Goals:**
- 滑鼠（桌機）使用者能一眼看到每顆按鈕對應的快捷鍵。
- 角標所示的鍵 = 該 phase 下 dispatcher 實際執行的動作（不得誤導）。
- 觸控裝置不顯示任何角標（無實體鍵盤）。
- 純展示層；零行為 / schema / sync 改動。

**Non-Goals:**
- 不改 `useQuizHotkeys` 的鍵位邏輯或 dispatcher。
- 不重做 / 不移除公告 banner（`QuizHotkeysAnnouncementBanner` 已 ship 在 OverviewPage）。
- 不為 `結束` 按鈕加角標（無對應快捷鍵）。
- 不引入新的 keyboard hint（例如為捲動鍵加角標）—— 只標可點擊的主要動作。

## Decisions

### D1 — Badges are phase-aware（單一真實來源 = dispatcher）
角標顯示與否綁定 `revealed`（= `picked !== null`），對齊 dispatcher 的兩階段語意，避免「按了沒反應」的騙人提示：

| 按鈕 | 角標 | 顯示條件 | 理由（dispatcher 行為） |
|---|---|---|---|
| 4 顆選項 | `₁ ₂ ₃ ₄`（依 index） | `!revealed`（asking） | asking 時 1–4 = highlight；answered 時選項已 disabled 且 1/2/3 改作他用 |
| 收藏 BookmarkButton | `₁` | `revealed`（answered） | 僅 answered phase 的 `1` = 收藏；asking phase 的 `1` = highlight 選項 A |
| 太簡單 FlagButton | `₂` | 隨元件（僅 `revealed` render） | answered phase `2` = toggle easy |
| 我亂猜 FlagButton | `₃` | 隨元件（僅 `revealed` render） | answered phase `3` = toggle guessed |
| 下一題 | `↵`（`--enter` 變體） | `revealed`（僅此時 render） | answered phase `Enter` = advance |

> 注意：BookmarkButton 在兩 phase 都 render，但 `₁` 角標只在 answered phase 出現 → 需傳一個 `hotkeyVisible: boolean` prop。

### D2 — 桌機限定，鏡像二階 media query
角標用 `.quiz-hotkey-badge` CSS class（加進 neurons `styles.css`），預設 `display:none`，僅在 `@media (hover: hover) and (pointer: fine)` 內 `display:inline-block` + absolute 定位。直接沿用二階的數值（`left:6px; bottom:3px; font-size:11px; opacity:.55; line-height:1; pointer-events:none; font-family: ui-monospace,…`）與 `--enter` 變體（`font-size:12px; opacity:.6`）。color 用 neurons 既有 ink 色，不硬抄二階的 `--frame-dark` CSS var（neurons 不一定有該 var）。

### D3 — Host 按鈕補 `position: relative`（inline style）
因為角標是 `position:absolute`，每個 host 按鈕需 `position:relative` 才能正確定位。neurons 按鈕用 inline style，故在對應 style 物件（`optionCardStyle` / `primaryBtnStyle` / `bookmarkBtnStyle`+active / `flagEasyStyle`+active / `flagGuessedStyle`+active）加 `position: 'relative'`。角標 span 本身用 `className="quiz-hotkey-badge"`（吃 media query），不用 inline（否則無法桌機限定）。

### D4 — 角標為 `aria-hidden`
螢幕報讀已由既有 `aria-label`/`title`（已含 `(1)`/`(2)`/`(3)`）負責；角標是純視覺冗餘，標 `aria-hidden` 避免重複報讀，與二階一致。下標字元用 Unicode `₁`(U+2081) `₂` `₃` `₄`，Enter 用 `↵`(U+21B5)。

## Risks / Trade-offs

- **角標與 dispatcher 真值表 drift**：未來若改 `useQuizHotkeys` 鍵位，角標會說謊。Mitigation：D1 表格寫進 spec scenario，並在 tasks 要求「對照 dispatcher 確認」；長期單一真實來源仍是 hook，角標是手動鏡像（可接受，因鍵位極少動）。
- **選項 highlight 樣式衝突**：角標 `position:absolute` 疊在選項按鈕上，需確認不擋 `optionKeyStyle`（A/B/C/D 字母，通常在左上或行內）與選項文字。Mitigation：角標放**左下** `bottom:3px`，選項字母與文字在上方/行內，視覺不重疊；apply 時用 Chrome MCP 桌機視窗驗一次。
- **觸控誤判**：`@media (hover:hover) and (pointer:fine)` 在少數混合裝置（觸控筆電）可能仍顯示角標——無害（有鍵盤就能用），與二階行為一致，不另處理。
- 風險等級整體 **P5 拉完了→低**：純 cosmetic、底層行為已驗證、有二階成熟前例。
