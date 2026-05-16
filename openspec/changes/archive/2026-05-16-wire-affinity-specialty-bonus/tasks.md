## 1. Engine / lib changes

- [x] 1.1 Edit `apps/medexam2-hospital-tw/src/lib/mastery.ts` — `recordCorrectAnswer` transaction 內 `db.affinity.put(... correctCount + 1 ...)` 改為 `+ multiplier`（復用既有 `multiplier` 變數，零新 import、零新 helper）
- [x] 1.2 更新 `recordCorrectAnswer` 上方 jsdoc：從「Affinity ... unaffected by the multiplier」改為「Affinity ... also multiplied by the specialty-match multiplier (per affinity-specialty-bonus spec)」

## 2. UI changes

- [x] 2.1 Edit `apps/medexam2-hospital-tw/src/components/RecruitmentBanner.tsx` line 45 `{affinity} / {threshold}` 改為 `{Math.round(affinity * 10) / 10} / {threshold}`（整數仍顯示整數、float 限 1 decimal）
- [x] 2.2 確認 `aria-label` / accessible 文字（若有）也用 rounded 值（避免 screen reader 報 "9.85"）— 無 aria-label；bundled: `missing` 改 `Math.ceil` 讓「再答對 N 題」+ roll button title 永遠顯示整數 (避免 "再答對 6.5 題" UX)

## 3. Typecheck & build

- [x] 3.1 跑 `pnpm -r typecheck`、確認 0 error
- [x] 3.2 跑 `pnpm --filter @study-rpg/medexam2-hospital-tw build`、確認 production bundle 成功 (422 KB / 139 KB gzip)

## 4. Chrome MCP smoke test（preflight 用 `list_connected_browsers` 確認連線）

> 走 Vite dev module import 直接呼叫 `recordCorrectAnswer`（比 UI 點 quiz 快）；UI 顯示透過 Dexie `liveQuery` reactive 驗。所有合成 questionHistory rows + 內科 affinity test 增量已在 4.7 後 cleanup 回原狀。
>
> 真實 threshold 是 內科=66、神經內科=15、外科=58（不是 10）；4.6 unlock 透過 4.7 直接寫 14.5 / 15.0001 驗 boundary，等價 unlock 行為（threshold 是 integer、float comparison 走 JS native）。

- [x] 4.1 P1 same-subject 內科 → affinity 3 → 4.5 (`+1.5` ✓)
- [x] 4.2 P5 same-subject 內科 → affinity 4.5 → 5.55 (`+1.05` ✓，IEEE-754 floor 5.549… 可接受)
- [x] 4.3 cross-subject (外科 P5 partner, 內科 quiz) → affinity 5.55 → 6.55 (`+1.0 exactly` ✓)
- [x] 4.4 no partner 內科 → affinity 6.55 → 7.55 (`+1.0 exactly` ✓)
- [x] 4.5 wrong answer (recordWrongAnswer)、無 partner 參數 → affinity 7.55 → 7.55 (`delta = 0` ✓)
- [x] 4.6 boundary: affinity 15.0001 vs threshold 15 → banner `banner--unlocked` ✓（替代真實累積 60+ correct）
- [x] 4.7 邊界 sanity:
  - 9.85 → 顯示 "9.9 / 15" (smart decimal rounding ✓)
  - 14.5 → 顯示 "14.5 / 15"、locked ✓
  - 15.0001 → 顯示 "15 / 15"、unlocked ✓
  - 內科 7.55 → 顯示 "7.6 / 66"、`再答對 59 題` (Math.ceil ✓)
  - 整數 affinity (0 / 3 / 7) → 不加 `.0` ✓
- [x] 4.8 Console clean: 只有 pre-existing react-router future-flag warnings (×4)、無 affinity-相關 error

## 5. Verify gates

- [x] 5.1 `/opsx:verify` — 4-dim 全綠 (Completeness 15/22 tasks done、Correctness 6/6 reqs + 14/14 scenarios verified、Coherence 5/5 decisions followed)；1 SUGGESTION：把 bundled `Math.ceil(missing)` 記入 6.1 decisions log
- [x] 5.2 `/verify` — skip nested invocation；4-line diff、smoke + typecheck + build + opsx:verify 已涵蓋；`/simplify` 對 4-line additive diff 無 op

## 6. Decisions log

- [x] 6.1 寫一條 `openspec/decisions/2026-05-16.md` entry — "12:36 — wire-affinity-specialty-bonus apply complete"；含 implementation diff 摘要、scope confirm、6/6 reqs scenario coverage table、bundled Math.ceil(missing) UX fix audit、tunable constants location、gameplay 影響預估、follow-up candidates

## 7. Archive & commit gates

- [x] 7.1 跑 `/opsx:archive wire-affinity-specialty-bonus`（會 sync delta 進 `openspec/specs/affinity-specialty-bonus/spec.md`）— **needs explicit user confirm per Curator rule**
- [x] 7.2 auto-git commit（template: `spec(archive): merge wire-affinity-specialty-bonus — affinity 同步套 rarity-tiered specialty multiplier`）— **needs explicit user confirm per Curator rule**
- [x] 7.3 **不**馬上 merge track-m2 → main；handoff 提醒下次 session 看 dogfood telemetry 再決定
