# Tasks — fix-quiz-partner-card-mobile-rwd

純 CSS 修改。零 JSX / TypeScript / DB 改動。修改範圍：`apps/medexam2-hospital-tw/src/styles.css` 單檔。

## 1. Apply mobile media query

- [x] **1.1** Open `apps/medexam2-hospital-tw/src/styles.css` 找到 `.quiz-modal__partner` 區塊（約 line 1598）。在 `.quiz-modal__partner-bonus` 規則結束後（約 line 1657 後）插入 `@media (max-width: 520px) { ... }` block。
- [x] **1.2** Media query 內含 4 條規則：
  - `.quiz-modal__partner { flex-wrap: wrap; }`
  - `.quiz-modal__partner-sprite, .quiz-modal__partner-info { order: 0; }` — Row 1
  - `.quiz-modal__partner-bonus, .quiz-modal__partner-picker { order: 1; }` — Row 2
  - `.quiz-modal__partner-bonus { margin-left: 66px; /* sprite 56 + gap 10 */ }`
  - `.quiz-modal__partner-picker { margin-left: 66px; }`
  - `.quiz-modal__partner-bonus + .quiz-modal__partner-picker { margin-left: 0; }` — 並排時 picker 不再縮排
  - `.quiz-modal__partner-picker { max-width: calc(100% - 66px); }` — 防 picker 自身溢出
- [x] **1.3** 加 inline comment 標註 `66px` 來源（`partner-sprite width 56 + container gap 10`），避免未來改 sprite 尺寸時失去同步線索。

## 2. Verify mobile (Chrome MCP)

- [x] **2.1** `pnpm --filter @study-rpg/medexam2-hospital-tw dev` 啟動 dev server。
- [x] **2.2** Chrome MCP preflight：`list_connected_browsers`，無 browser 則請使用者打開 extension。Browser 1 (macOS local) connected.
- [x] **2.3** Navigate `http://localhost:5175/study-rpg/hospital/`（5173 被佔，dev server 啟在 5175），window 縮到 500px（Chrome macOS min window width；仍 ≤ 520 觸發 mql520=true）。實際 4 種寬度測過：500 (mobile 邊緣) / 308 (forced via JS = 375 等效) / 1280 (desktop) / 768 (iPad portrait)。
- [x] **2.4** 開 QuizModal，DOM measurement 驗證四種組合：
  - **(d)** bonus + picker（內科 P5 partner, currentSubject=內科）：partner 縮到 308px → bonus 與 picker 兩者皆 row 2（top 185/183 > sprite.bottom 173），bonus.left=122 對齊 info，picker 緊接其右；無 overflow（picker.right 325 < partner.right 352）。name 不截斷。✅
  - **(c)** picker only（切到外科 P5, 跨科）：bonus 不渲染；picker.marginLeft=66px（sibling rule 未生效），picker.left=122 對齊 info，picker 在 row 2。name 不截斷。✅
  - **(a)** 與 **(b)** 走 CSS rule 條件渲染推斷（bonus 與 picker 各自為 conditional element；無對應 element 時相關 rule 自然不生效）— 不另開 DB 修改驗證，避免改動 user 真實 dogfood 狀態。
- [x] **2.5** Forced partner-card width 至 308px（≈ 375 viewport 下 modal 內部寬度）驗證 picker 不溢出（picker.right 325 < partner.right 352）。`max-width: calc(100% - 66px)` 規則生效。

## 3. Verify desktop unchanged

- [x] **3.1** Resize window 到 1280×800 → mql520=false, partner.flexWrap=nowrap, info.flexBasis=0% (回到 `flex:1` 預設), picker.marginLeft=0px, all elements 同 row。Mobile media query 規則完全不適用。✅
- [x] **3.2** Resize 到 768×1024 (iPad portrait) → mql520=false, single-row layout 維持。斷點 520 以下才觸發 wrap，768 不受影響。✅

## 4. Validate + archive

- [x] **4.1** `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — zero diagnostics ✅
- [x] **4.2** `openspec validate fix-quiz-partner-card-mobile-rwd --strict` — `Change 'fix-quiz-partner-card-mobile-rwd' is valid` ✅
- [x] **4.3** `/opsx:verify` — 0 CRITICAL, 1 WARNING（D4 design.md gap — 已補）, 1 SUGGESTION（comment path — accept as-is，archive 後自然準）。所有 spec scenarios 對應到 Chrome MCP live measurement。Ready for archive.
- [x] **4.4** Commit `2445b2e` on track-m2. Multi-agent git safety: explicit `git add` 7 files (1 modify + 6 add) — 5 parallel-session files left untouched in working tree.
- [x] **4.5** `/opsx:archive` with sync gate ✅ 新 capability `openspec/specs/quiz-partner-card-rwd/spec.md` 創建（81 行）；`openspec/specs/hospital-quiz/spec.md` 追加 ADDED requirement（+24 行，插在 "Quiz session SHALL require a roster doctor" 與 "Subject dropdown SHALL default to banner subject" 之間）；兩個 main specs `openspec validate --strict` 皆 clean；change folder 移到 `openspec/changes/archive/2026-05-19-fix-quiz-partner-card-mobile-rwd/`。
- [x] **4.6** 此 fix 不跨 一階／二階（只動 `medexam2-hospital-tw` styles.css），不需 cherry-pick 回 main；標準 dual-worktree merge 涵蓋（`track-m2` → `main` 由使用者統一管理）。
