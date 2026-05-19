## Context

Player report → audit → root cause = HomePage shows no feedback that the daily +1 ticket mechanic is running + HelpMenu copy is vague. Mechanic itself works per spec.

Existing facts (no change):
- `refreshDailyTickets()` fires on every App boot, computes `delta = currentEpochDay() - lastRefreshDay` where `currentEpochDay = Math.floor(Date.now() / 86400000)` (UTC-based), grants `min(delta, TICKET_CAP - available)` tickets
- `TICKET_CAP = 99`, `INITIAL_TICKETS = 10`
- UTC day boundary in Taiwan time (UTC+8) = **每日 08:00 台灣本地時間**

## Goals / Non-Goals

**Goals:**
- HomePage `🎟️ N / 99` chip shows when the next free ticket arrives, in Taiwan-friendly wording
- HelpMenu §recruitment body quantifies the grant precisely (+1/day, cap 99, 台灣 08:00)
- Both surfaces use the same wording so players see consistent info wherever they look
- Helper logic isolated and testable (pure function, deterministic, no React)

**Non-Goals:**
- Migrate `refreshDailyTickets` to local-timezone epoch (deferred per F1-skip decision; would require `lastRefreshDay` reinterpretation across all existing saves + 1-time silent over/under-grant for 8-hour edge band; not worth the risk for a UX bug)
- Add a separate countdown widget / progress ring / "next free ticket in 6h 32m" precision (overkill — players need "明日 08:00" not minute-precision)
- Refactor `RecruitmentBanner` per-subject — daily ticket is global, doesn't belong in per-banner UI
- Add toast when daily ticket grants — players who reload mid-morning will get +1 silently; they can verify via the countdown chip; surfacing every silent grant via toast pollutes the toast queue

## Decisions

**D1: Compute next-refresh time in Taiwan local time, regardless of user's actual timezone.** `refreshDailyTickets` uses UTC math, but Taiwan is the dogfood target audience and 100% of current users are in UTC+8. Hard-code Taiwan time (`Asia/Taipei` / UTC+8) in the display helper. Alternative considered (auto-detect user TZ via `Intl.DateTimeFormat().resolvedOptions().timeZone`) — rejected because (a) a player in EU would see the chip say "08:00 your local time" but tickets actually grant at UTC midnight = local EU 01:00, so showing local-local time is *wrong*; (b) showing "08:00 Asia/Taipei" or implicit-Taiwan everywhere is correct for our actual users and acceptable footnote-quality for future i18n.

**D2: "今日 08:00" vs "明日 08:00" label.** Helper checks Taiwan-local hour: if Taiwan time is past 08:00 → next refresh is *tomorrow* 08:00; if before 08:00 → next refresh is *today* 08:00. Either way the displayed time is the same string `08:00`; the prefix word ("今日" / "明日") flips.

**D3: Cap-99 edge case.** When `available === TICKET_CAP`, the daily refresh still updates `lastRefreshDay` but grants 0 new tickets (the `min(delta, 99 - available)` clause). Showing "明日 08:00 +1" when the player is at cap would be misleading — they won't get +1 because the cap clamps. Helper returns `已滿` instead in that case. After the player rolls (drops to ≤98), the next display update reverts to the countdown suffix.

**D4: title tooltip carries the full explanation.** Inline text `· 明日 08:00 +1` is terse — hover/long-press tooltip reads e.g. `每日台灣早上 08:00 自動發放 +1 張免費招募券，持有上限 99 張`. This way new players who don't know the system can drill in via hover; experienced players just glance at the inline text.

**D5: Helper function lives in a new file `lib/daily-ticket.ts`.** Pure function, no React imports, testable. Take `now: Date` as parameter (not `new Date()` internally) so tests can pass any fixed time. Take `available: number` and `cap: number` separately (not just a boolean "atCap") so the helper signature stays readable.

**D6: Spec sub-clause placement.** For `recruitment-gacha`: under the existing「Recruitment ticket SHALL be the sole gating resource」 Req (which already governs daily refresh + cap). For `hospital-tutorial`: extend the existing 2 copy-drift sub-clauses (from `fix-helpmenu-copy-stale`) with a 3rd one specifically for §recruitment quantification.

## Risks / Trade-offs

- **[Risk] Player travels to a different timezone (Europe / US) and sees "明日 08:00" but their local clock is 01:00 / 18:00** → Mitigation: tooltip says "台灣早上 08:00" so the player understands it's Taipei-referenced. International players are < 1% of current dogfood audience.
- **[Risk] DST or future timezone law change in Taiwan** → Taiwan doesn't observe DST; hasn't changed in 50+ years. If law changes we update the constant. Not a realistic concern.
- **[Risk] Inline text wraps to a second line on narrow mobile** → Header meta row already wraps at narrow viewport due to 6 nav links; adding ~10 chars to ticket-counter won't materially change wrap behavior. Confirm in Chrome MCP smoke.
- **[Trade-off] Could pre-format the time using `Intl.DateTimeFormat('zh-TW', {timeZone: 'Asia/Taipei', ...})` to render localized "上午 8 時"** — rejected; `08:00` is universally readable, more compact, no library dependency on intl tables.

## Migration Plan

- Single commit on `track-m2`; no schema change, no migration, no rollback.
- F2 + F3 ship together so the two surfaces stay in sync.

## Open Questions

- None.
