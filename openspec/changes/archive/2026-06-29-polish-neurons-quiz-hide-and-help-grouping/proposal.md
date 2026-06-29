# Make the expedition-band hide control real during 答題 + group the HelpMenu into categories

## Why

Two player-facing UX gaps in neurons-tw, reported by the owner on prod (2026-06-29):

**1. The "右上角可以隱藏遠征動畫" the Help menu promises does not exist during 答題.**
The HelpMenu「⚔️ 出征模式」section tells the player「覺得干擾可點動畫右上角的 ×」, and the spec (`neurons-maze-expedition` → "Opt-in, persisted show/hide") requires an **on-band minimize control (`×`)** that hides the band in BOTH contexts (homepage band + compact QuizModal band). The implementation does not match:
- The on-band hide button renders **only** when `onHide && !compact` ([MazeExpedition.tsx:323](apps/neurons-tw/src/components/MazeExpedition.tsx)), so the **compact QuizModal band never shows it** — there is no way to dismiss the marching animation while answering, on desktop or mobile. The compact band is also `pointer-events: none` + `aria-hidden`, so even a stray control could not be clicked.
- The homepage button renders the glyph **`−`** while both the spec and the Help copy say **`×`** — a copy/visual mismatch.
- The persisted `neurons:maze:expeditionHidden` preference is read **once at mount** in QuizModal (`useState(getExpeditionHidden)`) and in MazeGrid, with **no cross-component propagation**. Toggling「顯示/隱藏遠征動畫」in the Help menu while a quiz (or the homepage band) is open does nothing until a remount/reload — so the player's「開啟」path is silently broken in the moment they use it.

**2. The HelpMenu is「太複雜了」— 18 flat accordion sections with no grouping.**
The panel is a single flat list of 18 `<details>` sections (新手引導 → 重置此帳號進度). Scanning for "where do I read about X" is hard. The owner asked to group similar items into a few visually-distinct blocks (and suggested consulting Codex). Codex (gpt-5.5) proposed a 6-category「使用者旅程」grouping, adopted here.

## What Changes

App-only, neurons-tw only. No Dexie bump, no R2 bundle bump, no sync/economy change, no backend touch.

**Issue 1 — on-band hide control + live visibility:**
- Render the on-band minimize control (`×`) on the **compact QuizModal band too** (currently homepage-only), so the player can hide the animation while answering on desktop and mobile. On the compact band the control is the **single interactive element** (`pointer-events: auto`) while the rest of the band stays non-interactive (`pointer-events: none`) and never intercepts the answer UI; the control is keyboard-focusable with an `aria-label`.
- Standardize the on-band control as a **minimize `−`** (收合 / collapse, NOT a close `×`) on both bands, and align the spec + Help copy to `−`. (The original spec text wrote the glyph as `×` but described it as a *minimize* control; the owner wants the **collapse** semantic — restorable, more flexible — so `−` is the correct, consistent glyph. This resolves the prior spec-`×`-vs-code-`−` mismatch in the collapse direction.)
- When the band is collapsed, render a **slim in-place restore handle (`＋ 展開遠征動畫`)** where the band was, in BOTH contexts — so a collapse is always reversible on-screen and the player never has to open the Help menu to bring the band back (the `＋` mirrors the `−`, forming a minimize/restore pair). The Help-menu restore stays as a redundant convenience.
- Make the `neurons:maze:expeditionHidden` preference **reactive**: `expedition-visibility.ts` gains a tiny subscribe/notify (a listener set, no new dependency). MazeGrid + QuizModal subscribe, so a `−` collapse, a `＋` in-place restore, or the Help-menu restore takes effect **live across every currently-mounted band**, no reload.
- Align the「⚔️ 出征模式」Help copy so the `−` collapse is described as available during **閱讀 AND 答題**, the in-place `＋ 展開` restore handle is documented, and the in-menu toggle now genuinely live-updates an open band.

**Issue 2 — HelpMenu category grouping:**
- Introduce a **category layer** above the existing accordion sections: the 18 sections are rendered under **6 labeled category headers** (non-collapsible group labels), preserving every section's stable `id`, body copy, and the single-expand-one-section-at-a-time behavior. Grouping is presentational only — no section is removed or rewritten (titles kept; the conservative renames Codex suggested are out of scope for this change).
- Categories + membership (Codex「使用者旅程」ordering):
  1. **🧭 開始使用** — `onboarding`, `hotkeys`
  2. **📚 題目與複習** — `question-bank`, `bookmark`, `wrong-review`, `source-pdf`
  3. **⚔️ 出征與地圖修復** — `expedition`, `synapse-formation`, `connector-neuron`
  4. **🧬 收集與抽卡** — `variant-unlock`, `first-pull-second-lap`, `dmn-draws`
  5. **⚡ 強化與進度** — `acceleration`, `companion`, `achievements`, `leaderboard`
  6. **🩺 帳號與支援** — `bug-report`, `account-reset` (危險操作維持最後)

## Impact

- **Affected specs:**
  - `neurons-maze-expedition` — MODIFY "Decorative expedition animation band" (pointer-events carve-out for the on-band control) + "Opt-in, persisted show/hide" (on-band `−` collapse required in BOTH contexts; in-place `＋ 展開` restore handle when collapsed in BOTH contexts; reactive live propagation).
  - `neurons-mode` — MODIFY "Neurons-tw SHALL surface a global HelpMenu …" (add a category-grouping sub-requirement + scenario; single-expand behavior preserved).
- **Affected code (neurons-tw only):**
  - `apps/neurons-tw/src/components/MazeExpedition.tsx` — render the `−` on the compact band; glyph stays `−` (收合); pointer-events / a11y carve-out; new exported `ExpeditionRestoreStub` (the `＋ 展開` handle).
  - `apps/neurons-tw/src/lib/expedition-visibility.ts` — add subscribe/notify + `useExpeditionHidden`.
  - `apps/neurons-tw/src/components/QuizModal.tsx` — live visibility; on-band `−` collapse; in-place `＋` restore when collapsed.
  - `apps/neurons-tw/src/components/maze/MazeGrid.tsx` — live visibility; in-place `＋` restore when collapsed.
  - `apps/neurons-tw/src/components/HelpMenu.tsx` — render the category layer over `SECTIONS`; tweak the 出征模式 copy.
- **Behavior preserved:** default-shown; persisted across reload + both contexts; reduced-motion freeze; no always-visible toggle while the band is shown; companions still ride the band; all section ids/links unchanged.

## Out of Scope

- Renaming or merging HelpMenu sections (Codex suggested a few; deferred — owner asked for grouping, not a rewrite).
- Making category headers themselves collapsible (they are static labels; section-level single-expand is unchanged).
- An always-visible show/hide toggle chip *while the band is shown* (the band auto-plays; only the `−` collapse shows while visible). The in-place `＋ 展開` restore handle appears ONLY in the collapsed state — it is the restore affordance, not a persistent toggle.
- Any 二階 / standalone-repo change (this is the neurons monorepo worktree only).
