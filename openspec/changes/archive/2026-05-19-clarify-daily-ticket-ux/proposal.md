## Why

Players reported the「每天免費招募券」 mechanic feels broken. Investigation: the mechanic IS implemented correctly — [`refreshDailyTickets()`](apps/medexam2-hospital-tw/src/db/schema.ts:668) runs on every App boot, granting `+1 ticket per UTC-day-equivalent` since `tickets.lastRefreshDay`, capped at `TICKET_CAP = 99` (locked by `recruitment-gacha` Req「Recruitment ticket SHALL be the sole gating resource」).

The bug is **UX feedback**, not behavior:

1. **HomePage gives zero affordance** that the daily +1 is incoming. The header shows `🎟️ N / 99` — same number this morning as last night, no countdown, no signal a free ticket is on its way. Players have no way to distinguish "feature broken" from "+1 already arrived, you just didn't notice".
2. **HelpMenu §recruitment copy is vague** — 「每天免費招募券」 doesn't quantify (`+1?  +5?  reset to baseline?`), doesn't mention the 99-ticket cap, and doesn't explain that the UTC-based epoch-day boundary means Taiwan users see the refresh tick at **local 08:00**, not local midnight.
3. **F1 explicitly skipped**: we considered migrating `refreshDailyTickets` to a local-timezone epoch but decided NOT to (avoid schema reinterpretation of existing `lastRefreshDay` rows + UTC is fine if we just *tell players the clock*). The whole change is communicate-better, not behave-differently.

## What Changes

- **F2 — HomePage ticket-counter inline countdown**: extend [`HomePage.tsx`](apps/medexam2-hospital-tw/src/pages/HomePage.tsx:122) `.ticket-counter` element to append `· 明日 08:00 +1` (or `· 今日 08:00 +1` if before today's Taiwan-local 08:00, or `· 已滿` if `available === 99`) and add a `title` attribute with the full explanation. Single helper `getNextDailyRefreshLabel()` computes the suffix from current Taiwan-local time. **Zero new DOM elements, zero new chips, zero new rows** — only ~10 chars of inline text inside the existing counter span.
- **F3 — HelpMenu §recruitment copy update**: rewrite the vague「每天免費招募券」 into 「每日台灣早上 08:00 +1 張免費招募券（持有上限 99）」 so the player has matching information across both surfaces.
- **Spec sub-clauses added** under `recruitment-gacha` Req「Recruitment ticket SHALL be the sole gating resource」 (UI affordance requirement) and `hospital-tutorial` Req「Always-available help menu」 (§recruitment copy must specify the cadence + cap + reset time explicitly).

## Capabilities

### New Capabilities

無 — pure UI clarification.

### Modified Capabilities

- `recruitment-gacha`: existing Req「Recruitment ticket SHALL be the sole gating resource for rolls」 gains a sub-clause requiring HomePage to surface the next-refresh time inline with the ticket counter so players can verify the daily-refresh mechanic is running.
- `hospital-tutorial`: existing Req「Always-available help menu SHALL list all mechanic explanations」 gains a sub-clause requiring the §recruitment section body to quantify the daily ticket grant (+1/day, cap 99, local 08:00 reset).

## Impact

- **Code files modified**:
  - `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` — append inline countdown suffix + `title` attr on `.ticket-counter`
  - `apps/medexam2-hospital-tw/src/lib/daily-ticket.ts` — new file with `getNextDailyRefreshLabel(now: Date, available: number, cap: number)` pure helper (testable in isolation)
  - `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` — rewrite §recruitment body[0] to include the new wording
- **Spec files modified**:
  - `openspec/specs/recruitment-gacha/spec.md` — sub-clause under existing Req
  - `openspec/specs/hospital-tutorial/spec.md` — sub-clause under existing Req
- **Zero schema change**: `refreshDailyTickets()` and `tickets.lastRefreshDay` untouched; we read the UTC epoch day in JS to format the display label, we don't change how the underlying refresh fires
- **Zero behavior change**: tickets still grant on UTC day boundary; cap still 99; just the display tells players when the next grant happens in Taiwan local time
- **Verification surface**: typecheck + Chrome MCP smoke (HomePage shows `🎟️ N / 99 · 明日 08:00 +1` chip; cap-99 edge case shows `已滿`; HelpMenu §recruitment shows updated wording)
