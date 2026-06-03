## 1. Build HelpMenu component

- [x] 1.1 Create `apps/neurons-tw/src/components/HelpMenu.tsx` (~300 lines). Floating ❓ FAB top-right (z-index 900); click toggles a panel with `role="dialog" aria-modal="true"`.
- [x] 1.2 Internal state: `[isOpen, setIsOpen] = useState(false)` + `[expandedId, setExpandedId] = useState<string | null>(null)`. No persistence.
- [x] 1.3 Define `SECTIONS` const array (6 entries): each `{ id, icon, title, body: string[] }`. Body items render as `<p>` paragraphs inside `<details>` body.
- [x] 1.4 Section content (initial 6):
  - `hotkeys`: ⌨️ — full reference covering asking (1-4 highlight + Enter), answered (Enter/Space + 150ms cooldown), scroll (Space/Shift+Space/↓↑/Home/End), Esc, mouse-click bypass.
  - `variant-unlock`: 🧬 — AP threshold ladder per family, auto-pull on threshold, link to `/connectome`.
  - `synapse-formation`: 🔗 — 跨 family 同日各答對 5 題 → wire, weak→strong tier, 7 天 decay.
  - `dmn-draws`: 💎 — time-axis (30 min/draw, cap 2) + behavior-axis (variant slot unlock / synapse form / synapse strengthen, cap 3), 20-card closed cap at `/dmn`, 5 event kinds.
  - `leaderboard`: 🏆 — opt-in flow, nickname NFKC + lowercase, 6 filter columns, opt-out flow.
  - `bug-report`: 🩺 — link to `https://github.com/fireman333/study-rpg/issues/new` (`target="_blank" rel="noopener"`), one-liner: 「目前 neurons 尚未接 in-app 回報，請開 GitHub Issue 並標 `neurons` label。也歡迎 PR。」
- [x] 1.5 Accordion behavior: each section is a `<details>` element controlled by `expandedId === section.id`. Open via `onToggle` handler that sets `expandedId` to section.id IF user is opening; or `null` if user is closing (toggle).
- [x] 1.6 Close handlers: ✕ in header → `setIsOpen(false)`; backdrop click → `setIsOpen(false)`; `Esc` key listener via `useEffect` gated on `isOpen`.
- [x] 1.7 Styling: inline `<style>` block (mirrors `QuizHotkeysAnnouncementBanner` pattern) for the panel + backdrop + sections + FAB. Use neurons palette (cream / warm gold / brown). Mobile fallback in `@media (max-width: 600px)` repositions FAB to bottom-right + panel to bottom sheet.
- [x] 1.8 A11y: FAB `aria-label="開啟說明選單"`; close button `aria-label="關閉說明選單"`; panel `role="dialog" aria-modal="true" aria-label="說明選單"`; `<details>` + `<summary>` natively keyboard-accessible.

## 2. Wire HelpMenu into App

- [x] 2.1 In `apps/neurons-tw/src/App.tsx`, import `HelpMenu`.
- [x] 2.2 Render `<HelpMenu />` inside `<AuthProvider>` but OUTSIDE `<Routes>` so FAB persists across route changes. Place near other top-level overlays (e.g., next to `<DmnQuickReviewToast />` or `<AchievementUnlockModal />` mount points).

## 3. Bump announcement banner key v1 → v2

- [x] 3.1 In `apps/neurons-tw/src/components/QuizHotkeysAnnouncementBanner.tsx`, change `STORAGE_KEY` constant from `neurons-quiz-hotkeys-banner-dismissed-v1` to `neurons-quiz-hotkeys-banner-dismissed-v2`.
- [x] 3.2 Append HelpMenu reference to banner copy. New trailing sentence: `... <kbd>Esc</kbd> 隨時關閉。詳見右下 ❓ →「⌨️ 鍵盤快捷鍵」section。` (the ❓ is plain text, ⌨️ is plain text — both as visible emoji).
- [x] 3.3 Update inline-style comment in the banner component referencing v1 → v2 rationale (so a future maintainer reads it).

## 4. Type / lint / test

- [x] 4.1 Run `pnpm --filter @study-rpg/core build` (prebuild dep).
- [x] 4.2 Run `pnpm --filter @study-rpg/neurons-tw typecheck` → expect clean.
- [x] 4.3 Run `pnpm --filter @study-rpg/neurons-tw test` → expect 73 tests (unchanged — no new tests added per design D).

## 5. Chrome MCP smoke

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw dev` → open Overview at localhost.
- [x] 5.2 Confirm ❓ FAB renders at top-right corner (44×44px circular, warm gold border).
- [x] 5.3 Click FAB → panel opens with 6 sections rendered collapsed; `role="dialog"` present.
- [x] 5.4 Click section `hotkeys` → expands; body shows hotkey reference with `<kbd>` elements.
- [x] 5.5 Click section `dmn-draws` → `hotkeys` collapses, `dmn-draws` expands (single-expand verified).
- [x] 5.6 Click expanded `dmn-draws` summary again → collapses (toggle verified).
- [x] 5.7 Click backdrop → panel closes.
- [x] 5.8 Reopen panel → all sections collapsed (state did NOT persist).
- [x] 5.9 Press Esc with panel open → panel closes.
- [x] 5.10 Navigate to `/connectome` → FAB still visible at top-right (App-level mount working).
- [x] 5.11 Open a QuizModal via family card → click FAB while modal is open → HelpMenu opens over modal (z-index correct); close HelpMenu → QuizModal still present.
- [x] 5.12 Click bug-report section's GitHub link → opens new tab with target URL.
- [x] 5.13 Clear `neurons-quiz-hotkeys-banner-dismissed-v2` localStorage + reload → banner re-renders with new trailing「詳見右下 ❓ ...」 copy.
- [x] 5.14 RWD probe at 414 / 360 px → FAB moves to bottom-right; panel becomes bottom sheet (max-height 80vh).
- [x] 5.15 `read_console_messages onlyErrors=true` → no errors throughout the flow.

## 6. Validate + verify

- [x] 6.1 Run `openspec validate add-neurons-helpmenu --strict` → expect「valid」.

## 7. Archive + commit

- [ ] 7.1 Sync delta into main spec: ADD the new HelpMenu requirement + UPDATE the announcement banner requirement (v1→v2 + copy revision).
- [ ] 7.2 Move folder to archive: `mv openspec/changes/add-neurons-helpmenu openspec/changes/archive/2026-05-29-add-neurons-helpmenu`.
- [ ] 7.3 `openspec validate --all --strict` → expect 61+ specs all green.
- [ ] 7.4 Commit with template: `spec(archive): merge add-neurons-helpmenu — floating ❓ FAB + 6-section accordion panel for hotkeys / variants / synapse / DMN / leaderboard / bug-report, plus banner v1→v2 with HelpMenu reference`.
- [ ] 7.5 Push to `track-neurons` branch.
