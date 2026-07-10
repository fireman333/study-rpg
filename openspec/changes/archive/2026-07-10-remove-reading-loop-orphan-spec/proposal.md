## Why

`openspec/specs/reading-loop/spec.md` 是 一階 app（`apps/medexam-tw`）的遺留 capability spec，但該 app 已於 2026-06-03 `remove-medexam-tw-and-promote-neurons` 整個移除。那次 change 只 sync 了 3 個共用 infra spec（cloud-sync / build-tooling / deploy-pipeline），把純 一階 的 gameplay capability spec 留成 orphan，`reading-loop` 是其中之一。它現在有兩個問題：

1. **死引用**：整份 spec 圍繞 一階-only 識別字 `readMs`、`READING_IDLE_TIMEOUT_MS`、`READING_TICK_MS` 書寫，這些在現存 `apps/` 與 `packages/` 全域 grep **零命中**（對應 code 已隨 一階 app 一起刪除）。
2. **主動矛盾**：它仍 normatively 要求 90 秒 input-idle 自動暫停（`Requirement: Reading timer pauses on idle`），而這條設計剛於 `remove-neurons-reading-timer-idle-pause`（archived 2026-06-11）從 neurons reading-timer 移除。neurons 現行、live 的 reading-timer 規範在 `openspec/specs/neurons-mode/spec.md`（保留 tab-visibility 暫停、明文 no input-idle pause）。這份 orphan spec 因此跟現行產品決策直接打架。

`remove-neurons-reading-timer-idle-pause` 的 proposal 已明文「不碰 legacy `reading-loop` spec（一階遺留、app 已移除）」——本 change 就是收掉那個被刻意留下的尾巴。

## What Changes

- **REMOVE** capability `reading-loop`：以 `## REMOVED Requirements` delta 列出該 spec 全部 5 條 requirement，archive 時 `openspec/specs/reading-loop/` 整個目錄被刪除。
- **零 code 改動**：對應 reading-timer code 早在 一階 app 移除時就刪了；本 change 純 spec janitorial。
- **刻意不做（owner 已確認的 narrow scope）**：
  - 不動 `engine-rewards/spec.md:5` 與 `dorm-view/spec.md:69` 對 `reading-loop` 的 prose 引用——這兩個 spec 本身也是 orphaned 一階 spec（neurons 無 `/dorm` route；engine-rewards 的 consumer list 全是 一階 capability），dangling prose 引用無害（`openspec validate` 不檢查 spec 間 prose 連結，仍 pass），歸入未來「移除 一階 orphan gameplay-spec 群」的另一個 change。
  - 不編輯 dated decision log `openspec/decisions/2026-05-15.md`（append-only 歷史紀錄）。
  - 不碰任何 archived change。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `reading-loop`：整個 capability 被移除（全部 5 條 requirement 進 `## REMOVED Requirements`：Reading timer pauses when tab is hidden / Reading timer pauses on idle / Per-tick reward cap is enforced / Pause reason is observable in UI / Timer state is not externally mutable）。archive 後 `openspec/specs/reading-loop/spec.md` 不再存在。

## Impact

- **Specs**: 移除 `openspec/specs/reading-loop/`（archive 時生效）。live spec 總數 92 → 91。
- **Code**: 無。對應 一階 reading-timer code 已不存在於 repo（隨 `apps/medexam-tw` 一起移除）。neurons reading-timer（`apps/neurons-tw/src/lib/services/reading-timer.ts`）不受影響——它的規範在 `neurons-mode`，與本 spec 無關。
- **Build / typecheck / test**: 零影響（spec-only）。
- **已知殘留（本 change 不處理）**: `engine-rewards/spec.md:5`、`dorm-view/spec.md:69` 兩處 dangling prose 引用；屬更大的 一階 orphan-spec 清理範圍。
