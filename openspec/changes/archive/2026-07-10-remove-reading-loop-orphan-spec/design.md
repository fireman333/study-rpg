## Context

`openspec/specs/reading-loop/` 是 一階 app（`apps/medexam-tw`）遺留的 capability spec。一階 app 已於 2026-06-03 `remove-medexam-tw-and-promote-neurons` 整個刪除，但那次 change 只 sync 了 cloud-sync / build-tooling / deploy-pipeline 三個共用 infra spec，把純 一階 的 gameplay capability spec（reading-loop / engine-rewards / dorm-view / quiz-runner / mini-boss / mock-exam / mentor-daily / skill-tree / srs-queue / loot-mechanics / character-system / persistence / cosmetic-system …）留成 orphan。本 change 只處理其中與現行決策**主動衝突**的那一個：reading-loop。

衝突點：reading-loop 仍 normatively 要求 90s input-idle 自動暫停，而這條已於 `remove-neurons-reading-timer-idle-pause`（archived 2026-06-11）從 neurons 移除；live 規範現在在 `neurons-mode`。

## Goals / Non-Goals

**Goals:**
- 從 `openspec/specs/` 移除 orphaned 的 `reading-loop` capability，消除它與 `neurons-mode` 現行 reading-timer 決策的矛盾。
- 純 spec janitorial，零 code / build / test 影響。

**Non-Goals:**
- 不清理其餘 一階 orphan gameplay-spec 群（屬另一個更大的 follow-up change）。
- 不修 `engine-rewards/spec.md:5`、`dorm-view/spec.md:69` 兩處 dangling prose 引用（owner-confirmed narrow scope；這兩個 spec 本身也是 orphan）。
- 不動 dated decision log、不動 archived change、不動任何 code。

## Decisions

**Decision 1 — Delete（REMOVED delta），不 tombstone。**
- 查 precedent：`remove-medexam-tw-and-promote-neurons` 沒有用任何「retired / tombstone capability spec」pattern，它用 MODIFY delta 改共用 spec + 直接把純 一階 spec 留成 orphan。repo 內**沒有** capability-tombstone 先例。
- 替代方案（保留檔案 + 標 retired header）被否決：會憑空發明一個 repo 沒有的慣例，且留著一份明知矛盾的 normative spec 反而是更糟的雜訊。
- 結論：用 OpenSpec 原生 `## REMOVED Requirements` delta，archive 時 `openspec/specs/reading-loop/` 目錄自然被刪除——這就是 OpenSpec 移除 capability 的 canonical 做法。

**Decision 2 — Narrow scope（只刪 reading-loop）。**
- owner 已於 propose 前確認（AskUserQuestion「Change 範圍」→「只刪 reading-loop（最小，推薦）」）。
- engine-rewards / dorm-view 的 dangling 引用是 prose 不是 structural link，`openspec validate` 不會 fail；且兩個 referencing spec 本身都是 orphan，dangling ref 留在 dead spec 裡無害。整批 一階 orphan 清理另開 change。

## Risks / Trade-offs

- [刪除後 engine-rewards:5 / dorm-view:69 出現 dangling prose 引用] → 已知且 owner-accepted；`openspec validate` 仍 pass（驗證為 per-spec structural，不檢查 spec 間 prose 連結）。記錄在 proposal「已知殘留」+ 本 design Non-Goals，留待 一階 orphan-cluster 清理 change 一起收。
- [誤刪到 neurons 仍在用的東西] → 已 grep 確認 `readMs` / `READING_IDLE_TIMEOUT_MS` / `READING_TICK_MS` 在 `apps/` `packages/` 零命中；neurons reading-timer 規範獨立在 `neurons-mode`，與本 spec 無共用。風險為零。

## Migration Plan

1. `/opsx:apply` — 確認 spec-only，無 code task。
2. `/opsx:verify` — completeness / correctness / coherence 三維綠燈。
3. `/opsx:archive` —（含 sync gate）把 REMOVED delta 套進 main specs，`openspec/specs/reading-loop/` 被刪，live spec 92 → 91。
4. owner 確認後才 `git commit`（curator rule：no auto-commit）。

Rollback：archive 前任何階段可直接 `openspec archive` 不執行 / 或刪掉本 change 目錄即回復原狀；archive 後若要復原，`git revert` 該 commit 即把 `reading-loop/spec.md` 還原（純檔案層級，無資料遷移）。
