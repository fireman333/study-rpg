## 1. Coverage-count derivation (pure)

- [x] 1.1 Add pure helper `countCoveredConcepts(cramBooks, consolidatedIds)` — counts distinct cram push items with ≥1 `sourceQuestionId` in `consolidatedIds`. Unit-tested (covered / uncovered / dedupe / empty).
- [x] 1.2 Build a self-contained `CramCalmView` subcomponent that mounts ONLY when the calm view is expanded (so `cram.json` loads lazily via `useCram` only on expand — homepage cost stays zero otherwise); it uses `useQuestionHistory()` → `consolidatedIds` → `countCoveredConcepts(cram.books, consolidatedIds)`.
- [x] 1.3 Define the two calm-view copy literals as exported constants (for the copy-guard test to import).

## 2. Calm view UI (DailyPrescriptionCard)

- [x] 2.1 Add a component-local expand toggle (device+session local `useState`, default collapsed) for the calm view, rendered only when `dayComplete`. The disclosure toggle is neutral (not an action-CTA).
- [x] 2.2 On expand, render `<CramCalmView>` showing the two locked literals — 「你已答對過 {M} 個高頻考點的題目。」(interpolating only the bare integer {M}) + closing line 「今晚可以停在這裡，讓連結慢慢固化。」. Do NOT restate completedDayCount or NG buds. Zero CTA / button / link inside the calm content.
- [x] 2.3 Keep pre-`dayComplete` behavior byte-identical (no calm view, no placeholder); keep the existing 考前 `<Link to="/cram">` reachable.

## 3. Tests

- [x] 3.1 Unit test `countCoveredConcepts` (covered ≥1 / all uncovered=0 / dedupe across subjects / empty inputs).
- [x] 3.2 Copy-guard test: assert the two exported calm-view literals are exactly the locked strings and contain no banned token (連續 / 掌握 / 覆蓋 / 覆蓋率 / % / 還差 / 剩下 / 還沒讀 / 保證 / 必中 / 今年一定考 / 會派上用場).

## 4. Verify

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw test` green (incl. new tests) + `pnpm -r typecheck` clean.
- [x] 4.2 Chrome MCP smoke: with a dayComplete account, expand the calm view on the homepage → shows the two locked lines, integer only, no denominator/CTA; with a non-complete day, calm view absent; confirm `cram.json` not fetched until expand.
- [x] 4.3 Honesty scan on the rendered calm view: no %/分母/保證/必中/覆蓋率/還差/剩下 present.
