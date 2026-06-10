## Context

`BadgeSprite` is a block `<div>` (`flexShrink:0`) meant for a flex parent. `NicknameWithBadges` rendered it inside a plain inline `<span>`, so badges stacked vertically.

## Goals / Non-Goals

**Goals:** badges in one inline row next to the nickname; nickname still ellipsis-truncates.
**Non-Goals:** no BadgeSprite change; no nickname-only row change; no badge-count cap (left as a possible future polish if cells overflow).

## Decisions

**D1 — Conditional inline-flex container.** Only switch to `inline-flex` when `badges.length > 0` (nickname-only rows keep the existing `nicknameCellStyle` text-ellipsis behavior). The nickname text gets its own `overflow:hidden; textOverflow:ellipsis; minWidth:0` span so flex truncation works; badges (`flexShrink:0`) stay full-size. Alternative considered: make `BadgeSprite` `display:inline-block` — rejected, it's shared by 5 consumers and `flexShrink:0` signals a flex-parent contract.

## Risks / Trade-offs

- **[Many badges overflow a narrow cell]** → `maxWidth:100%` + the cell's `overflow:hidden` clips gracefully; the Worker CSV regex already caps badges at 6, so overflow is bounded. A "+N" cap is deferred (not needed at ≤6).
